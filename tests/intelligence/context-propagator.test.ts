import { ContextPropagator, SubMissionResult } from '../../src/intelligence/context-propagator';

const makeResult = (missionId: string, input: string, output: string): SubMissionResult => ({
  missionId,
  input,
  output,
  status: 'success',
  timestamp: new Date('2025-10-28T00:00:00Z'),
});

describe('ContextPropagator', () => {
  const missionText = [
    'Mission objective: Deliver hybrid retrieval pipeline with summarization safeguards.',
    'Ensure context propagation stays within token budget while preserving critical signals.',
  ].join(' ');

  it('uses full context strategy for short mission chains', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 120 });
    const summary = await propagator.propagateContext(
      missionText,
      [
        makeResult(
          'S1',
          'Outline retrieval pipeline requirements.',
          'Documented sparse+dense retrieval goals with evaluation metrics.'
        ),
        makeResult(
          'S2',
          'Draft integration plan.',
          'Integration plan addresses adapters, telemetry, and guardrails.'
        ),
      ],
      'S3'
    );

    expect(summary.strategy).toBe('full');
    expect(summary.summary).toContain('=== ORIGINAL MISSION ===');
    expect(summary.summary).toContain('=== COMPLETED SUB-MISSIONS ===');
  });

  it('switches to extractive summarization for medium chains', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 160 });
    const results = Array.from({ length: 4 }, (_, index) =>
      makeResult(
        `M${index + 1}`,
        `Input text for mission ${index + 1}.`,
        `Output sentence ${index + 1}. Provides actionable insight and result narrative.`
      )
    );

    const summary = await propagator.propagateContext(missionText, results, 'M5');

    expect(summary.strategy).toBe('extractive');
    expect(summary.summary).toContain('=== ORIGINAL MISSION (Summary) ===');
    expect(summary.summary).toContain('=== COMPLETED STEPS (Key Outputs) ===');
  });

  it('applies abstractive summarization for narrative chains', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 160 });
    const results = Array.from({ length: 5 }, (_, index) =>
      makeResult(
        `A${index + 1}`,
        `Detailed input narrative for mission ${index + 1} focusing on context transitions and story arcs.`,
        `Rich output passage ${index + 1} describing outcomes, risks, and human-readable recommendations.`
      )
    );

    const summary = await propagator.propagateContext(missionText, results, 'A6');

    expect(summary.strategy).toBe('abstractive');
    expect(summary.summary).toContain('=== MISSION OVERVIEW ===');
    expect(summary.summary).toContain('=== PROGRESS ===');
  });

  it('falls back to map-reduce summarization for long chains', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 80 });
    const results = Array.from({ length: 7 }, (_, index) => {
      const longInput = `Detailed input for mission ${index + 1} with applied research context and deliverables. `.repeat(
        8
      );
      const longOutput = `Long-form output ${index + 1} summarizing conclusions, decisions, and follow-up actions with full narrative coverage. `.repeat(
        8
      );
      return makeResult(`L${index + 1}`, longInput, longOutput);
    });

    const summary = await propagator.propagateContext(missionText, results, 'L8');

    expect(summary.strategy).toBe('map-reduce');
    expect(summary.summary).toContain('=== MISSION CONTEXT ===');
    expect(summary.summary).toContain('=== EXECUTION SUMMARY ===');
  });

  it('detects context overflow with validateContextSize', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 20 });
    const summary = await propagator.propagateContext(
      'Mission goal: produce verbose narrative to trigger overflow safeguards.',
      [
        makeResult(
          'O1',
          'Verbose input text to ensure token count rises rapidly and exceeds thresholds.',
          'Verbose output text delivering extensive explanation about retrieval pipelines.'
        ),
      ],
      'O2'
    );

    const assessment = propagator.validateContextSize(summary);
    expect(assessment.valid).toBe(false);
    expect(assessment.overflow).toBeGreaterThan(0);
  });

  it('creates minimal context snapshots for emergency continuation', () => {
    const propagator = new ContextPropagator({ maxContextTokens: 120 });
    const minimal = propagator.createMinimalContext(
      missionText,
      makeResult(
        'S-last',
        'Prepare final report draft.',
        'Final report outlines hybrid retrieval performance and accuracy improvements.'
      )
    );

    expect(minimal).toContain('Mission: Deliver hybrid retrieval pipeline with summarization safeguards');
    expect(minimal).toContain('Last step: Final report outlines hybrid retrieval performance and accuracy improvements');
  });

  it('falls back to first sentence when mission objective marker missing', () => {
    const propagator = new ContextPropagator({ maxContextTokens: 80 });
    const minimal = propagator.createMinimalContext(
      'Deliver hybrid retrieval improvements across platform. Provide optional telemetry snapshot.',
      makeResult('F1', 'Assemble telemetry snapshot.', 'Telemetry snapshot prepared with accuracy and latency metrics.')
    );

    expect(minimal).toContain('Mission: Deliver hybrid retrieval improvements across platform');
  });
});
