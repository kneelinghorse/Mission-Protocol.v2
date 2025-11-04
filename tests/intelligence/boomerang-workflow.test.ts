import { promises as fs } from 'fs';
import { join } from 'path';

import {
  BoomerangStep,
  BoomerangWorkflow,
} from '../../src/intelligence/boomerang-workflow';
import {
  TelemetryEvent,
  registerTelemetryHandler,
  setTelemetryLevel,
} from '../../src/intelligence/telemetry';
import { pathExists } from '../../src/utils/fs';

describe('BoomerangWorkflow', () => {
  const runtimeRoot = 'cmos/runtime/boomerang-test';
  let telemetryEvents: TelemetryEvent[] = [];

  beforeEach(() => {
    telemetryEvents = [];
    registerTelemetryHandler((event) => telemetryEvents.push(event));
    setTelemetryLevel('info');
  });

  afterEach(async () => {
    registerTelemetryHandler(null);
    setTelemetryLevel('warning');
    await fs.rm(runtimeRoot, { recursive: true, force: true });
  });

  it('executes sequential steps and cleans up checkpoints on success', async () => {
    const missionId = 'boomerang-success';
    const steps: BoomerangStep[] = [
      {
        id: 'plan',
        async run(payload) {
          const base = (payload as { seed?: number })?.seed ?? 0;
          return {
            status: 'success',
            output: { plan: ['step-a', 'step-b'], seed: base },
            diagnostic: 'Planning complete',
          };
        },
      },
      {
        id: 'implement',
        async run(payload) {
          const plan = (payload as { plan: string[] }).plan ?? [];
          return {
            status: 'success',
            output: { completed: plan.length },
            checkpoint: { lastStep: plan[plan.length - 1] },
          };
        },
      },
    ];

    const workflow = new BoomerangWorkflow({
      missionId,
      steps,
      runtimeRoot,
      telemetrySource: 'test::boomerang::success',
    });

    const result = await workflow.execute({ seed: 1 });

    expect(result.status).toBe('success');
    expect(result.completedSteps).toEqual(['plan', 'implement']);
    expect(result.diagnostics.retainedCheckpoints).toBe(0);

    const missionDir = join(runtimeRoot, missionId);
    expect(await pathExists(missionDir)).toBe(false);
    expect(telemetryEvents.find((event) => event.message === 'step_start')).toBeDefined();
    expect(telemetryEvents.find((event) => event.message === 'step_complete')).toBeDefined();
    expect(telemetryEvents.find((event) => event.message === 'checkpoint_write')).toBeDefined();
  });

  it('triggers fallback after exceeding retry limit and retains checkpoints', async () => {
    const missionId = 'boomerang-retry';
    let attempts = 0;

    const steps: BoomerangStep[] = [
      {
        id: 'retry-step',
        async run() {
          attempts += 1;
          return {
            status: 'retry',
            diagnostic: `attempt-${attempts}`,
          };
        },
      },
    ];

    const workflow = new BoomerangWorkflow({
      missionId,
      steps,
      runtimeRoot,
      telemetrySource: 'test::boomerang::retry',
      maxRetries: 2,
    });

    const result = await workflow.execute();

    expect(result.status).toBe('fallback');
    expect(result.failedStep).toBe('retry-step');
    expect(result.fallbackReason).toBe('retry_limit_exceeded');
    expect(result.diagnostics.retainedCheckpoints).toBeGreaterThan(0);

    const missionDir = join(runtimeRoot, missionId);
    expect(await pathExists(missionDir)).toBe(true);
    const files = await fs.readdir(missionDir);
    expect(files).toContain('step-1.json');
    expect(
      telemetryEvents.find((event) => event.message === 'fallback_triggered')
    ).toBeDefined();
  });

  it('prunes expired checkpoint directories based on retention window', async () => {
    const expiredMission = join(runtimeRoot, 'expired-mission');
    const activeMission = join(runtimeRoot, 'active-mission');

    await fs.mkdir(expiredMission, { recursive: true });
    await fs.writeFile(join(expiredMission, 'step-1.json'), JSON.stringify({ status: 'failed' }));
    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await fs.utimes(expiredMission, tenDaysAgo / 1000, tenDaysAgo / 1000);

    await fs.mkdir(activeMission, { recursive: true });
    await fs.writeFile(join(activeMission, 'step-1.json'), JSON.stringify({ status: 'retrying' }));

    const { removed, scanned } = await BoomerangWorkflow.pruneExpired(
      runtimeRoot,
      3,
      () => new Date('2025-11-04T00:00:00Z')
    );

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(scanned).toBeGreaterThanOrEqual(1);
    expect(await pathExists(expiredMission)).toBe(false);
    expect(await pathExists(activeMission)).toBe(true);
  });
});
