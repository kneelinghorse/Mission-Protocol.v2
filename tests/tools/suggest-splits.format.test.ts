import { describe, it, expect } from '@jest/globals';
import { SuggestSplitsToolImpl } from '../../src/tools/suggest-splits';
import { TokenCounter } from '../../src/intelligence/token-counters';

const tokenCounter = new TokenCounter();
const tool = new SuggestSplitsToolImpl(tokenCounter, 'gpt');

describe('SuggestSplitsToolImpl.formatForLLM', () => {
  it('renders no-split recommendation with token usage summary', () => {
    const result = {
      shouldSplit: false,
      complexity: {
        compositeScore: 3.2,
        tokenScore: 2.1,
        structuralScore: 1.5,
        timeHorizonScore: 1.0,
        computationalScore: 0.8,
      },
      reasons: ['Mission fits within context window'],
      recommendation: 'Proceed without splitting.',
      tokenUsage: {
        model: 'gpt' as const,
        totalTokens: 420,
        estimatedCost: 0.00105,
        contextWindow: 128000,
        utilization: 420 / 128000,
      },
    };

    const formatted = tool.formatForLLM(result, true);

    expect(formatted).toContain('Mission Complexity Analysis');
    expect(formatted).toContain('Token Usage (gpt):');
    expect(formatted).toContain('Mission tokens: 420');
    expect(formatted).toContain('Proceed without splitting.');
  });

  it('renders split recommendation with suggested breakpoints', () => {
    const result = {
      shouldSplit: true,
      complexity: {
        compositeScore: 8.7,
        tokenScore: 7.5,
        structuralScore: 6.2,
        timeHorizonScore: 5.5,
        computationalScore: 4.8,
      },
      reasons: ['Token usage exceeds 80% of context window'],
      estimatedHumanHours: 9.5,
      recommendation: 'Split into focused sub-missions.',
      suggestedBreakpoints: [
        { position: 120, reason: 'Context shift', confidence: 0.75, preview: '...preview one...' },
        { position: 340, reason: 'Dependency boundary', confidence: 0.8, preview: '...preview two...' },
      ],
      estimatedSubMissions: 3,
      tokenUsage: {
        model: 'gpt' as const,
        totalTokens: 9800,
        estimatedCost: 0.0245,
        contextWindow: 128000,
        utilization: 9800 / 128000,
      },
    };

    const formatted = tool.formatForLLM(result, false);

    expect(formatted).toContain('Mission Complexity Analysis');
    expect(formatted).toContain('Token Usage (gpt):');
    expect(formatted).toContain('Suggested Split Points');
    expect(formatted).toContain('Split into focused sub-missions.');
  });

  it('falls back gracefully when token usage metrics are missing', () => {
    const result = {
      shouldSplit: false,
      complexity: {
        compositeScore: 2.9,
        tokenScore: 1.5,
        structuralScore: 1.1,
        timeHorizonScore: 1.0,
        computationalScore: 0.5,
      },
      reasons: ['Short mission objective'],
      recommendation: 'Safe to execute as a single mission.',
    };

    const formatted = tool.formatForLLM(result as any, false);

    expect(formatted).toContain('Token metrics unavailable for this result.');
  });
});
