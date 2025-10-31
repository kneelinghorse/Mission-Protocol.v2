import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureTempDir, removeDir } from '../../src/utils/fs';

let TEMP_DIR: string;
let previousWorkspaceRoot: string | undefined;

async function writeMissionFile(content: string): Promise<string> {
  const filePath = path.join(TEMP_DIR, `mission-${Date.now()}-${Math.random()}.yaml`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('SuggestSplitsToolImpl.execute (mocked splitter)', () => {
  beforeAll(async () => {
    TEMP_DIR = await ensureTempDir('suggest-splits-');
    previousWorkspaceRoot = process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = TEMP_DIR;
  });

  afterAll(async () => {
    if (previousWorkspaceRoot !== undefined) {
      process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = previousWorkspaceRoot;
    } else {
      delete process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    }
    previousWorkspaceRoot = undefined;
    await removeDir(TEMP_DIR, { recursive: true, force: true });
  });

  it('returns split recommendation with detailed breakpoints', async () => {
    const missionPath = await writeMissionFile(`
missionId: TEST-001
objective: Run split suggestion smoke test
context: Simple mission to exercise SuggestSplitsToolImpl
`);

    const mockSuggestion = {
      shouldSplit: true,
      complexity: {
        compositeScore: 8.2,
        components: {
          tokenScore: 6.0,
          structuralScore: 5.0,
          timeHorizonScore: 4.5,
          computationalScore: 3.0,
        },
        reasons: ['High token usage', 'Multiple dependency chains'],
        estimatedHumanHours: 9.5,
        tokenDetails: {
          model: 'gpt',
          count: 1500,
          estimatedCost: 0.00375,
        },
      },
      suggestedSplits: [
        { position: 20, reason: 'Objective shift', confidence: 0.75 },
        { position: 80, reason: 'Deliverable phase change', confidence: 0.8 },
      ],
      reasoning: 'Mock reasoning',
    };

    const result = await new Promise<any>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../../src/intelligence/mission-splitter', () => ({
          MissionSplitter: class {
            async suggestSplits() {
              return mockSuggestion;
            }
          },
        }));
        jest.doMock('../../src/intelligence/complexity-scorer', () => ({
          ComplexityScorer: class {},
        }));

        const { SuggestSplitsToolImpl } = require('../../src/tools/suggest-splits');
        const tokenCounter = {
          count: jest.fn(async (_text: string, _model: string, _options?: unknown) => ({
            model: 'gpt',
            count: 1500,
            estimatedCost: 0.00375,
          })),
        } as any;
        const tool = new SuggestSplitsToolImpl(tokenCounter, 'gpt');
        tool.execute({ missionFile: missionPath, detailed: true }).then(resolve).catch(reject);
      });
    });

    expect(result.shouldSplit).toBe(true);
    expect(result.complexity.compositeScore).toBeCloseTo(8.2);
    expect(result.suggestedBreakpoints?.length).toBe(2);
    expect(result.tokenUsage?.totalTokens).toBe(1500);
    expect(result.tokenUsage?.utilization).toBeGreaterThan(0);
  });

  it('returns no-split recommendation when complexity is low', async () => {
    const missionPath = await writeMissionFile('objective: low complexity mission');

    const mockSuggestion = {
      shouldSplit: false,
      complexity: {
        compositeScore: 3.2,
        components: {
          tokenScore: 1.5,
          structuralScore: 1.0,
          timeHorizonScore: 0.5,
          computationalScore: 0.2,
        },
        reasons: ['Mission fits well within context window'],
        estimatedHumanHours: 2.5,
        tokenDetails: {
          model: 'claude',
          count: 600,
          estimatedCost: 0.0018,
        },
      },
      suggestedSplits: [],
      reasoning: 'Mock reasoning',
    };

    const result = await new Promise<any>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../../src/intelligence/mission-splitter', () => ({
          MissionSplitter: class {
            async suggestSplits() {
              return mockSuggestion;
            }
          },
        }));
        jest.doMock('../../src/intelligence/complexity-scorer', () => ({
          ComplexityScorer: class {},
        }));

        const { SuggestSplitsToolImpl } = require('../../src/tools/suggest-splits');
        const tokenCounter = {
          count: jest.fn(async (_text: string, _model: string, _options?: unknown) => ({
            model: 'claude',
            count: 600,
            estimatedCost: 0.0018,
          })),
        } as any;
        const tool = new SuggestSplitsToolImpl(tokenCounter, 'claude');
        tool.execute({ missionFile: missionPath }).then(resolve).catch(reject);
      });
    });

    expect(result.shouldSplit).toBe(false);
    expect(result.recommendation).toContain('low complexity');
    expect(result.tokenUsage?.model).toBe('claude');
    expect(result.tokenUsage?.utilization).toBeLessThan(1);
  });

  it('rejects when the execution signal is aborted', async () => {
    const missionPath = await writeMissionFile('objective: abort handling test');

    await expect(
      new Promise((resolve, reject) => {
        jest.isolateModules(() => {
          jest.doMock('../../src/intelligence/mission-splitter', () => ({
            MissionSplitter: class {
              async suggestSplits() {
                return {
                  shouldSplit: false,
                  complexity: {
                    compositeScore: 1,
                    components: {
                      tokenScore: 1,
                      structuralScore: 1,
                      timeHorizonScore: 1,
                      computationalScore: 1,
                    },
                    reasons: [],
                    estimatedHumanHours: 1,
                    tokenDetails: { model: 'claude', count: 100, estimatedCost: 0 },
                  },
                  suggestedSplits: [],
                  reasoning: 'Not used',
                };
              }
            },
          }));
          jest.doMock('../../src/intelligence/complexity-scorer', () => ({
            ComplexityScorer: class {},
          }));

          const { SuggestSplitsToolImpl } = require('../../src/tools/suggest-splits');
          const tokenCounter = {
            count: jest.fn(async (_text: string, _model: string, _options?: unknown) => ({
              model: 'claude',
              count: 100,
              estimatedCost: 0,
            })),
          } as any;

          const tool = new SuggestSplitsToolImpl(tokenCounter, 'claude');
          const controller = new AbortController();
          controller.abort();

          tool.execute({ missionFile: missionPath }, { signal: controller.signal }).then(resolve).catch(reject);
        });
      })
    ).rejects.toThrow(/aborted/i);
  });
});
