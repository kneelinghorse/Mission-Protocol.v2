/**
 * Optimize Tokens Tool Tests
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { OptimizeTokensToolImpl, OptimizeTokensParams } from '../../src/tools/optimize-tokens';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('OptimizeTokensTool', () => {
  let tool: OptimizeTokensToolImpl;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    tool = new OptimizeTokensToolImpl();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'token-optimizer-test-'));
    testFilePath = path.join(tempDir, 'test-mission.yaml');
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('execute', () => {
    test('should optimize a mission file', async () => {
      const missionContent = `objective: Could you please provide a detailed explanation of the mission
context: In order to understand this mission, you need to know the background
successCriteria: It is important to note that all tests must pass`;

      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
        compressionLevel: 'balanced',
      };

      const result = await tool.execute(params);

      expect(result.success).toBe(true);
      expect(result.optimizedContent).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.stats!.compressedTokens).toBeLessThan(result.stats!.originalTokens);
    });

    test('should create backup file when optimizing', async () => {
      const missionContent = 'objective: Test mission';
      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'gpt',
      };

      await tool.execute(params);

      const backupPath = `${testFilePath}.backup`;
      const backupExists = await fs
        .access(backupPath)
        .then(() => true)
        .catch(() => false);

      expect(backupExists).toBe(true);
    });

    test('should not modify file in dry run mode', async () => {
      const originalContent = 'objective: Test mission content';
      await fs.writeFile(testFilePath, originalContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
        dryRun: true,
      };

      const result = await tool.execute(params);

      const fileContent = await fs.readFile(testFilePath, 'utf-8');

      expect(result.success).toBe(true);
      expect(fileContent).toBe(originalContent);
      expect(result.stats).toBeDefined();
    });

    test('should return error for non-existent file', async () => {
      const params: OptimizeTokensParams = {
        missionFile: '/non/existent/file.yaml',
        targetModel: 'claude',
      };

      const result = await tool.execute(params);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });

    test('should handle different compression levels', async () => {
      const missionContent = 'objective: Test mission';
      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const levels: Array<'conservative' | 'balanced' | 'aggressive'> = [
        'conservative',
        'balanced',
        'aggressive',
      ];

      for (const level of levels) {
        const params: OptimizeTokensParams = {
          missionFile: testFilePath,
          targetModel: 'claude',
          compressionLevel: level,
          dryRun: true,
        };

        const result = await tool.execute(params);
        expect(result.success).toBe(true);
      }
    });

    test('should handle different target models', async () => {
      const missionContent = 'objective: Test mission';
      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const models: Array<'claude' | 'gpt' | 'gemini'> = ['claude', 'gpt', 'gemini'];

      for (const model of models) {
        const params: OptimizeTokensParams = {
          missionFile: testFilePath,
          targetModel: model,
          dryRun: true,
        };

        const result = await tool.execute(params);
        expect(result.success).toBe(true);
      }
    });

    test('should preserve custom tags', async () => {
      const missionContent = `objective: Test mission
<critical>Must preserve this exact text</critical>
other: Content to compress`;

      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
        preserveTags: ['critical'],
        dryRun: true,
      };

      const result = await tool.execute(params);

      expect(result.success).toBe(true);
      expect(result.optimizedContent).toContain('Must preserve this exact text');
    });

    test('should include warnings when compression outside target', async () => {
      const shortContent = 'abc';
      await fs.writeFile(testFilePath, shortContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
        dryRun: true,
      };

      const result = await tool.execute(params);

      // Very short content may generate warnings
      if (
        result.stats &&
        (result.stats.reductionPercentage < 20 || result.stats.reductionPercentage > 30)
      ) {
        expect(result.warnings).toBeDefined();
      }
    });

    test('should return compression statistics', async () => {
      const missionContent = 'objective: Could you please test this verbose content';
      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
        dryRun: true,
      };

      const result = await tool.execute(params);

      expect(result.stats).toBeDefined();
      expect(result.stats!.originalTokens).toBeGreaterThan(0);
      expect(result.stats!.compressedTokens).toBeGreaterThan(0);
      expect(typeof result.stats!.reductionPercentage).toBe('number');
      expect(result.stats!.compressionRatio).toBeGreaterThan(0);
      expect(result.stats!.passesApplied).toBeDefined();
      expect(result.stats!.passesApplied.length).toBeGreaterThan(0);
    });

    test('should handle file write errors gracefully', async () => {
      const missionContent = 'objective: Test';
      await fs.writeFile(testFilePath, missionContent, 'utf-8');

      // Make file read-only to trigger write error
      await fs.chmod(testFilePath, 0o444);

      const params: OptimizeTokensParams = {
        missionFile: testFilePath,
        targetModel: 'claude',
      };

      const result = await tool.execute(params);

      // Should handle the error
      if (!result.success) {
        expect(result.error).toBeDefined();
      }

      // Restore permissions for cleanup
      await fs.chmod(testFilePath, 0o644);
    });
  });

  describe('Tool definition', () => {
    test('should have correct tool name', () => {
      const { optimizeTokensToolDefinition } = require('../../src/tools/optimize-tokens');
      expect(optimizeTokensToolDefinition.name).toBe('optimize_tokens');
    });

    test('should require missionFile and targetModel', () => {
      const { optimizeTokensToolDefinition } = require('../../src/tools/optimize-tokens');
      expect(optimizeTokensToolDefinition.inputSchema.required).toContain('missionFile');
      expect(optimizeTokensToolDefinition.inputSchema.required).toContain('targetModel');
    });

    test('should support all compression levels', () => {
      const { optimizeTokensToolDefinition } = require('../../src/tools/optimize-tokens');
      const compressionLevelEnum =
        optimizeTokensToolDefinition.inputSchema.properties.compressionLevel.enum;

      expect(compressionLevelEnum).toContain('conservative');
      expect(compressionLevelEnum).toContain('balanced');
      expect(compressionLevelEnum).toContain('aggressive');
    });

    test('should support all target models', () => {
      const { optimizeTokensToolDefinition } = require('../../src/tools/optimize-tokens');
      const targetModelEnum = optimizeTokensToolDefinition.inputSchema.properties.targetModel.enum;

      expect(targetModelEnum).toContain('claude');
      expect(targetModelEnum).toContain('gpt');
      expect(targetModelEnum).toContain('gemini');
    });
  });
});
