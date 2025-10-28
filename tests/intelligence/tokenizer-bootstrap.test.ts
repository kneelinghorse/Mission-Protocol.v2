import { describe, it, expect, beforeEach } from '@jest/globals';

jest.mock(
  'gpt-tokenizer',
  () => ({
    encode: jest.fn(),
  }),
  { virtual: true }
);

jest.mock(
  '@xenova/transformers',
  () => ({
    AutoTokenizer: {
      from_pretrained: jest.fn(),
    },
  }),
  { virtual: true }
);

describe('tokenizer-bootstrap', () => {
  let bootstrap: typeof import('../../src/intelligence/tokenizer-bootstrap');
  let gptTokenizerMock: { encode: jest.Mock };
  let transformersMock: {
    AutoTokenizer: {
      from_pretrained: jest.Mock;
    };
  };
  let claudeTokenizerFn: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    gptTokenizerMock = jest.requireMock('gpt-tokenizer') as { encode: jest.Mock };
    transformersMock = jest.requireMock('@xenova/transformers') as {
      AutoTokenizer: {
        from_pretrained: jest.Mock;
      };
    };

    claudeTokenizerFn = jest.fn(async (text: string) => ({
      input_ids: { data: Array(Math.max(1, Math.ceil(text.length / 3.5))).fill(0) },
    }));

    gptTokenizerMock.encode.mockImplementation((text: string) =>
      Array(Math.max(1, Math.ceil(text.length / 4))).fill(0)
    );
    transformersMock.AutoTokenizer.from_pretrained.mockImplementation(async () => claudeTokenizerFn);

    bootstrap = await import('../../src/intelligence/tokenizer-bootstrap');
    bootstrap.__test__.reset();
  });

  it('preloads tokenizers and reports ready status', async () => {
    await bootstrap.ensureTokenizersReady();
    const health = bootstrap.getTokenizerHealth();

    expect(health.models.gpt.ready).toBe(true);
    expect(health.models.claude.ready).toBe(true);
    expect(health.models.gpt.attempts).toBe(1);
    expect(health.models.claude.attempts).toBe(1);
    expect(transformersMock.AutoTokenizer.from_pretrained).toHaveBeenCalledTimes(1);
    expect(claudeTokenizerFn).not.toHaveBeenCalled();
  });

  it('records fallback counts in health snapshot', () => {
    bootstrap.recordTokenizerFallback('gpt');
    bootstrap.recordTokenizerFallback('gemini');
    const health = bootstrap.getTokenizerHealth();

    expect(health.fallbacks.gpt).toBe(1);
    expect(health.fallbacks.gemini).toBe(1);
    expect(health.models.gpt.ready).toBe(false);
  });

  it('captures failure metadata when preload fails', async () => {
    const originalEncode = gptTokenizerMock.encode;
    const originalLoader = transformersMock.AutoTokenizer.from_pretrained;

    delete (gptTokenizerMock as { encode?: unknown }).encode;
    transformersMock.AutoTokenizer.from_pretrained.mockImplementation(async () => {
      throw new Error('network down');
    });

    try {
      await bootstrap.ensureTokenizersReady();
      const health = bootstrap.getTokenizerHealth();

      expect(health.models.gpt.ready).toBe(false);
      expect(health.models.gpt.lastError).toBe('gpt-tokenizer encode export missing');
      expect(health.models.claude.ready).toBe(false);
      expect(health.models.claude.lastError).toContain('network down');
    } finally {
      gptTokenizerMock.encode = originalEncode;
      transformersMock.AutoTokenizer.from_pretrained = originalLoader;
      bootstrap.__test__.reset();
    }
  });
});
