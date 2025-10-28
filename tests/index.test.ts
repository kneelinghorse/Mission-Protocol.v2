import { describe, expect, test, beforeAll } from '@jest/globals';
import path from 'path';
import {
  getToolDefinitions,
  buildMissionProtocolContext,
  executeMissionProtocolTool,
  summarizeValue,
  sanitizeArgs,
} from '../src/index';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

describe('Mission Protocol entry point', () => {
  test('exposes tool definitions with expected identifiers', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((def) => def.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'get_available_domains',
        'list_available_domains',
        'create_mission',
        'create_combined_pack',
        'get_split_suggestions',
      ])
    );
  });

  test('buildMissionProtocolContext creates default components', async () => {
    const context = await buildMissionProtocolContext();

    expect(context.defaultModel).toBe('claude');
    expect(context.baseDir.endsWith(`${path.sep}templates`)).toBe(true);
    expect(typeof context.registryParser.loadRegistry).toBe('function');
    expect(typeof context.createMissionTool.execute).toBe('function');
    expect(typeof context.tokenCounter.count).toBe('function');
  });

  test('buildMissionProtocolContext respects overrides', async () => {
    const templatesDir = path.resolve(__dirname, '../templates');
    const context = await buildMissionProtocolContext({
      baseDir: templatesDir,
      defaultModel: 'gpt',
    });

    expect(context.baseDir).toBe(templatesDir);
    expect(context.defaultModel).toBe('gpt');
  });

  describe('executeMissionProtocolTool', () => {
    let context: Awaited<ReturnType<typeof buildMissionProtocolContext>>;

    beforeAll(async () => {
      context = await buildMissionProtocolContext();
    });

    test('get_available_domains returns structured domain list', async () => {
      const result = await executeMissionProtocolTool(
        'get_available_domains',
        {},
        context
      );

      expect(result.structuredContent?.success).toBe(true);
      expect(Array.isArray((result.structuredContent as any).domains)).toBe(true);
      expect((result.structuredContent as any).domains.length).toBeGreaterThan(0);
      expect(result.content?.[0]?.text).toContain('domain pack');
    });

    test('legacy list_available_domains alias resolves with warning', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = await executeMissionProtocolTool(
          'list_available_domains',
          {},
          context
        );

        expect(result.structuredContent?.success).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Tool 'list_available_domains' will be removed")
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    test('throws MCP error for unknown tool names', async () => {
      await expect(
        executeMissionProtocolTool('unknown_tool', {}, context)
      ).rejects.toMatchObject({
        code: ErrorCode.MethodNotFound,
      });
      await expect(
        executeMissionProtocolTool('unknown_tool', {}, context)
      ).rejects.toBeInstanceOf(McpError);
    });

  });

  describe('sanitization helpers', () => {
    test('summarizeValue truncates arrays and long strings', () => {
      const sample = summarizeValue({
        list: ['a', 'b', 'c', 'd', 'e', 'f'],
        details: 'x'.repeat(250),
      });

      expect(sample).toBe('[object]');

      const truncated = summarizeValue('0123456789'.repeat(25));
      expect((truncated as string).length).toBe(198);
      expect((truncated as string).endsWith('…')).toBe(true);

      const arraySummary = summarizeValue([1, 2, 3, 4, 5, 6]) as unknown[];
      expect(Array.isArray(arraySummary)).toBe(true);
      expect(arraySummary.length).toBe(5);
    });

    test('summarizeValue handles primitives, null, and short strings untouched', () => {
      expect(summarizeValue(null)).toBeNull();
      expect(summarizeValue(undefined)).toBeNull();
      expect(summarizeValue(42)).toBe(42);
      expect(summarizeValue('short string')).toBe('short string');
    });

    test('sanitizeArgs returns sanitized snapshot for plain objects', () => {
      const args = {
        payload: Array.from({ length: 7 }, (_, index) => index),
        hugeText: 'y'.repeat(210),
        nested: { foo: 'bar' },
      };

      const sanitized = sanitizeArgs(args)!;
      expect(Object.keys(sanitized)).toEqual(expect.arrayContaining(['payload', 'hugeText', 'nested']));
      expect((sanitized.payload as unknown[]).length).toBe(5);
      expect((sanitized.hugeText as string).endsWith('…')).toBe(true);
      expect(sanitized.nested).toBe('[object]');
    });

    test('sanitizeArgs returns undefined for non-objects', () => {
      expect(sanitizeArgs(null)).toBeUndefined();
      expect(sanitizeArgs(42)).toBeUndefined();
    });

    test('sanitizeArgs limits entries to first ten keys', () => {
      const args = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`key${index}`, index]));
      const sanitized = sanitizeArgs(args)!;
      expect(Object.keys(sanitized)).toHaveLength(10);
      expect(sanitized.key0).toBe(0);
      expect(sanitized.key10).toBeUndefined();
    });
  });

  test('create_mission_splits responses include heuristic warning for Gemini token usage', async () => {
    const result = await executeMissionProtocolTool(
      'create_mission_splits',
      {},
      {
        splitMissionTool: {
          execute: jest.fn().mockResolvedValue({
            shouldSplit: true,
            summary: 'summary',
            complexity: { score: 7.2, reasons: ['complex'] },
            tokenUsage: {
              model: 'gemini',
              totalTokens: 1500,
              estimatedCost: 1.0,
              contextWindow: 1000000,
              utilization: 0.0015,
            },
          }),
          formatForLLM: jest.fn().mockReturnValue('formatted'),
        },
      } as any
    );

    const warning = (result.structuredContent as any).tokenUsage?.heuristicWarning;
    expect(warning).toContain('Gemini token counts');
    expect(result.content?.[0]?.text).toContain('⚠ Gemini token counts');
  });
});
