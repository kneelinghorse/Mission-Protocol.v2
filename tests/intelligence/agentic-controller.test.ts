import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  AgenticController,
  MissionStateManager,
  MissionRSIPRunSnapshot,
} from '../../src/intelligence/agentic-controller';
import { SubMissionResult } from '../../src/intelligence/context-propagator';
import { MissionHistoryEvent } from '../../src/intelligence/mission-history';
import { ContextPropagatorV3, ContextSummaryV3 } from '../../src/intelligence/context-propagator-v3';

const createTempEnvironment = async (): Promise<{
  baseDir: string;
  statePath: string;
  sessionsPath: string;
}> => {
  const baseDir = await fs.mkdtemp(join(tmpdir(), 'agentic-controller-'));
  const statePath = join(baseDir, 'state.json');
  const sessionsPath = join(baseDir, 'sessions.jsonl');
  await fs.writeFile(sessionsPath, '', 'utf-8');
  return { baseDir, statePath, sessionsPath };
};

const removeTempDir = async (dir: string): Promise<void> => {
  await fs.rm(dir, { recursive: true, force: true });
};

const createPropagatorStub = () => {
  const propagateContext = jest.fn<
    Promise<ContextSummaryV3>,
    Parameters<ContextPropagatorV3['propagateContext']>
  >(async (originalMission, completedResults, currentSubMission) => ({
    originalMission,
    completedSteps: completedResults,
    summary: `Context for ${currentSubMission}`,
    tokenCount: 128,
    strategy: 'map-reduce',
    historyHighlights: [],
    retrievedChunks: [],
    retrievalStats: {
      totalChunks: completedResults.length,
      topK: 4,
      sparseWeight: 0.5,
      denseWeight: 0.5,
    },
  }));

  return {
    propagator: {
      propagateContext,
    } as unknown as ContextPropagatorV3,
    propagateContext,
  };
};

const writeSessions = async (
  sessionsPath: string,
  events: MissionHistoryEvent[]
): Promise<void> => {
  const lines = events.map((event) => JSON.stringify(event));
  await fs.writeFile(sessionsPath, `${lines.join('\n')}\n`, 'utf-8');
};

describe('AgenticController', () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all(tempDirs.map((dir) => removeTempDir(dir)));
    tempDirs = [];
  });

  it('orchestrates multi-mission workflow routing', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:10:00Z'),
    });

    await controller.registerWorkflow(['B6.4', 'B6.5'], { resetQueue: true });

    let state = await controller.advanceWorkflow();
    expect(state.workflow.activeMission).toBe('B6.4');

    await controller.startMission('B6.4', {
      objective: 'Build agentic controller',
    });
    const activeMission = await controller.getMissionState('B6.4');
    expect(activeMission?.status).toBe('in_progress');
    expect(activeMission?.phase).toBe('execution');

    await controller.completeMission('B6.4', { summary: 'Controller delivered' });
    const completedMission = await controller.getMissionState('B6.4');
    expect(completedMission?.status).toBe('completed');
    expect(completedMission?.phase).toBe('completed');

    state = await controller.advanceWorkflow();
    expect(state.workflow.activeMission).toBe('B6.5');
    const promotedMission = await controller.getMissionState('B6.5');
    expect(promotedMission?.status).toBe('current');
  });

  it('appends workflow missions without reset and skips duplicates', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:11:00Z'),
    });

    await controller.registerWorkflow(['B6.4'], { resetQueue: true });
    await controller.registerWorkflow(['B6.4', 'B6.5', 'B6.6']);

    const state = await controller.getState();
    expect(state.workflow.queue).toEqual(['B6.4', 'B6.5', 'B6.6']);
    expect(state.missions['B6.5']).toBeDefined();
    expect(state.missions['B6.6']).toBeDefined();
  });

  it('does not advance workflow while active mission remains in progress', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    let tick = 0;
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date(Date.parse('2025-10-29T02:12:00Z') + tick++ * 60000),
    });

    await controller.registerWorkflow(['B6.4', 'B6.5'], { resetQueue: true });
    await controller.advanceWorkflow();
    await controller.startMission('B6.4');

    const nextState = await controller.advanceWorkflow();
    expect(nextState.workflow.activeMission).toBe('B6.4');
    expect(nextState.workflow.queue).toEqual(['B6.5']);
  });

  it('dedupes sub-mission results by default and respects overrides', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:13:00Z'),
    });

    await controller.startMission('B6.4');

    const result: SubMissionResult = {
      missionId: 'B6.4.a',
      input: 'Collect requirements',
      output: 'Requirements captured',
      status: 'success',
      timestamp: new Date('2025-10-29T02:13:30Z'),
    };

    await controller.recordSubMissionResult('B6.4', result);
    await controller.recordSubMissionResult('B6.4', result);

    let mission = await controller.getMissionState('B6.4');
    expect(mission?.subMissions).toHaveLength(1);

    await controller.recordSubMissionResult('B6.4', result, { dedupe: false });
    mission = await controller.getMissionState('B6.4');
    expect(mission?.subMissions).toHaveLength(2);
  });

  it('triggers context propagation on phase transitions', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const initialState = {
      version: 1,
      lastUpdated: '2025-10-29T02:21:00Z',
      missions: {},
      workflow: {
        activeMission: undefined,
        queue: [],
        completed: ['B6.4', null, 'B6.1'],
        paused: [],
      },
    };
    await fs.writeFile(statePath, JSON.stringify(initialState), 'utf-8');

    const { propagator, propagateContext } = createPropagatorStub();
    let tick = 0;
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date(Date.parse('2025-10-29T02:20:00Z') + tick++ * 60000),
    });

    await controller.startMission('B6.4', {
      objective: 'Test mission',
      currentSubMission: 'B6.4.a',
    });

    const subMission: SubMissionResult = {
      missionId: 'B6.4.a',
      input: 'Investigate state manager design',
      output: 'Proposed durable state manager',
      status: 'success',
      timestamp: new Date('2025-10-29T02:25:00Z'),
    };
    await controller.recordSubMissionResult('B6.4', subMission, { autoPropagate: true });

    await controller.updatePhase('B6.4', 'review', {
      currentSubMission: 'B6.4.a',
    });

    expect(propagateContext).toHaveBeenCalledTimes(2);
    const mission = await controller.getMissionState('B6.4');
    expect(mission?.lastContext?.summary.summary).toBe('Context for B6.4.a');
    const hasContextEvent = mission?.history.some(
      (event) => event.type === 'context_propagated'
    );
    expect(hasContextEvent).toBe(true);
  });

  it('builds dynamic queries with historical context', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    let tick = 0;
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date(Date.parse('2025-10-29T02:30:00Z') + tick++ * 60000),
    });

    const history: MissionHistoryEvent[] = [
      {
        ts: '2025-10-29T01:50:00Z',
        mission: 'B6.4',
        action: 'start',
        status: 'in_progress',
        summary: 'Initial agentic controller scaffolding',
      },
      {
        ts: '2025-10-29T02:05:00Z',
        mission: 'B6.4',
        action: 'complete',
        status: 'completed',
        summary: 'State manager baseline finished',
        next_hint: 'Focus on context propagation',
      },
    ];

    await writeSessions(sessionsPath, history);

    await controller.startMission('B6.4', {
      objective: 'Deliver agentic orchestration',
      currentSubMission: 'B6.4.b',
    });

    const subMission: SubMissionResult = {
      missionId: 'B6.4.b',
      input: 'Implement context propagation triggers',
      output: 'Event-driven propagation implemented',
      status: 'success',
      timestamp: new Date('2025-10-29T02:32:00Z'),
    };
    await controller.recordSubMissionResult('B6.4', subMission);
    await controller.updatePhase('B6.4', 'review', {
      currentSubMission: 'B6.4.b',
    });

    const query = await controller.buildDynamicQuery(
      'B6.4',
      'What remaining work is required for agentic handoff?'
    );

    expect(query).toContain('Mission B6.4 Agentic Query');
    expect(query).toContain('Latest Context Summary');
    expect(query).toContain('Initial agentic controller scaffolding');
    expect(query).toContain('What remaining work is required for agentic handoff?');

    const mission = await controller.getMissionState('B6.4');
    expect(mission?.lastDynamicQuery?.query).toBe(query);
    expect(mission?.lastDynamicQuery?.historyEvents).toHaveLength(2);
  });

  it('builds dynamic queries without context summary when disabled', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:35:00Z'),
    });

    await controller.startMission('B6.4', { objective: 'Supplemental context test' });
    const query = await controller.buildDynamicQuery('B6.4', 'Summarize state manager status', {
      includeContextSummary: false,
      supplementalContext: 'Prioritize persistence validation',
    });

    expect(query).toContain('Supplemental Context:');
    expect(query).not.toContain('Latest Context Summary');
    const mission = await controller.getMissionState('B6.4');
    expect(mission?.lastDynamicQuery?.query).toBe(query);
  });

  it('persists pause and resume state across controller instances', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    let tick = 0;
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date(Date.parse('2025-10-29T02:40:00Z') + tick++ * 60000),
    });

    await controller.startMission('B6.4', { objective: 'Persist state' });
    await controller.pauseMission('B6.4', { note: 'Awaiting review sign-off' });
    const secondPause = await controller.pauseMission('B6.4', { note: 'Double-check pause' });
    const pausedMission = secondPause.missions['B6.4'];
    expect(pausedMission?.status).toBe('paused');

    const pausedState = await controller.getMissionState('B6.4');
    expect(pausedState?.status).toBe('paused');

    const rehydratedController = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date(Date.parse('2025-10-29T02:50:00Z') + tick++ * 60000),
    });

    await rehydratedController.resumeMission('B6.4');
    const redundantResume = await rehydratedController.resumeMission('B6.4');
    const redundantMission = redundantResume.missions['B6.4'];
    expect(redundantMission?.status).toBe('in_progress');
    const resumedMission = await rehydratedController.getMissionState('B6.4');
    expect(resumedMission?.status).toBe('in_progress');
    expect(resumedMission?.history.some((event) => event.type === 'mission_resumed')).toBe(
      true
    );

    const workflow = await rehydratedController.getState();
    expect(workflow.workflow.activeMission).toBe('B6.4');
  });

  it('emits workflow events to registered listeners', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:55:00Z'),
    });

    const workflowEvents: string[] = [];
    const listener = (event: { missionId: string }) => workflowEvents.push(event.missionId);

    controller.on('workflowAdvanced', listener);
    controller.once('phaseTransition', (event) => workflowEvents.push(`${event.from}->${event.to}`));

    await controller.registerWorkflow(['B6.4', 'B6.5'], { resetQueue: true });
    await controller.advanceWorkflow();
    await controller.startMission('B6.4', { phase: 'execution' });

    expect(workflowEvents).toContain('B6.4');
    expect(workflowEvents).toContain('planning->execution');

    controller.off('workflowAdvanced', listener);
    await controller.advanceWorkflow();
    expect(workflowEvents.filter((id) => id === 'B6.4')).toHaveLength(1);
  });

  it('ignores pause requests for unknown missions', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:56:00Z'),
    });

    const state = await controller.pauseMission('Z9.9');
    expect(Object.keys(state.missions)).toHaveLength(0);
  });

  it('clears completed active missions when advancing with persisted state', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const persistedState = {
      version: 1,
      lastUpdated: '2025-10-29T02:58:00Z',
      missions: {
        'B6.4': {
          missionId: 'B6.4',
          phase: 'execution',
          status: 'completed',
          updatedAt: '2025-10-29T02:57:00Z',
          completedAt: '2025-10-29T02:57:00Z',
          history: [],
          subMissions: [],
        },
      },
      workflow: {
        activeMission: 'B6.4',
        queue: ['B6.5'],
        completed: [],
        paused: [],
      },
    };

    await fs.writeFile(statePath, JSON.stringify(persistedState), 'utf-8');

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T02:59:00Z'),
    });

    const state = await controller.advanceWorkflow();
    expect(state.workflow.activeMission).toBe('B6.5');
    expect(state.workflow.completed).toContain('B6.4');
  });

  it('leaves workflow unchanged when no missions remain in the queue', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T03:00:00Z'),
    });

    const state = await controller.advanceWorkflow();
    expect(state.workflow.activeMission).toBeUndefined();
    expect(state.workflow.queue).toHaveLength(0);
  });

  it('resumes idle missions by transitioning to execution phase', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const persistedState = {
      version: 1,
      lastUpdated: '2025-10-29T03:06:00Z',
      missions: {
        'B6.4': {
          missionId: 'B6.4',
          phase: 'idle',
          status: 'paused',
          updatedAt: '2025-10-29T03:05:00Z',
          history: [],
          subMissions: [],
        },
      },
      workflow: {
        activeMission: undefined,
        queue: [],
        completed: [],
        paused: ['B6.4'],
      },
    };

    await fs.writeFile(statePath, JSON.stringify(persistedState), 'utf-8');

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T03:07:00Z'),
    });

    const state = await controller.resumeMission('B6.4');
    expect(state.workflow.activeMission).toBe('B6.4');
    const mission = await controller.getMissionState('B6.4');
    expect(mission?.phase).toBe('execution');
    expect(mission?.status).toBe('in_progress');
  });

  it('records RSIP loop runs and emits self-improvement events', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-11-04T01:00:00Z'),
    });

    const runEvents: Array<{ missionId: string; summary: MissionRSIPRunSnapshot }> = [];
    controller.on('selfImprovementRun', (payload) => {
      runEvents.push(payload);
    });

    const iterate = jest.fn(async (context) => ({
      state: { total: (context.state?.total ?? 0) + 1 },
      improvementScore: 0.2,
      summary: `iteration-${context.iteration}`,
      converged: true,
    }));

    const summary = await controller.runSelfImprovementLoop(
      'B8.3',
      { iterate },
      {
        maxIterations: 5,
        minIterations: 1,
        telemetrySource: 'rsip-test',
      }
    );

    expect(summary.converged).toBe(true);
    expect(summary.iterations).toHaveLength(1);
    expect(iterate).toHaveBeenCalledTimes(1);

    const mission = await controller.getMissionState('B8.3');
    expect(mission?.rsipMetrics?.runs).toBe(1);
    expect(mission?.rsipMetrics?.totalIterations).toBe(1);
    expect(mission?.rsipMetrics?.lastRun).toMatchObject({
      converged: true,
      reason: 'converged',
      iterations: [
        {
          index: 1,
          improvementScore: 0.2,
          summary: 'iteration-1',
        },
      ],
    });

    const history = mission?.history ?? [];
    const lastEvent = history[history.length - 1];
    expect(lastEvent?.type).toBe('self_improvement_run');
    expect(lastEvent?.payload).toMatchObject({
      iterations: 1,
      converged: true,
      reason: 'converged',
    });

    expect(runEvents).toHaveLength(1);
    expect(runEvents[0]).toMatchObject({
      missionId: 'B8.3',
      summary: {
        iterations: [
          {
            index: 1,
            improvementScore: 0.2,
            summary: 'iteration-1',
          },
        ],
        converged: true,
        reason: 'converged',
      },
    });
  });

  it('ignores resume requests for missions with no state', async () => {
    const { baseDir, statePath, sessionsPath } = await createTempEnvironment();
    tempDirs.push(baseDir);

    const { propagator } = createPropagatorStub();
    const controller = new AgenticController({
      statePath,
      sessionsPath,
      propagator,
      clock: () => new Date('2025-10-29T03:08:00Z'),
    });

    const state = await controller.resumeMission('Z9.9');
    expect(Object.keys(state.missions)).toHaveLength(0);
  });
});

describe('MissionStateManager', () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => removeTempDir(dir)));
    tempDirs = [];
  });

  it('returns default state when persisted file is empty', async () => {
    const baseDir = await fs.mkdtemp(join(tmpdir(), 'agentic-state-manager-'));
    tempDirs.push(baseDir);
    const statePath = join(baseDir, 'state.json');
    await fs.writeFile(statePath, '   ', 'utf-8');

    const manager = new MissionStateManager({
      statePath,
      clock: () => new Date('2025-10-29T03:00:00Z'),
    });

    const state = await manager.getState();
    expect(state.workflow.queue).toHaveLength(0);
    expect(Object.keys(state.missions)).toHaveLength(0);
  });

  it('throws when persisted file contains invalid json', async () => {
    const baseDir = await fs.mkdtemp(join(tmpdir(), 'agentic-state-manager-'));
    tempDirs.push(baseDir);
    const statePath = join(baseDir, 'state.json');
    await fs.writeFile(statePath, '{invalid json', 'utf-8');

    const manager = new MissionStateManager({ statePath });
    await expect(manager.getState()).rejects.toThrow();
  });

  it('normalizes persisted mission metadata and tags', async () => {
    const baseDir = await fs.mkdtemp(join(tmpdir(), 'agentic-state-manager-'));
    tempDirs.push(baseDir);
    const statePath = join(baseDir, 'state.json');

    const persisted = {
      version: 1,
      lastUpdated: '2025-10-29T03:05:00Z',
      missions: {
        'B6.4': {
          missionId: 'B6.4',
          phase: 'execution',
          status: 'current',
          updatedAt: '2025-10-29T03:04:00Z',
          tags: ['priority:high'],
          history: [{ ts: '2025-10-29T03:03:00Z', type: 'test_event' }],
          subMissions: [],
          metadata: { reviewer: 'codex' },
        },
      },
      workflow: {
        activeMission: 'B6.4',
        queue: [],
        completed: [],
        paused: [],
      },
    };

    await fs.writeFile(statePath, JSON.stringify(persisted), 'utf-8');

    const manager = new MissionStateManager({ statePath });
    const state = await manager.getState();

    expect(state.missions['B6.4'].tags).toEqual(['priority:high']);
    expect(state.missions['B6.4'].history).toHaveLength(1);
    expect(state.workflow.activeMission).toBe('B6.4');
  });
});
