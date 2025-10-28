import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { executeMissionProtocolTool } from '../src/index';
import * as scoreQualityModule from '../src/tools/score-quality';
import * as extractTemplateModule from '../src/tools/extract-template';
import * as importTemplateModule from '../src/tools/import-template';
import * as exportTemplateModule from '../src/tools/export-template';
import * as analyzeDependenciesModule from '../src/tools/analyze-dependencies';

const createMockContext = (): any => {
  const ctx: Record<string, any> = {
    registryParser: {
      loadRegistry: jest.fn(async () => [{ name: 'domain.pack' }]),
    },
    createMissionTool: {
      execute: jest.fn(async () => 'mission: yaml'),
      formatForLLM: jest.fn(() => 'Formatted mission'),
    },
    combinePacksTool: {
      execute: jest.fn(async () => ({})),
      preview: jest.fn(async () => ({})),
    },
    optimizeTokensTool: {
      execute: jest.fn(async () => ({})),
    },
    suggestSplitsTool: {
      execute: jest.fn(async () => ({})),
      formatForLLM: jest.fn(() => 'Formatted suggestion'),
    },
    splitMissionTool: {
      execute: jest.fn(async () => ({})),
      formatForLLM: jest.fn(),
    },
    listDomainsTool: {
      execute: jest.fn(async () => []),
      formatForLLM: jest.fn(() => 'domain list'),
    },
  };

  return {
    baseDir: '/tmp',
    defaultModel: 'claude',
    loader: {} as any,
    registryParser: ctx.registryParser,
    packCombiner: {} as any,
    createMissionTool: ctx.createMissionTool,
    combinePacksTool: ctx.combinePacksTool,
    optimizeTokensTool: ctx.optimizeTokensTool,
    splitMissionTool: ctx.splitMissionTool,
    suggestSplitsTool: ctx.suggestSplitsTool,
    tokenCounter: {} as any,
    listDomainsTool: ctx.listDomainsTool,
  };
};

const restoreSpies = () => {
  jest.restoreAllMocks();
};

describe('executeMissionProtocolTool integration (mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    restoreSpies();
  });

  test('handles create_mission path', async () => {
    const context = createMockContext();
    const result = await executeMissionProtocolTool('create_mission', { missionId: 'M1' }, context);

    expect(context.registryParser.loadRegistry).toHaveBeenCalledWith('registry.yaml');
    expect(context.createMissionTool.execute).toHaveBeenCalled();
    expect(result.structuredContent).toEqual({ success: true, mission: 'mission: yaml' });
  });

  test('returns domain listing for get_available_domains', async () => {
    const context = createMockContext();
    const listExecuteMock = context.listDomainsTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    const listFormatMock = context.listDomainsTool.formatForLLM as jest.MockedFunction<
      (domains: any) => string
    >;

    listExecuteMock.mockResolvedValueOnce([
      { name: 'foundation', description: 'base pack', version: '1.0.0' },
    ]);
    listFormatMock.mockReturnValueOnce('Domain summary');

    const result = await executeMissionProtocolTool('get_available_domains', {}, context);
    expect(result.structuredContent?.domains).toHaveLength(1);
    expect(result.content?.[0]?.text).toBe('Domain summary');
  });

  test('legacy list_available_domains emits warning and still returns domains', async () => {
    const context = createMockContext();
    const listExecuteMock = context.listDomainsTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    const listFormatMock = context.listDomainsTool.formatForLLM as jest.MockedFunction<
      (domains: any) => string
    >;

    listExecuteMock.mockResolvedValueOnce([
      { name: 'foundation', description: 'base pack', version: '1.0.0' },
    ]);
    listFormatMock.mockReturnValueOnce('Domain summary');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await executeMissionProtocolTool('list_available_domains', {}, context);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tool 'list_available_domains' will be removed")
      );
      expect(result.structuredContent?.domains).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('summarizes create_combined_pack success', async () => {
    const context = createMockContext();
    (context.combinePacksTool.execute as jest.Mock).mockImplementationOnce(async () => ({
      success: true,
      loadOrder: ['foundation', 'security'],
      warnings: ['Requires manual review'],
      combinedPack: 'yaml output',
      errors: [],
    }));

    const result = await executeMissionProtocolTool(
      'create_combined_pack',
      { packNames: ['foundation', 'security'], format: 'yaml' },
      context
    );

    expect(result.structuredContent?.success).toBe(true);
    expect(context.combinePacksTool.execute).toHaveBeenCalledWith(
      { packNames: ['foundation', 'security'], format: 'yaml' },
      'registry.yaml'
    );
    expect(result.content?.[0]?.text).toContain('✓ Successfully combined');
    expect(result.content?.[0]?.text).toContain('Warnings');
  });

  test('summarizes create_combined_pack failure', async () => {
    const context = createMockContext();
    (context.combinePacksTool.execute as jest.Mock).mockImplementationOnce(async () => ({
      success: false,
      errors: ['missing pack'],
    }));

    const result = await executeMissionProtocolTool(
      'create_combined_pack',
      { packNames: ['missing'], format: 'yaml' },
      context
    );

    expect(result.structuredContent?.success).toBe(false);
    expect(result.content?.[0]?.text).toContain('Pack combination failed');
  });

  test('create_combined_pack omits load order section when none returned', async () => {
    const context = createMockContext();
    const combineMock = context.combinePacksTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    combineMock.mockResolvedValueOnce({
      success: true,
      loadOrder: [],
      warnings: [],
      combinedPack: 'yaml',
    });

    const result = await executeMissionProtocolTool(
      'create_combined_pack',
      { packNames: ['solo'] },
      context
    );

    expect(result.content?.[0]?.text).not.toContain('Load order');
    expect(result.structuredContent?.success).toBe(true);
  });

  test('delegates to get_mission_quality_score tool for success and failure', async () => {
    const scoreSpy = jest.spyOn(scoreQualityModule, 'scoreQuality');
    scoreSpy.mockResolvedValueOnce({ success: true, summary: 'All good' } as any);

    const successResult = await executeMissionProtocolTool(
      'get_mission_quality_score',
      { missionFile: 'mission.yaml' },
      createMockContext()
    );
    expect(successResult.content?.[0]?.text).toContain('All good');

    scoreSpy.mockResolvedValueOnce({ success: false, error: 'bad input' } as any);
    const failureResult = await executeMissionProtocolTool(
      'get_mission_quality_score',
      { missionFile: 'bad.yaml' },
      createMockContext()
    );
    expect(failureResult.content?.[0]?.text).toContain('Quality scoring failed');
  });

  test('get_mission_quality_score falls back to default summary when none returned', async () => {
    const scoreSpy = jest.spyOn(scoreQualityModule, 'scoreQuality').mockResolvedValue({
      success: true,
      summary: undefined,
    } as any);

    try {
      const result = await executeMissionProtocolTool(
        'get_mission_quality_score',
        { missionFile: 'mission.yaml' },
        createMockContext()
      );

      expect(result.content?.[0]?.text).toContain('Quality assessment completed');
    } finally {
      scoreSpy.mockRestore();
    }
  });

  test('handles update_token_optimization success and failure branches', async () => {
    const context = createMockContext();
    (context.optimizeTokensTool.execute as jest.Mock)
      .mockImplementationOnce(async () => ({
        success: true,
        stats: {
          originalTokens: 4000,
          compressedTokens: 2800,
          reductionPercentage: 30,
          compressionRatio: 1.43,
          passesApplied: ['sanitize', 'linguistic'],
        },
        tokenUsage: {
          model: 'gemini',
          original: { model: 'gemini', count: 4000, estimatedCost: 4.2 },
          optimized: { model: 'gemini', count: 2800, estimatedCost: 3.1 },
          savings: 1200,
          compressionRatio: 1.43,
        },
        warnings: ['Check manual sections'],
        optimizedContent: 'optimized content',
      }))
      .mockImplementationOnce(async () => ({
        success: false,
        error: 'tokenizer unavailable',
      }));

    const success = await executeMissionProtocolTool(
      'update_token_optimization',
      { missionFile: 'mission.yaml', dryRun: false },
      context
    );
    expect(success.structuredContent?.success).toBe(true);
    expect(success.content?.[0]?.text).toContain('Mission file updated');
    expect(success.content?.[0]?.text).toContain('Gemini token counts use a conservative');

    const failure = await executeMissionProtocolTool(
      'update_token_optimization',
      { missionFile: 'mission.yaml' },
      context
    );
    expect(failure.structuredContent?.success).toBe(false);
    expect(failure.isError).toBe(true);
  });

  test('update_token_optimization returns dry-run messaging without heuristic warning for non-gemini', async () => {
    const context = createMockContext();
    const optimizeMock = context.optimizeTokensTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    optimizeMock.mockResolvedValueOnce({
      success: true,
      stats: {
        originalTokens: 2000,
        compressedTokens: 1500,
        reductionPercentage: 25,
        compressionRatio: 1.33,
        passesApplied: ['structural'],
      },
      tokenUsage: {
        model: 'claude',
        original: { model: 'claude', count: 2000 },
        optimized: { model: 'claude', count: 1500 },
        savings: 500,
        compressionRatio: 1.33,
      },
      warnings: [],
      optimizedContent: 'sample',
    });

    const result = await executeMissionProtocolTool(
      'update_token_optimization',
      { missionFile: 'demo', dryRun: true },
      context
    );

    expect(result.content?.[0]?.text).toContain('Dry run mode - no files modified');
    expect((result.structuredContent as any).tokenUsage.heuristicWarning).toBeUndefined();
  });

  test('update_token_optimization throws when token usage metrics missing on success', async () => {
    const context = createMockContext();
    const optimizeMock = context.optimizeTokensTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    optimizeMock.mockResolvedValueOnce({
      success: true,
      stats: {
        originalTokens: 1000,
        compressedTokens: 800,
        reductionPercentage: 20,
        compressionRatio: 1.25,
        passesApplied: [],
      },
      optimizedContent: 'result',
    });

    await expect(
      executeMissionProtocolTool('update_token_optimization', { missionFile: 'bad' }, context)
    ).rejects.toThrow('update_token_optimization succeeded without token usage metrics');
  });

  test('formats get_split_suggestions output with heuristic warning', async () => {
    const context = createMockContext();
    (context.suggestSplitsTool.execute as jest.Mock).mockImplementationOnce(async () => ({
      shouldSplit: true,
      complexity: {
        compositeScore: 7.3,
        components: {
          tokenScore: 6,
          structuralScore: 7,
          timeHorizonScore: 8,
          computationalScore: 5,
        },
        reasons: ['Large scope'],
        estimatedHumanHours: 14,
        tokenDetails: {
          model: 'gemini',
          count: 1600,
          estimatedCost: 2.2,
        },
      },
      suggestedSplits: [{ position: 120, reason: 'Phase boundary', confidence: 0.6 }],
      tokenUsage: {
        model: 'gemini',
        totalTokens: 1600,
        estimatedCost: 2.2,
        contextWindow: 200000,
        utilization: 0.008,
      },
    }));

    const result = await executeMissionProtocolTool(
      'get_split_suggestions',
      { detailed: true },
      context
    );

    const structured = result.structuredContent as any;
    expect(result.content?.[0]?.text).toContain('⚠');
    expect(structured.heuristicWarning).toBeDefined();
  });

  test('get_split_suggestions omits heuristic warning when model is not gemini', async () => {
    const context = createMockContext();
    const suggestMock = context.suggestSplitsTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    suggestMock.mockResolvedValueOnce({
      shouldSplit: true,
      complexity: { compositeScore: 4 },
      suggestedSplits: [],
      tokenUsage: { model: 'claude', totalTokens: 600, contextWindow: 200000, utilization: 0.003 },
    });
    (context.suggestSplitsTool.formatForLLM as jest.Mock).mockReturnValueOnce(
      'Summary without warning'
    );

    const result = await executeMissionProtocolTool('get_split_suggestions', {}, context);
    expect(result.content?.[0]?.text).toBe('Summary without warning');
    expect((result.structuredContent as any).heuristicWarning).toBeUndefined();
  });

  test('get_split_suggestions handles missing token usage metrics', async () => {
    const context = createMockContext();
    const suggestMock = context.suggestSplitsTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    suggestMock.mockResolvedValueOnce({
      shouldSplit: false,
      complexity: { compositeScore: 2 },
      suggestedSplits: [],
    });
    (context.suggestSplitsTool.formatForLLM as jest.Mock).mockReturnValueOnce('Basic summary');

    const result = await executeMissionProtocolTool('get_split_suggestions', {}, context);
    expect(result.content?.[0]?.text).toBe('Basic summary');
    expect((result.structuredContent as any).tokenUsage).toBeUndefined();
  });

  test('handles create_mission_splits formatting with heuristic warning', async () => {
    const context = createMockContext();
    (context.splitMissionTool.execute as jest.Mock).mockImplementationOnce(async () => ({
      shouldSplit: false,
      complexity: { score: 3, reasons: [] },
      summary: 'No split required',
      tokenUsage: {
        model: 'gemini',
        totalTokens: 1200,
        estimatedCost: 1.5,
        contextWindow: 200000,
        utilization: 0.006,
      },
    }));
    (context.splitMissionTool.formatForLLM as jest.Mock).mockReturnValueOnce('Split summary');

    const result = await executeMissionProtocolTool(
      'create_mission_splits',
      { missionFile: 'mission.yaml' },
      context
    );

    const structured = result.structuredContent as any;
    expect(result.content?.[0]?.text).toContain('⚠');
    expect(structured.tokenUsage?.heuristicWarning).toBeDefined();
  });

  test('create_mission_splits leaves summary untouched when token usage lacks heuristic conditions', async () => {
    const context = createMockContext();
    const splitMock = context.splitMissionTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    splitMock.mockResolvedValueOnce({
      shouldSplit: true,
      complexity: { score: 5 },
      summary: 'Proceed with caution',
      tokenUsage: { model: 'claude', totalTokens: 800, estimatedCost: 1.2 },
    });
    (context.splitMissionTool.formatForLLM as jest.Mock).mockReturnValueOnce(
      'Summary without heuristics'
    );

    const result = await executeMissionProtocolTool('create_mission_splits', {}, context);
    expect(result.content?.[0]?.text).toBe('Summary without heuristics');
    expect((result.structuredContent as any).heuristicWarning).toBeUndefined();
  });

  test('create_mission_splits handles responses without token usage metrics', async () => {
    const context = createMockContext();
    const splitMock = context.splitMissionTool.execute as jest.MockedFunction<
      (...args: any[]) => Promise<any>
    >;
    splitMock.mockResolvedValueOnce({
      shouldSplit: false,
      complexity: { score: 3 },
      summary: 'No split needed',
    });
    (context.splitMissionTool.formatForLLM as jest.Mock).mockReturnValueOnce('Minimal summary');

    const result = await executeMissionProtocolTool('create_mission_splits', {}, context);
    expect(result.content?.[0]?.text).toBe('Minimal summary');
    expect((result.structuredContent as any).tokenUsage).toBeUndefined();
  });

  test('pipes through extract/import/export tools', async () => {
    const extractSpy = jest.spyOn(extractTemplateModule, 'extractTemplate');
    extractSpy.mockResolvedValueOnce({
      success: true,
      stage1: { filesAnalyzed: 3 },
      stage2: { parametersGenerated: 2 },
      totalTime: 42,
    } as any);
    extractSpy.mockResolvedValueOnce({
      success: false,
      errors: ['Parse failure'],
    } as any);

    const importSpy = jest.spyOn(importTemplateModule, 'importTemplate');
    importSpy.mockResolvedValueOnce({
      success: true,
      message: 'Imported',
    } as any);
    importSpy.mockResolvedValueOnce({
      success: false,
      message: 'Validation error',
    } as any);

    const exportSpy = jest.spyOn(exportTemplateModule, 'exportTemplate');
    exportSpy.mockResolvedValueOnce({
      success: false,
      message: 'Export failed',
    } as any);
    exportSpy.mockResolvedValueOnce({
      success: true,
      message: 'Exported successfully',
    } as any);

    const extractResult = await executeMissionProtocolTool(
      'get_template_extraction',
      { templateName: 'demo' },
      createMockContext()
    );
    expect(extractSpy).toHaveBeenCalled();
    expect(extractResult.content?.[0]?.text).toContain('Template extracted');

    const extractFailure = await executeMissionProtocolTool(
      'get_template_extraction',
      { templateName: 'demo' },
      createMockContext()
    );
    expect(extractFailure.content?.[0]?.text).toContain('Extraction failed');

    const importResult = await executeMissionProtocolTool(
      'create_template_import',
      { templatePath: 'demo.yaml' },
      createMockContext()
    );
    expect(importSpy).toHaveBeenCalled();
    expect(importResult.structuredContent?.success).toBe(true);

    const importFailure = await executeMissionProtocolTool(
      'create_template_import',
      { templatePath: 'demo.yaml' },
      createMockContext()
    );
    expect(importFailure.content?.[0]?.text).toContain('Import failed');

    const exportResult = await executeMissionProtocolTool(
      'get_template_export',
      { templatePath: 'demo.yaml' },
      createMockContext()
    );
    expect(exportSpy).toHaveBeenCalled();
    expect(exportResult.structuredContent?.success).toBe(false);
    expect(exportResult.content?.[0]?.text).toContain('Export failed');

    const exportSuccess = await executeMissionProtocolTool(
      'get_template_export',
      { templatePath: 'demo.yaml' },
      createMockContext()
    );
    expect(exportSuccess.structuredContent?.success).toBe(true);
    expect(exportSuccess.content?.[0]?.text).toContain('Exported successfully');
  });

  test('delegates get_dependency_analysis', async () => {
    const analyzeSpy = jest
      .spyOn(analyzeDependenciesModule, 'executeAnalyzeDependenciesTool')
      .mockResolvedValue('Dependency summary');

    const result = await executeMissionProtocolTool(
      'get_dependency_analysis',
      { registryFile: 'registry.yaml' },
      createMockContext()
    );

    expect(analyzeSpy).toHaveBeenCalled();
    expect(result.structuredContent?.summary).toBe('Dependency summary');
  });
});
