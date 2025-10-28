import { describe, expect, test } from '@jest/globals';
import { SuggestSplitsToolImpl, type SplitSuggestion } from '../../src/tools/suggest-splits';
import path from 'path';
import os from 'os';
import type { ITokenCounter, TokenCount, SupportedModel } from '../../src/intelligence/types';
import { promises as fs } from 'fs';
import { ensureTempDir, removeDir } from '../../src/utils/fs';

class NoopTokenCounter implements ITokenCounter {
  async count(text: string, model: SupportedModel): Promise<TokenCount> {
    return {
      model,
      count: text.length,
    };
  }
}

const makeComplexity = (score: number) => ({
  compositeScore: score,
  components: {
    tokenScore: 4,
    structuralScore: 5,
    timeHorizonScore: 6,
    computationalScore: 7,
  },
  reasons: ['Reason A', 'Reason B'],
  estimatedHumanHours: 16,
  tokenDetails: {
    model: 'claude' as SupportedModel,
    count: 2000,
    estimatedCost: 3.5,
  },
});

describe('SuggestSplitsToolImpl recommendations', () => {
  const tool = new SuggestSplitsToolImpl(new NoopTokenCounter(), 'claude');

  test('loadMissionFile returns parsed mission when YAML matches schema', async () => {
    const tempDir = await ensureTempDir('suggest-splits-mission-');
    const filePath = path.join(tempDir, 'mission.yaml');
    await fs.writeFile(
      filePath,
      [
        'schemaType: Mission',
        'schemaVersion: "2.0"',
        'missionId: TEST-123',
        'objective: Validate loadMissionFile branch',
        'context:',
        '  background: Example',
        '  dependencies: []',
        '  constraints: []',
        'successCriteria:',
        '  - passes',
        'deliverables:',
        '  - report',
        'domainFields: {}',
      ].join('\n'),
      'utf-8'
    );

    try {
      const mission = await (tool as any).loadMissionFile(filePath);
      expect(typeof mission).toBe('object');
      expect(mission.missionId).toBe('TEST-123');
    } finally {
      await removeDir(tempDir, { recursive: true, force: true });
    }
  });

  test('loadMissionFile returns raw content when YAML invalid or missing required fields', async () => {
    const tempDir = await ensureTempDir('suggest-splits-invalid-');
    const invalidYamlPath = path.join(tempDir, 'invalid.yaml');
    await fs.writeFile(invalidYamlPath, 'objective: value: unexpected', 'utf-8');

    const nonMissionPath = path.join(tempDir, 'non-mission.yaml');
    await fs.writeFile(nonMissionPath, 'not: a mission', 'utf-8');

    try {
      const invalid = await (tool as any).loadMissionFile(invalidYamlPath);
      expect(typeof invalid).toBe('string');
      expect(invalid).toContain('objective');

      const nonMission = await (tool as any).loadMissionFile(nonMissionPath);
      expect(typeof nonMission).toBe('string');
      expect(nonMission).toContain('not: a mission');
    } finally {
      await removeDir(tempDir, { recursive: true, force: true });
    }
  });

  test('loadMissionFile surfaces fs errors with helpful message', async () => {
    const tempDir = await ensureTempDir('suggest-splits-missing-');
    const filePath = path.join(tempDir, 'missing.yaml');
    await fs.writeFile(filePath, 'schemaType: Mission', 'utf-8');
    await fs.rm(filePath);

    try {
      await expect((tool as any).loadMissionFile(filePath)).rejects.toThrow(
        'Failed to load mission file'
      );
    } finally {
      await removeDir(tempDir, { recursive: true, force: true });
    }
  });

  test('getNoSplitRecommendation covers low, moderate, and high branches', () => {
    const low = (tool as any).getNoSplitRecommendation(makeComplexity(3.2));
    expect(low).toContain('low complexity');

    const moderate = (tool as any).getNoSplitRecommendation(makeComplexity(5.2));
    expect(moderate).toContain('moderate complexity');

    const higher = (tool as any).getNoSplitRecommendation(makeComplexity(6.1));
    expect(higher).toContain('notable complexity');
  });

  test('getSplitRecommendation formats details with estimated effort', () => {
    const suggestion = {
      shouldSplit: true,
      complexity: makeComplexity(8.4),
      suggestedSplits: [
        { position: 120, reason: 'Phase boundary', confidence: 0.8 },
        { position: 240, reason: 'Context shift', confidence: 0.6 },
      ],
    };

    const recommendation = (tool as any).getSplitRecommendation(suggestion);
    expect(recommendation).toContain('Split into 3 sub-missions');
    expect(recommendation).toContain('Estimated total effort');
    expect(recommendation).toContain('Benefits of splitting');
  });

  test('generateRecommendation defers to split or no-split messaging', () => {
    const noSplit = (tool as any).generateRecommendation({
      shouldSplit: false,
      complexity: makeComplexity(3.9),
    });
    expect(noSplit).toContain('No split is needed');

    const split = (tool as any).generateRecommendation({
      shouldSplit: true,
      complexity: makeComplexity(8.2),
      suggestedSplits: [{ position: 10, reason: 'test', confidence: 0.5 }],
    });
    expect(split).toContain('should be split');
  });

  test('getBreakpointPreview extracts surrounding text', () => {
    const text = 'Mission intro. Detailed plan follows. Execution steps next.';
    const preview = (tool as any).getBreakpointPreview(text, text.indexOf('Execution'));
    expect(preview).toContain('Detailed plan');
    expect(preview).toContain('Execution steps');
  });

  test('formatForLLM includes rich detail when data available', () => {
    const suggestion: SplitSuggestion = {
      shouldSplit: true,
      complexity: {
        compositeScore: 7.5,
        tokenScore: 6.1,
        structuralScore: 6.8,
        timeHorizonScore: 5.5,
        computationalScore: 7.2,
      },
      reasons: ['Large scope', 'High dependency count'],
      estimatedHumanHours: 20,
      recommendation: 'Split recommended due to scope.',
      estimatedSubMissions: 3,
      tokenUsage: {
        model: 'claude',
        totalTokens: 1800,
        estimatedCost: 2.45,
        contextWindow: 200000,
        utilization: 0.009,
      },
      suggestedBreakpoints: [
        {
          position: 150,
          reason: 'Phase boundary',
          confidence: 0.7,
          preview: '...phase one | phase two...',
        },
      ],
    };

    const detailed = tool.formatForLLM(suggestion, true);
    expect(detailed).toContain('Component Breakdown');
    expect(detailed).toContain('Suggested Split Points');
    expect(detailed).toContain('Estimated Effort');
    expect(detailed).toContain('scope');
  });

  test('formatForLLM handles missing token usage and non-split scenarios', () => {
    const suggestion: SplitSuggestion = {
      shouldSplit: false,
      complexity: {
        compositeScore: 3.4,
        tokenScore: 3,
        structuralScore: 3,
        timeHorizonScore: 3,
        computationalScore: 3,
      },
      reasons: [],
      recommendation: 'No split required.',
    };

    const summary = tool.formatForLLM(suggestion, false);
    expect(summary).toContain('Token metrics unavailable');
    expect(summary).toContain('No split required');
    expect(summary).not.toContain('Suggested Split Points');
  });

  test('execute validates missionFile parameter', async () => {
    await expect(tool.execute({ missionFile: '  ' })).rejects.toThrow('missionFile is required');
  });

  test('execute fails when mission file not found', async () => {
    await expect(tool.execute({ missionFile: path.join(os.tmpdir(), 'missing-file.yaml') })).rejects.toThrow('Mission file not found');
  });
});
