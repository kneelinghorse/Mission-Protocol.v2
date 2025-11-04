import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { dirname } from 'path';

import {
  ContextPropagatorConfig,
  ContextStrategy,
  SubMissionResult,
} from './context-propagator';
import { ContextPropagatorV3, ContextSummaryV3 } from './context-propagator-v3';
import { MissionHistoryAnalyzer, MissionHistoryEvent } from './mission-history';
import {
  RSIPLoopHandlers,
  RSIPLoopOptions,
  RSIPLoopSummary,
  RSIPStopReason,
  runRSIPLoop,
} from './rsip-loop';

export type MissionStatus = 'queued' | 'current' | 'in_progress' | 'completed' | 'blocked' | 'paused';
export type MissionPhase = 'idle' | 'planning' | 'execution' | 'review' | 'blocked' | 'completed';

export interface AgenticMissionEvent {
  ts: string;
  type:
    | 'mission_started'
    | 'mission_completed'
    | 'mission_paused'
    | 'mission_resumed'
    | 'phase_transition'
    | 'context_propagated'
    | 'sub_mission_recorded'
    | 'query_built'
    | 'workflow_routed'
    | 'self_improvement_run';
  payload?: Record<string, unknown>;
}

export interface StoredSubMissionResult {
  missionId: string;
  input: string;
  output: string;
  status: 'success' | 'failed';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface MissionContextSnapshot {
  generatedAt: string;
  summary: ContextSummaryV3;
}

export interface DynamicQuerySnapshot {
  generatedAt: string;
  query: string;
  baseQuery: string;
  historyEvents: MissionHistoryEvent[];
}

export interface MissionRSIPIterationSnapshot {
  index: number;
  improvementScore: number;
  summary?: string;
}

export interface MissionRSIPRunSnapshot {
  startedAt: string;
  completedAt: string;
  converged: boolean;
  reason: RSIPStopReason;
  iterations: MissionRSIPIterationSnapshot[];
}

export interface MissionRSIPMetrics {
  runs: number;
  totalIterations: number;
  lastRun?: MissionRSIPRunSnapshot;
}

export interface MissionState {
  missionId: string;
  phase: MissionPhase;
  status: MissionStatus;
  objective?: string;
  currentSubMission?: string;
  startedAt?: string;
  updatedAt: string;
  completedAt?: string;
  notes?: string;
  tags?: string[];
  lastContext?: MissionContextSnapshot;
  lastDynamicQuery?: DynamicQuerySnapshot;
  history: AgenticMissionEvent[];
  subMissions: StoredSubMissionResult[];
  metadata?: Record<string, unknown>;
  rsipMetrics?: MissionRSIPMetrics;
}

export interface WorkflowState {
  activeMission?: string;
  queue: string[];
  completed: string[];
  paused: string[];
}

export interface AgenticStateSnapshot {
  version: number;
  lastUpdated: string;
  missions: Record<string, MissionState>;
  workflow: WorkflowState;
}

export interface MissionStateManagerOptions {
  statePath?: string;
  clock?: () => Date;
}

interface PersistedAgenticState {
  version?: number;
  lastUpdated?: string;
  missions?: Record<string, Partial<MissionState>>;
  workflow?: Partial<WorkflowState>;
}

const DEFAULT_STATE_PATH = 'cmos/context/agentic_state.json';
const DEFAULT_SESSIONS_PATH = 'cmos/SESSIONS.jsonl';

function createMissionState(missionId: string, now: string): MissionState {
  return {
    missionId,
    phase: 'idle',
    status: 'queued',
    updatedAt: now,
    history: [],
    subMissions: [],
  };
}

function cloneState<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function removeValue(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}

function normalizeRSIPMetrics(
  metrics: Partial<MissionRSIPMetrics> | undefined,
  fallbackTimestamp: string
): MissionRSIPMetrics | undefined {
  if (!metrics) {
    return undefined;
  }

  const safeRuns =
    typeof metrics.runs === 'number' && Number.isFinite(metrics.runs) && metrics.runs >= 0
      ? Math.floor(metrics.runs)
      : 0;
  const safeIterations =
    typeof metrics.totalIterations === 'number' &&
    Number.isFinite(metrics.totalIterations) &&
    metrics.totalIterations >= 0
      ? Math.floor(metrics.totalIterations)
      : 0;

  let lastRun: MissionRSIPRunSnapshot | undefined;
  if (metrics.lastRun) {
    const persisted = metrics.lastRun;
    const normalizeReason = (reason: unknown): RSIPStopReason => {
      if (reason === 'disabled' || reason === 'converged' || reason === 'max_iterations') {
        return reason;
      }
      if (reason === 'error') {
        return 'error';
      }
      return 'max_iterations';
    };

    const iterations: MissionRSIPIterationSnapshot[] = Array.isArray(persisted.iterations)
      ? persisted.iterations.map((entry, index) => ({
          index:
            typeof entry?.index === 'number' && Number.isFinite(entry.index)
              ? Math.max(1, Math.floor(entry.index))
              : index + 1,
          improvementScore:
            typeof entry?.improvementScore === 'number' ? entry.improvementScore : 0,
          summary: typeof entry?.summary === 'string' ? entry.summary : undefined,
        }))
      : [];

    lastRun = {
      startedAt:
        typeof persisted.startedAt === 'string' && persisted.startedAt.length > 0
          ? persisted.startedAt
          : fallbackTimestamp,
      completedAt:
        typeof persisted.completedAt === 'string' && persisted.completedAt.length > 0
          ? persisted.completedAt
          : fallbackTimestamp,
      converged: Boolean(persisted.converged),
      reason: normalizeReason(persisted.reason),
      iterations,
    };
  }

  return {
    runs: safeRuns,
    totalIterations: safeIterations,
    lastRun,
  };
}

export class MissionStateManager {
  private readonly statePath: string;
  private readonly clock: () => Date;
  private cachedState: AgenticStateSnapshot | null = null;

  constructor(options: MissionStateManagerOptions = {}) {
    this.statePath = options.statePath ?? DEFAULT_STATE_PATH;
    this.clock = options.clock ?? (() => new Date());
  }

  async getState(): Promise<AgenticStateSnapshot> {
    const state = await this.ensureState();
    return cloneState(state);
  }

  async getMission(missionId: string): Promise<MissionState | undefined> {
    const state = await this.ensureState();
    const mission = state.missions[missionId];
    return mission ? (cloneState(mission) as MissionState) : undefined;
  }

  async update(mutator: (state: AgenticStateSnapshot) => void): Promise<AgenticStateSnapshot> {
    const state = await this.ensureState();
    mutator(state);
    state.lastUpdated = this.nowIso();
    await this.persist(state);
    return cloneState(state);
  }

  private async ensureState(): Promise<AgenticStateSnapshot> {
    if (this.cachedState) {
      return this.cachedState;
    }

    this.cachedState = await this.loadFromDisk();
    return this.cachedState;
  }

  private async loadFromDisk(): Promise<AgenticStateSnapshot> {
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      if (raw.trim().length === 0) {
        return this.createEmptyState();
      }

      const parsed = JSON.parse(raw) as PersistedAgenticState;
      return this.normalize(parsed);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code !== 'ENOENT') {
        throw error;
      }
      return this.createEmptyState();
    }
  }

  private normalize(state: PersistedAgenticState): AgenticStateSnapshot {
    const now = this.nowIso();

    const workflow: WorkflowState = {
      activeMission: state.workflow?.activeMission,
      queue: state.workflow?.queue ? [...state.workflow.queue] : [],
      completed: state.workflow?.completed ? [...state.workflow.completed] : [],
      paused: state.workflow?.paused ? [...state.workflow.paused] : [],
    };

    const missions: Record<string, MissionState> = {};
    for (const [missionId, mission] of Object.entries(state.missions ?? {})) {
      missions[missionId] = {
        missionId,
        phase: mission.phase ?? 'idle',
        status: mission.status ?? 'queued',
        objective: mission.objective,
        currentSubMission: mission.currentSubMission,
        startedAt: mission.startedAt,
        updatedAt: mission.updatedAt ?? now,
        completedAt: mission.completedAt,
        notes: mission.notes,
        tags: mission.tags ? [...mission.tags] : undefined,
        lastContext: mission.lastContext as MissionContextSnapshot | undefined,
        lastDynamicQuery: mission.lastDynamicQuery as DynamicQuerySnapshot | undefined,
        history: Array.isArray(mission.history)
          ? (mission.history as AgenticMissionEvent[]).map((entry) => ({ ...entry }))
          : [],
        subMissions: Array.isArray(mission.subMissions)
          ? (mission.subMissions as StoredSubMissionResult[]).map((entry) => ({ ...entry }))
          : [],
        metadata: mission.metadata ? { ...mission.metadata } : undefined,
        rsipMetrics: normalizeRSIPMetrics(mission.rsipMetrics, now),
      };
    }

    return {
      version: state.version ?? 1,
      lastUpdated: state.lastUpdated ?? now,
      missions,
      workflow,
    };
  }

  private createEmptyState(): AgenticStateSnapshot {
    const now = this.nowIso();
    return {
      version: 1,
      lastUpdated: now,
      missions: {},
      workflow: {
        queue: [],
        completed: [],
        paused: [],
      },
    };
  }

  private async persist(state: AgenticStateSnapshot): Promise<void> {
    const directory = dirname(this.statePath);
    await fs.mkdir(directory, { recursive: true });

    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(state, null, 2);

    await fs.writeFile(tempPath, payload, 'utf-8');
    await fs.rename(tempPath, this.statePath);
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}

export interface AgenticControllerOptions {
  statePath?: string;
  sessionsPath?: string;
  contextConfig?: ContextPropagatorConfig;
  propagator?: ContextPropagatorV3;
  historyAnalyzer?: MissionHistoryAnalyzer;
  clock?: () => Date;
  historyLimit?: number;
  autoPropagationPhases?: MissionPhase[];
}

export interface WorkflowRegistrationOptions {
  resetQueue?: boolean;
}

export interface StartMissionOptions {
  objective?: string;
  currentSubMission?: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  phase?: MissionPhase;
}

export interface CompleteMissionOptions {
  summary?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface PauseMissionOptions {
  note?: string;
}

export interface UpdatePhaseOptions {
  reason?: string;
  currentSubMission?: string;
  autoPropagate?: boolean;
}

export interface RecordSubMissionOptions {
  dedupe?: boolean;
  autoPropagate?: boolean;
}

export interface DynamicQueryOptions {
  includeContextSummary?: boolean;
  historyLimit?: number;
  supplementalContext?: string;
}

export interface PhaseTransitionEvent {
  missionId: string;
  from: MissionPhase;
  to: MissionPhase;
  ts: string;
  reason?: string;
}

export interface ContextUpdateEvent {
  missionId: string;
  context: MissionContextSnapshot;
}

export interface QueryReadyEvent {
  missionId: string;
  query: string;
  baseQuery: string;
  generatedAt: string;
}

export interface WorkflowAdvanceEvent {
  missionId: string;
  ts: string;
}

export interface MissionLifecycleEvent {
  missionId: string;
  ts: string;
  note?: string;
}

type AgenticEventMap = {
  stateChanged: AgenticStateSnapshot;
  phaseTransition: PhaseTransitionEvent;
  contextUpdated: ContextUpdateEvent;
  queryReady: QueryReadyEvent;
  workflowAdvanced: WorkflowAdvanceEvent;
  missionPaused: MissionLifecycleEvent;
  missionResumed: MissionLifecycleEvent;
  selfImprovementRun: {
    missionId: string;
    summary: MissionRSIPRunSnapshot;
  };
};

export class AgenticController {
  private readonly stateManager: MissionStateManager;
  private readonly historyAnalyzer: MissionHistoryAnalyzer;
  private readonly propagator: ContextPropagatorV3;
  private readonly clock: () => Date;
  private readonly emitter = new EventEmitter();
  private readonly historyLimit: number;
  private readonly autoPropagationPhases: Set<MissionPhase>;

  constructor(options: AgenticControllerOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.stateManager = new MissionStateManager({
      statePath: options.statePath,
      clock: this.clock,
    });

    const sessionsPath = options.sessionsPath ?? DEFAULT_SESSIONS_PATH;
    this.historyAnalyzer =
      options.historyAnalyzer ??
      new MissionHistoryAnalyzer({
        sessionsPath,
      });

    this.propagator =
      options.propagator ??
      new ContextPropagatorV3(
        options.contextConfig ?? { maxContextTokens: 4096, strategy: 'map-reduce' },
        this.historyAnalyzer
      );

    this.historyLimit = options.historyLimit ?? 5;
    this.autoPropagationPhases = new Set(
      options.autoPropagationPhases ?? ['execution', 'review']
    );
  }

  on<K extends keyof AgenticEventMap>(
    event: K,
    listener: (payload: AgenticEventMap[K]) => void
  ): this {
    this.emitter.on(event, listener as (payload: unknown) => void);
    return this;
  }

  off<K extends keyof AgenticEventMap>(
    event: K,
    listener: (payload: AgenticEventMap[K]) => void
  ): this {
    this.emitter.off(event, listener as (payload: unknown) => void);
    return this;
  }

  once<K extends keyof AgenticEventMap>(
    event: K,
    listener: (payload: AgenticEventMap[K]) => void
  ): this {
    this.emitter.once(event, listener as (payload: unknown) => void);
    return this;
  }

  async getState(): Promise<AgenticStateSnapshot> {
    return this.stateManager.getState();
  }

  async getMissionState(missionId: string): Promise<MissionState | undefined> {
    return this.stateManager.getMission(missionId);
  }

  async registerWorkflow(
    missionIds: string[],
    options: WorkflowRegistrationOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const uniqueIds = Array.from(new Set(missionIds.filter(Boolean)));

    const state = await this.stateManager.update((snapshot) => {
      if (options.resetQueue) {
        snapshot.workflow.queue = [...uniqueIds];
      } else {
        for (const missionId of uniqueIds) {
          if (
            missionId !== snapshot.workflow.activeMission &&
            !snapshot.workflow.queue.includes(missionId)
          ) {
            snapshot.workflow.queue.push(missionId);
          }
        }
      }

      for (const missionId of uniqueIds) {
        if (!snapshot.missions[missionId]) {
          snapshot.missions[missionId] = createMissionState(missionId, now);
        }
      }
    });

    this.emit('stateChanged', state);
    return state;
  }

  async advanceWorkflow(): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const currentState = await this.stateManager.getState();
    const activeMissionId = currentState.workflow.activeMission;

    if (activeMissionId) {
      const activeMission = currentState.missions[activeMissionId];
      if (
        activeMission &&
        activeMission.status !== 'completed' &&
        activeMission.status !== 'blocked'
      ) {
        return currentState;
      }
    }

    const state = await this.stateManager.update((snapshot) => {
      const previousActive = snapshot.workflow.activeMission;
      if (previousActive) {
        snapshot.workflow.activeMission = undefined;
        snapshot.workflow.completed = ensureUnique(snapshot.workflow.completed, previousActive);
      }

      const nextMissionId = snapshot.workflow.queue.shift();
      if (!nextMissionId) {
        return;
      }

      const mission =
        snapshot.missions[nextMissionId] ?? createMissionState(nextMissionId, now);

      const priorPhase = mission.phase;
      if (mission.phase === 'idle') {
        mission.phase = 'planning';
      }
      if (mission.status === 'queued') {
        mission.status = 'current';
      }
      mission.updatedAt = now;
      mission.history.push(
        this.buildMissionEvent('workflow_routed', now, {
          from: priorPhase,
          to: mission.phase,
        })
      );

      snapshot.missions[nextMissionId] = mission;
      snapshot.workflow.activeMission = nextMissionId;
    });

    if (state.workflow.activeMission) {
      this.emit('workflowAdvanced', { missionId: state.workflow.activeMission, ts: now });
    }
    this.emit('stateChanged', state);
    return state;
  }

  async startMission(
    missionId: string,
    options: StartMissionOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const previous = await this.stateManager.getMission(missionId);
    const previousPhase = previous?.phase ?? 'idle';

    const state = await this.stateManager.update((snapshot) => {
      const mission =
        snapshot.missions[missionId] ?? createMissionState(missionId, now);

      const fromPhase = mission.phase;
      const toPhase = options.phase ?? 'execution';
      const phaseChanged = fromPhase !== toPhase;

      mission.phase = toPhase;
      mission.status = 'in_progress';
      mission.objective = options.objective ?? mission.objective;
      mission.currentSubMission = options.currentSubMission ?? mission.currentSubMission;
      mission.notes = options.notes ?? mission.notes;
      mission.tags = options.tags ?? mission.tags;
      mission.metadata = options.metadata ?? mission.metadata;
      mission.startedAt = mission.startedAt ?? now;
      mission.updatedAt = now;

      mission.history.push(
        this.buildMissionEvent('mission_started', now, {
          currentSubMission: mission.currentSubMission,
        })
      );

      if (phaseChanged) {
        mission.history.push(
          this.buildMissionEvent('phase_transition', now, {
            from: fromPhase,
            to: toPhase,
            reason: 'mission_start',
          })
        );
      }

      snapshot.missions[missionId] = mission;
      snapshot.workflow.activeMission = missionId;
      snapshot.workflow.queue = removeValue(snapshot.workflow.queue, missionId);
      snapshot.workflow.paused = removeValue(snapshot.workflow.paused, missionId);
    });

    const currentPhase = state.missions[missionId]?.phase ?? previousPhase;
    if (currentPhase !== previousPhase) {
      this.emit('phaseTransition', {
        missionId,
        from: previousPhase,
        to: currentPhase,
        ts: now,
        reason: 'mission_start',
      });
    }

    this.emit('stateChanged', state);
    return state;
  }

  async updatePhase(
    missionId: string,
    phase: MissionPhase,
    options: UpdatePhaseOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const previous = await this.stateManager.getMission(missionId);
    const previousPhase = previous?.phase ?? 'idle';

    const state = await this.stateManager.update((snapshot) => {
      const mission =
        snapshot.missions[missionId] ?? createMissionState(missionId, now);
      const fromPhase = mission.phase;

      mission.phase = phase;
      mission.currentSubMission = options.currentSubMission ?? mission.currentSubMission;
      mission.updatedAt = now;

      if (fromPhase !== phase) {
        mission.history.push(
          this.buildMissionEvent('phase_transition', now, {
            from: fromPhase,
            to: phase,
            reason: options.reason,
          })
        );
      }

      snapshot.missions[missionId] = mission;
    });

    if (phase !== previousPhase) {
      this.emit('phaseTransition', {
        missionId,
        from: previousPhase,
        to: phase,
        ts: now,
        reason: options.reason,
      });
    }
    this.emit('stateChanged', state);

    const shouldPropagate =
      options.autoPropagate ?? this.autoPropagationPhases.has(phase);
    if (shouldPropagate) {
      await this.triggerContextPropagation(missionId);
    }

    return state;
  }

  async recordSubMissionResult(
    missionId: string,
    result: SubMissionResult,
    options: RecordSubMissionOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const stored: StoredSubMissionResult = {
      missionId: result.missionId,
      input: result.input,
      output: result.output,
      status: result.status,
      timestamp: result.timestamp.toISOString(),
      metadata: result.metadata,
    };

    const state = await this.stateManager.update((snapshot) => {
      const mission =
        snapshot.missions[missionId] ?? createMissionState(missionId, now);

      const shouldDedupe = options.dedupe !== false;
      if (shouldDedupe) {
        const exists = mission.subMissions.some(
          (entry) =>
            entry.missionId === stored.missionId && entry.timestamp === stored.timestamp
        );
        if (!exists) {
          mission.subMissions.push(stored);
        }
      } else {
        mission.subMissions.push(stored);
      }

      mission.history.push(
        this.buildMissionEvent('sub_mission_recorded', now, {
          subMissionId: stored.missionId,
          status: stored.status,
        })
      );
      mission.updatedAt = now;

      snapshot.missions[missionId] = mission;
    });

    this.emit('stateChanged', state);

    if (options.autoPropagate) {
      await this.triggerContextPropagation(missionId);
    }

    return state;
  }

  async completeMission(
    missionId: string,
    options: CompleteMissionOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const now = this.nowIso();
    const previous = await this.stateManager.getMission(missionId);
    const previousPhase = previous?.phase ?? 'idle';

    const state = await this.stateManager.update((snapshot) => {
      const mission =
        snapshot.missions[missionId] ?? createMissionState(missionId, now);
      const fromPhase = mission.phase;

      mission.phase = 'completed';
      mission.status = 'completed';
      mission.completedAt = now;
      mission.updatedAt = now;
      mission.notes = options.notes ?? mission.notes;
      mission.metadata = options.metadata ?? mission.metadata;

      mission.history.push(
        this.buildMissionEvent('mission_completed', now, {
          summary: options.summary,
        })
      );

      if (fromPhase !== 'completed') {
        mission.history.push(
          this.buildMissionEvent('phase_transition', now, {
            from: fromPhase,
            to: 'completed',
            reason: 'mission_completed',
          })
        );
      }

      snapshot.missions[missionId] = mission;
      if (snapshot.workflow.activeMission === missionId) {
        snapshot.workflow.activeMission = undefined;
      }
      snapshot.workflow.completed = ensureUnique(snapshot.workflow.completed, missionId);
    });

    const currentPhase = state.missions[missionId]?.phase ?? previousPhase;
    if (currentPhase !== previousPhase) {
      this.emit('phaseTransition', {
        missionId,
        from: previousPhase,
        to: currentPhase,
        ts: now,
        reason: 'mission_completed',
      });
    }

    this.emit('stateChanged', state);
    return state;
  }

  async pauseMission(
    missionId: string,
    options: PauseMissionOptions = {}
  ): Promise<AgenticStateSnapshot> {
    const current = await this.stateManager.getMission(missionId);
    if (!current || current.status === 'paused') {
      return this.stateManager.getState();
    }

    const now = this.nowIso();
    const state = await this.stateManager.update((snapshot) => {
      const mission = snapshot.missions[missionId];
      /* istanbul ignore if -- mission presence guaranteed by pre-check */
      if (!mission) {
        return;
      }

      mission.status = 'paused';
      mission.updatedAt = now;
      mission.history.push(
        this.buildMissionEvent('mission_paused', now, {
          note: options.note,
        })
      );

      snapshot.workflow.paused = ensureUnique(snapshot.workflow.paused, missionId);
      if (snapshot.workflow.activeMission === missionId) {
        snapshot.workflow.activeMission = undefined;
      }
    });

    this.emit('missionPaused', { missionId, ts: now, note: options.note });
    this.emit('stateChanged', state);
    return state;
  }

  async resumeMission(missionId: string): Promise<AgenticStateSnapshot> {
    const current = await this.stateManager.getMission(missionId);
    if (!current || current.status !== 'paused') {
      return this.stateManager.getState();
    }

    const now = this.nowIso();
    const state = await this.stateManager.update((snapshot) => {
      const mission = snapshot.missions[missionId];
      /* istanbul ignore if -- mission presence guaranteed by pre-check */
      if (!mission) {
        return;
      }

      mission.status = 'in_progress';
      if (mission.phase === 'idle') {
        mission.phase = 'execution';
      }
      mission.updatedAt = now;
      mission.history.push(this.buildMissionEvent('mission_resumed', now));

      snapshot.workflow.activeMission = missionId;
      snapshot.workflow.paused = removeValue(snapshot.workflow.paused, missionId);
    });

    this.emit('missionResumed', { missionId, ts: now });
    this.emit('stateChanged', state);
    return state;
  }

  async runSelfImprovementLoop<TState>(
    missionId: string,
    handlers: RSIPLoopHandlers<TState>,
    options?: RSIPLoopOptions
  ): Promise<RSIPLoopSummary<TState>> {
    const mergedOptions: RSIPLoopOptions = {
      ...(options ?? {}),
      telemetrySource: options?.telemetrySource ?? `RSIP:${missionId}`,
      clock: options?.clock ?? this.clock,
    };

    const loopSummary = await runRSIPLoop(handlers, mergedOptions);
    const state = await this.stateManager.update((snapshot) => {
      const mission =
        snapshot.missions[missionId] ?? createMissionState(missionId, loopSummary.startedAt);
      const previous = mission.rsipMetrics ?? { runs: 0, totalIterations: 0 };

      mission.rsipMetrics = {
        runs: previous.runs + 1,
        totalIterations: previous.totalIterations + loopSummary.iterations.length,
        lastRun: {
          startedAt: loopSummary.startedAt,
          completedAt: loopSummary.completedAt,
          converged: loopSummary.converged,
          reason: loopSummary.reason,
          iterations: loopSummary.iterations.map((iteration, index) => ({
            index: index + 1,
            improvementScore: iteration.improvementScore,
            summary: iteration.summary,
          })),
        },
      };

      mission.history.push(
        this.buildMissionEvent('self_improvement_run', loopSummary.completedAt, {
          iterations: loopSummary.iterations.length,
          converged: loopSummary.converged,
          reason: loopSummary.reason,
        })
      );
      mission.updatedAt = loopSummary.completedAt;
      snapshot.missions[missionId] = mission;
    });

    const mission = state.missions[missionId];
    if (mission?.rsipMetrics?.lastRun) {
      this.emit('selfImprovementRun', { missionId, summary: mission.rsipMetrics.lastRun });
    }

    this.emit('stateChanged', state);
    return loopSummary;
  }

  async buildDynamicQuery(
    missionId: string,
    baseQuery: string,
    options: DynamicQueryOptions = {}
  ): Promise<string> {
    const historyLimit = options.historyLimit ?? this.historyLimit;
    const events = await this.historyAnalyzer.loadEvents();
    const relevantEvents = events
      .filter((event) => event.mission === missionId)
      .slice(-historyLimit);

    const state = await this.stateManager.getState();
    const mission = state.missions[missionId] ?? createMissionState(missionId, this.nowIso());
    const lines: string[] = [];

    lines.push(`Mission ${missionId} Agentic Query`);
    if (mission.objective) {
      lines.push(`Objective: ${mission.objective}`);
    }
    lines.push(`Status: ${mission.status}`);
    lines.push(`Phase: ${mission.phase}`);
    if (mission.currentSubMission) {
      lines.push(`Active Sub-Mission: ${mission.currentSubMission}`);
    }

    const includeSummary = options.includeContextSummary ?? true;
    if (includeSummary && mission.lastContext) {
      lines.push(`Latest Context Summary (${mission.lastContext.generatedAt}):`);
      lines.push(mission.lastContext.summary.summary);
    }

    if ((!includeSummary || !mission.lastContext) && options.supplementalContext) {
      lines.push('Supplemental Context:');
      lines.push(options.supplementalContext);
    }

    if (relevantEvents.length > 0) {
      lines.push('Recent Mission History:');
      for (const event of relevantEvents) {
        const parts: string[] = [`[${event.ts}]`, event.action.toUpperCase()];
        if (event.status) {
          parts.push(`(${event.status})`);
        }
        if (event.summary) {
          parts.push(`→ ${event.summary}`);
        }
        if (event.next_hint) {
          parts.push(`next: ${event.next_hint}`);
        }
        lines.push(parts.join(' '));
      }
    }

    lines.push('Primary Prompt:');
    lines.push(baseQuery.trim());

    const query = lines.join('\n');
    const generatedAt = this.nowIso();
    const snapshot: DynamicQuerySnapshot = {
      generatedAt,
      query,
      baseQuery,
      historyEvents: relevantEvents,
    };

    const updatedState = await this.stateManager.update((mutable) => {
      const target =
        mutable.missions[missionId] ?? createMissionState(missionId, generatedAt);
      target.lastDynamicQuery = snapshot;
      target.history.push(
        this.buildMissionEvent('query_built', generatedAt, {
          historyCount: relevantEvents.length,
        })
      );
      target.updatedAt = generatedAt;
      mutable.missions[missionId] = target;
    });

    this.emit('queryReady', { missionId, query, baseQuery, generatedAt });
    this.emit('stateChanged', updatedState);
    return query;
  }

  private async triggerContextPropagation(missionId: string): Promise<void> {
    const state = await this.stateManager.getState();
    const mission = state.missions[missionId];
    /* istanbul ignore if -- mission existence ensured before propagation */
    if (!mission) {
      return;
    }

    const completedResults: SubMissionResult[] = mission.subMissions.map((entry) => ({
      missionId: entry.missionId,
      input: entry.input,
      output: entry.output,
      status: entry.status,
      timestamp: new Date(entry.timestamp),
      metadata: entry.metadata,
    }));

    const relatedMissionIds = this.collectRelatedMissionIds(state, missionId);

    const summary = await this.propagator.propagateContext(
      mission.objective ?? missionId,
      completedResults,
      mission.currentSubMission ?? missionId,
      {
        includeHistory: true,
        relatedMissionIds,
      }
    );

    const generatedAt = this.nowIso();
    const contextSnapshot: MissionContextSnapshot = {
      generatedAt,
      summary,
    };

    const updatedState = await this.stateManager.update((mutable) => {
      const target =
        mutable.missions[missionId] ?? createMissionState(missionId, generatedAt);
      target.lastContext = contextSnapshot;
      target.history.push(
        this.buildMissionEvent('context_propagated', generatedAt, {
          strategy: summary.strategy,
          tokenCount: summary.tokenCount,
          retrievedChunks: summary.retrievedChunks.length,
        })
      );
      target.updatedAt = generatedAt;
      mutable.missions[missionId] = target;
    });

    this.emit('contextUpdated', { missionId, context: contextSnapshot });
    this.emit('stateChanged', updatedState);
  }

  private collectRelatedMissionIds(
    state: AgenticStateSnapshot,
    missionId: string
  ): string[] {
    const related = [
      ...state.workflow.completed.slice(-3),
      ...state.workflow.queue.slice(0, 2),
    ].filter((id) => id && id !== missionId);

    return Array.from(new Set(related));
  }

  private buildMissionEvent(
    type: AgenticMissionEvent['type'],
    ts: string,
    payload?: Record<string, unknown>
  ): AgenticMissionEvent {
    return {
      ts,
      type,
      payload,
    };
  }

  private emit<K extends keyof AgenticEventMap>(event: K, payload: AgenticEventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  private nowIso(): string {
    return this.clock().toISOString();
  }
}
