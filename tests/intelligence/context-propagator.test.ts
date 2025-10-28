import {
  ContextPropagator,
  ContextPropagatorConfig,
  ContextStrategy,
  SubMissionResult,
} from '../../src/intelligence/context-propagator';

function buildResult(id: string, inputLength: number, outputLength: number): SubMissionResult {
  return {
    missionId: id,
    input: 'i'.repeat(inputLength),
    output: 'o'.repeat(outputLength),
    status: 'success',
    timestamp: new Date(),
  };
}

function createPropagator(strategy?: ContextStrategy, maxTokens = 120): ContextPropagator {
  const config: ContextPropagatorConfig = { maxContextTokens: maxTokens };
  if (strategy) {
    config.strategy = strategy;
  }
  return new ContextPropagator(config);
}

describe('ContextPropagator strategies', () => {
  it('uses full strategy when explicitly requested', async () => {
    const propagator = createPropagator('full');
    const results = [buildResult('S1', 10, 10)];
    const summary = await propagator.propagateContext('origin mission text', results, 'S2');

    expect(summary.strategy).toBe('full');
    expect(summary.summary).toContain('=== COMPLETED SUB-MISSIONS ===');
  });

  it('auto-selects extractive strategy for medium history', async () => {
    const propagator = createPropagator(undefined, 200);
    const results = [
      buildResult('S1', 60, 60),
      buildResult('S2', 60, 60),
      buildResult('S3', 60, 60),
    ];
    const summary = await propagator.propagateContext(
      'objective: deliver improved analytics for missions.',
      results,
      'S4'
    );

    expect(summary.strategy).toBe('extractive');
    expect(summary.summary).toContain('Key Outputs');
  });

  it('defaults to full strategy when history is short even if abstractive requested', async () => {
    const propagator = createPropagator('abstractive');
    const results = [
      buildResult('S1', 40, 40),
      buildResult('S2', 40, 40),
    ];

    const summary = await propagator.propagateContext(
      'Goal: increase coverage. Steps should highlight progress updates.',
      results,
      'S3'
    );

    expect(summary.strategy).toBe('full');
    expect(summary.summary).toContain('=== COMPLETED SUB-MISSIONS ===');
  });

  it('falls back to map-reduce for long mission chains', async () => {
    const propagator = createPropagator(undefined, 50);
    const results = Array.from({ length: 6 }, (_, i) => buildResult(`S${i}`, 80, 80));

    const summary = await propagator.propagateContext('Mission overview text', results, 'S6');

    expect(summary.strategy).toBe('map-reduce');
    expect(summary.summary).toContain('=== EXECUTION SUMMARY ===');
  });
});
