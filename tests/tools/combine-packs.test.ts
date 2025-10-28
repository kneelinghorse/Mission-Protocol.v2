import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import { buildMissionProtocolContext } from '../../src/index';
import { CombinePacksToolImpl, handleCombinePacks } from '../../src/tools/combine-packs';

describe('create_combined_pack MCP tool', () => {
  let context: Awaited<ReturnType<typeof buildMissionProtocolContext>>;

  beforeAll(async () => {
    context = await buildMissionProtocolContext();
  });

  it('combines the foundation pack successfully', async () => {
    const result = await context.combinePacksTool.execute(
      { packNames: ['foundation'], format: 'yaml' },
      'registry.yaml'
    );

    expect(result.success).toBe(true);
    expect(result.loadOrder).toEqual(expect.arrayContaining(['foundation']));
    expect(result.combinedPack).toContain('Combined: Foundation');
    expect(result.errors ?? []).toHaveLength(0);
  });

  it('supports JSON output formatting', async () => {
    const result = await context.combinePacksTool.execute(
      { packNames: ['foundation'], format: 'json' },
      'registry.yaml'
    );

    expect(result.success).toBe(true);
    expect(() => JSON.parse(result.combinedPack ?? '')).not.toThrow();
  });

  it('returns errors when pack is missing', async () => {
    const result = await context.combinePacksTool.execute(
      { packNames: ['missing-pack'] },
      'registry.yaml'
    );

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('missing-pack');
  });

  it('validates selective strategy requires override or merge paths', async () => {
    const result = await context.combinePacksTool.execute(
      { packNames: ['foundation'], strategy: 'selective' },
      'registry.yaml'
    );

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('Selective strategy requires');
  });

  it('previews combination without warnings', async () => {
    const preview = await context.combinePacksTool.preview(
      { packNames: ['foundation'] },
      'registry.yaml'
    );

    expect(preview.success).toBe(true);
    expect(preview.loadOrder).toEqual(expect.arrayContaining(['foundation']));
  });

  it('returns preview errors for missing pack', async () => {
    const preview = await context.combinePacksTool.preview(
      { packNames: ['missing-pack'] },
      'registry.yaml'
    );

    expect(preview.success).toBe(false);
    expect(preview.errors?.[0]).toContain('missing-pack');
  });
});

describe('CombinePacksToolImpl (mocked dependencies)', () => {
  const registryMock = {
    loadRegistry: jest.fn() as jest.MockedFunction<(registryPath?: string) => Promise<any>>,
  };
  const packLoaderMock = {
    loadPack: jest.fn() as jest.MockedFunction<(name: string, entries: any) => Promise<any>>,
  };
  const combinerMock = {
    combine: jest.fn(),
    preview: jest.fn(),
  };
  const loaderMock = {} as any;

  beforeEach(() => {
    registryMock.loadRegistry.mockReset();
    packLoaderMock.loadPack.mockReset();
    combinerMock.combine.mockReset();
    combinerMock.preview.mockReset();
  });

  it('rejects when no pack names provided', async () => {
    const tool = new CombinePacksToolImpl(
      packLoaderMock as any,
      combinerMock as any,
      registryMock as any,
      loaderMock
    );

    const result = await tool.execute({ packNames: [] }, 'registry.yaml');

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('At least one pack name is required');
  });

  it('propagates combiner warnings', async () => {
    const tool = new CombinePacksToolImpl(
      packLoaderMock as any,
      combinerMock as any,
      registryMock as any,
      loaderMock
    );

    registryMock.loadRegistry.mockResolvedValue([{ name: 'a' }]);
    packLoaderMock.loadPack.mockImplementation(
      async (name: string) => ({ manifest: { name } }) as any
    );
    combinerMock.combine.mockReturnValue({
      success: true,
      combinedPack: { manifest: { name: 'combined' } },
      warnings: ['size warning'],
      dependencyResolution: { loadOrder: ['a'] },
    });

    const result = await tool.execute({ packNames: ['a'] }, 'registry.yaml');

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual(['size warning']);
    expect(result.loadOrder).toEqual(['a']);
  });

  it('handles combiner failure with errors', async () => {
    const tool = new CombinePacksToolImpl(
      packLoaderMock as any,
      combinerMock as any,
      registryMock as any,
      loaderMock
    );

    registryMock.loadRegistry.mockResolvedValue([{ name: 'a' }]);
    packLoaderMock.loadPack.mockImplementation(
      async (name: string) => ({ manifest: { name } }) as any
    );
    combinerMock.combine.mockReturnValue({
      success: false,
      errors: ['conflict detected'],
      warnings: [],
    });

    const result = await tool.execute({ packNames: ['a'] }, 'registry.yaml');

    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('conflict detected');
  });
});

describe('handleCombinePacks formatting', () => {
  it('includes warnings and combined pack output', async () => {
    const executeSpy = jest.spyOn(CombinePacksToolImpl.prototype, 'execute').mockResolvedValue({
      success: true,
      combinedPack: 'manifest:\n  name: combined-pack',
      loadOrder: ['alpha', 'beta'],
      warnings: ['size warning'],
      errors: [],
    });

    const response = await handleCombinePacks(
      { packNames: ['alpha', 'beta'], format: 'yaml' },
      'registry.yaml',
      {} as any,
      {} as any,
      {} as any
    );

    expect(response).toContain('Load order');
    expect(response).toContain('Warnings');
    expect(response).toContain('Combined Pack');

    executeSpy.mockRestore();
  });

  it('throws when execution fails', async () => {
    const executeSpy = jest.spyOn(CombinePacksToolImpl.prototype, 'execute').mockResolvedValue({
      success: false,
      errors: ['dependency failure'],
      warnings: [],
    } as any);

    await expect(
      handleCombinePacks({ packNames: ['alpha'] }, 'registry.yaml', {} as any, {} as any, {} as any)
    ).rejects.toThrow('dependency failure');

    executeSpy.mockRestore();
  });
});
