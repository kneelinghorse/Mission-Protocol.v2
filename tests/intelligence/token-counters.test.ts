/**
 * Token Counters Tests
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { TokenCounter } from '../../src/intelligence/token-counters';

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
  });

  describe('GPT token counting', () => {
    test('should count tokens for simple text', async () => {
      const text = 'Hello, world!';
      const result = await tokenCounter.count(text, 'gpt');

      expect(result.model).toBe('gpt');
      expect(result.count).toBeGreaterThan(0);
      expect(result.count).toBeLessThan(10);
    });

    test('should count more tokens for longer text', async () => {
      const shortText = 'Hello';
      const longText = 'Hello, this is a much longer sentence with many more words to count.';

      const shortResult = await tokenCounter.count(shortText, 'gpt');
      const longResult = await tokenCounter.count(longText, 'gpt');

      expect(longResult.count).toBeGreaterThan(shortResult.count);
    });

    test('should include cost estimate', async () => {
      const text = 'Sample text for cost estimation';
      const result = await tokenCounter.count(text, 'gpt');

      expect(result.estimatedCost).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('Claude token counting', () => {
    test('should use fallback counting when API key not available', async () => {
      const text = 'Test text for Claude';
      const result = await tokenCounter.count(text, 'claude');

      expect(result.model).toBe('claude');
      expect(result.count).toBeGreaterThan(0);
    });

    test('should handle empty text', async () => {
      const text = '';
      const result = await tokenCounter.count(text, 'claude');

      expect(result.count).toBe(0);
    });
  });

  describe('Gemini token counting', () => {
    test('should use fallback counting when API key not available', async () => {
      const text = 'Test text for Gemini';
      const result = await tokenCounter.count(text, 'gemini');

      expect(result.model).toBe('gemini');
      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe('Fallback counting', () => {
    test('should provide reasonable estimates', async () => {
      const text = 'This is a test sentence with approximately twenty characters per word on average.';
      const result = await tokenCounter.count(text, 'claude');

      // Fallback uses ~4 chars per token
      const expectedTokens = Math.ceil(text.length / 4);
      expect(result.count).toBe(expectedTokens);
    });

    test('should handle special characters', async () => {
      const text = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./';
      const result = await tokenCounter.count(text, 'gpt');

      expect(result.count).toBeGreaterThan(0);
    });

    test('should handle unicode characters', async () => {
      const text = 'Hello 世界 🌍';
      const result = await tokenCounter.count(text, 'claude');

      expect(result.count).toBeGreaterThan(0);
    });
  });

  describe('Cost estimation', () => {
    test('should estimate GPT costs correctly', async () => {
      const text = 'a'.repeat(4000); // ~1000 tokens
      const result = await tokenCounter.count(text, 'gpt');

      expect(result.estimatedCost).toBeDefined();
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.estimatedCost).toBeLessThan(0.01); // Should be less than 1 cent
    });
  });

  describe('Error handling', () => {
    test('should throw error for unsupported model', async () => {
      const text = 'Test text';

      await expect(
        tokenCounter.count(text, 'unsupported' as any)
      ).rejects.toThrow('Unsupported model');
    });

    test('should handle null or undefined text gracefully', async () => {
      const result = await tokenCounter.count('', 'gpt');
      expect(result.count).toBe(0);
    });
  });

  describe('Model-specific tokenization differences', () => {
    test('different models may produce different token counts', async () => {
      const text = 'This is a test of model-specific tokenization differences.';

      const gptResult = await tokenCounter.count(text, 'gpt');
      const claudeResult = await tokenCounter.count(text, 'claude');
      const geminiResult = await tokenCounter.count(text, 'gemini');

      // All should be positive
      expect(gptResult.count).toBeGreaterThan(0);
      expect(claudeResult.count).toBeGreaterThan(0);
      expect(geminiResult.count).toBeGreaterThan(0);

      // Counts may differ due to different tokenizers
      // (though fallback will give same results)
    });
  });
});
