import { describe, expect, test } from '@jest/globals';
import {
  ContextPropagator,
  type SubMissionResult,
  type ContextSummary,
} from '../../src/intelligence/context-propagator';

const createResult = (overrides: Partial<SubMissionResult>): SubMissionResult => ({
  missionId: overrides.missionId ?? 'sub-mission',
  input:
    overrides.input ??
    'Provide detailed implementation guidance covering objectives, constraints, and success factors.',
  output:
    overrides.output ??
    'Objective achieved with clear milestones and verification steps that emphasize success criteria.',
  status: overrides.status ?? 'success',
  timestamp: overrides.timestamp ?? new Date('2024-04-01T00:00:00Z'),
  metadata: overrides.metadata,
});

const createPropagator = (maxContextTokens = 400) =>
  new ContextPropagator({
    maxContextTokens,
    strategy: 'map-reduce',
    summaryModel: 'claude',
  });

describe('ContextPropagator', () => {
  test('uses full context strategy for short histories', async () => {
    const propagator = createPropagator(200);
    const results = [
      createResult({ missionId: 'S1' }),
      createResult({
        missionId: 'S2',
        output:
          'Success criteria satisfied and mission completed with comprehensive verification and validation.',
      }),
    ];

    const summary = await propagator.propagateContext(
      'Mission objective: deliver secure infrastructure improvements with thoughtful sequencing.',
      results,
      'S3'
    );

    expect(summary.strategy).toBe('full');
    expect(summary.summary).toContain('=== ORIGINAL MISSION ===');
    expect(summary.summary).toContain('--- Sub-Mission: S1 ---');
  });

  test('uses extractive strategy for medium histories', async () => {
    const propagator = createPropagator(200);
    const results = [
      createResult({
        missionId: 'A',
        output:
          'The objective was to implement zero trust and the success statement highlights mission progress.',
      }),
      createResult({
        missionId: 'B',
        output:
          'Key deliverable includes "Deployment Guide" and documented success criteria with strong narrative.',
      }),
      createResult({
        missionId: 'C',
        output:
          'Final report emphasizes completion and provides an overview of future enhancements still required.',
      }),
    ];

    const summary = await propagator.propagateContext(
      'Mission objective: deliver modernization and document outcomes for executive review.',
      results,
      'D'
    );

    expect(summary.strategy).toBe('extractive');
    expect(summary.summary).toContain('Key Outputs');
    expect(summary.tokenCount).toBeGreaterThan(0);
  });

  test('uses map-reduce strategy for long histories', async () => {
    const propagator = createPropagator(100);
    const longResults = Array.from({ length: 6 }, (_, index) =>
      createResult({
        missionId: `Step-${index + 1}`,
        output: `This sentence explains objective fulfillment and success for phase ${
          index + 1
        } with extensive narrative describing progress and achievements.`,
      })
    );

    const summary = await propagator.propagateContext(
      'Mission aim: orchestrate multifaceted delivery across phases with strong governance and stakeholder alignment.',
      longResults,
      'Step-7'
    );

    expect(summary.strategy).toBe('map-reduce');
    expect(summary.summary).toContain('Phase 1');
    expect(summary.summary).toContain('EXECUTION SUMMARY');
  });

  test('validateContextSize flags overflows', async () => {
    const propagator = createPropagator(10);
    const resultSummary: ContextSummary = {
      originalMission: 'Goal: implement improvements.',
      completedSteps: [],
      summary: 'This summary is intentionally long to exceed the token limit and trigger overflow validation.',
      tokenCount: 50,
      strategy: 'full',
    };

    const validation = propagator.validateContextSize(resultSummary);
    expect(validation.valid).toBe(false);
    expect(validation.overflow).toBeGreaterThan(0);
  });

  test('createMinimalContext extracts objective and key sentence', () => {
    const propagator = createPropagator();
    const context = propagator.createMinimalContext(
      'Objective: accelerate roadmap execution across all teams by coordinating delivery waves.',
      createResult({
        missionId: 'Last',
        output:
          'The final milestone confirms success and emphasizes the most critical deliverable remaining on the roadmap.',
      })
    );

    expect(context).toContain('Mission: accelerate roadmap execution across all teams by coordinating delivery waves');
    expect(context).toContain('Last step: The final milestone confirms success and emphasizes the most critical deliverable remaining on the roadmap');
  });

  test('abstractive summarization builds narrative overview', () => {
    const propagator = createPropagator();
    const summary = (propagator as any).abstractiveSummarization(
      'Objective: deliver an end-to-end compliance program that satisfies regulatory oversight.',
      [
        createResult({
          missionId: 'Phase-1',
          output:
            'The initial stage completed documentation with success and introduced oversight committees to ensure progress.',
        }),
        createResult({
          missionId: 'Phase-2',
          output:
            'Implementation achieved key controls and resulted in notable improvements approved by executive leadership.',
        }),
      ]
    );

    expect(summary).toContain('MISSION OVERVIEW');
    expect(summary).toContain('Step 1');
  });

  test('extractKeyInfo captures phrases and important sentences', () => {
    const propagator = createPropagator();
    const keyInfo = (propagator as any).extractKeyInfo(
      'Objective: Deliver Secure Enclave. "Golden Path" adoption ensures success. Executive Steering Committee approved the plan and emphasized accountability across phases.'
    );

    expect(keyInfo.keySentences.length).toBeGreaterThan(0);
    expect(keyInfo.keyPhrases).toContain('Golden Path');
  });

  test('propagateContext can run abstractive fallback when strategy forced', async () => {
    const propagator = createPropagator();
    const strategySpy = jest
      .spyOn(propagator as any, 'determineStrategy')
      .mockReturnValue('abstractive');
    const result = await propagator.propagateContext(
      'Mission goal: deliver unified developer experience across platforms with clear governance.',
      [
        createResult({
          missionId: 'Phase-1',
          output:
            'First milestone completed with success and documentation aligned to enterprise guardrails.',
        }),
      ],
      'Phase-2'
    );
    strategySpy.mockRestore();

    expect(result.strategy).toBe('abstractive');
    expect(result.summary).toContain('MISSION OVERVIEW');
  });

  test('propagateContext uses defaults when strategy and summary model omitted', async () => {
    const propagator = new ContextPropagator({ maxContextTokens: 1000 });
    const summary = await propagator.propagateContext(
      'Mission objective: deliver incremental platform upgrades.',
      [
        createResult({
          missionId: 'Alpha',
          output:
            'Implementation completed successfully with thorough validation and production deployment readiness.',
        }),
        createResult({
          missionId: 'Beta',
          output:
            'Stakeholders confirmed success criteria and documented remaining follow-up actions for the program.',
        }),
      ],
      'Gamma'
    );

    expect(summary.strategy).toBe('full');
    expect(summary.tokenCount).toBeGreaterThan(0);
  });

  test('createMinimalContext falls back to first sentence objective', () => {
    const propagator = createPropagator();
    const context = propagator.createMinimalContext(
      'Build cross-platform mission control to orchestrate success across agencies. Ensure top-tier resiliency.',
      createResult({
        missionId: 'Wrap-up',
        output:
          'Success was achieved by rolling out the platform incrementally with strong change management, delivering measurable improvements.',
      })
    );

    expect(context).toContain('Build cross-platform mission control');
    expect(context).toContain('Success was achieved');
  });

  test('abstractive summarization uses completion fallback when no key sentences detected', () => {
    const propagator = createPropagator();
    const summary = (propagator as any).abstractiveSummarization('Goal: build simple API.', [
      createResult({ missionId: 'Solo', output: 'Short text.' }),
    ]);

    expect(summary).toContain('Completed successfully');
  });

  test('createMinimalContext falls back to no output placeholder', () => {
    const propagator = createPropagator();
    const minimal = propagator.createMinimalContext('Provide support documentation.', createResult({
      output: 'Tiny.'
    }));

    expect(minimal).toContain('No output');
  });

  test('validateContextSize reports overflow details', () => {
    const propagator = createPropagator(100);
    const validation = propagator.validateContextSize({
      originalMission: 'Objective: keep this concise.',
      completedSteps: [],
      summary: 'a'.repeat(600),
      tokenCount: 250,
      strategy: 'extractive',
    });

    expect(validation.valid).toBe(false);
    expect(validation.overflow).toBeGreaterThan(0);
  });

  test('groupSummaries buckets steps into sequential phases', () => {
    const propagator = createPropagator();
    const grouped = (propagator as any).groupSummaries(
      Array.from({ length: 5 }, (_, index) => ({
        missionId: `Step-${index + 1}`,
        summary: `Summary ${index + 1}`,
        status: 'success',
      }))
    );

    expect(Object.keys(grouped)).toEqual(['Phase 1', 'Phase 2']);
    expect(grouped['Phase 2']?.[0].missionId).toBe('Step-4');
  });

  test('extractKeyPhrases collects quoted and capitalized sequences', () => {
    const propagator = createPropagator();
    const phrases = (propagator as any).extractKeyPhrases(
      'Adopt the "Mission Accelerator" framework in partnership with Strategic Delivery Office leaders.'
    );
    expect(phrases).toEqual(
      expect.arrayContaining(['Mission Accelerator', 'Strategic Delivery Office'])
    );
  });

  test('extractKeyInfo scores early and late sentences with position bias', () => {
    const propagator = createPropagator();
    const text = [
      'Objective: deliver cross-functional value with precise execution and measurable milestones across teams.',
      'Phase one completed implementation tasks and validation used comprehensive standards across business units.',
      'Interim assessment confirms success and highlights achievements throughout the initiative with detailed metrics.',
      'Next steps focus on knowledge transfer and ensuring ongoing stewardship of the new capabilities.',
      'Final evaluation provides insights and underscores long-term sustainability for the mission.',
      'Retrospective ensures lessons learned and codifies best practices for future engagements throughout the company.',
    ].join(' ');

    const info = (propagator as any).extractKeyInfo(text);
    expect(info.keySentences.length).toBeGreaterThan(0);
    expect(info.importance).toBeGreaterThan(0);
  });
});
