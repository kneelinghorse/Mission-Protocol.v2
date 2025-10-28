import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  DeepMergeStrategy,
  MergeStrategyFactory,
  OverrideStrategy,
  SelectiveMergeStrategy,
} from '../../src/combination/merge-strategies';
import { MissionMerger } from '../../src/merge/deep-merge';

describe('merge strategies', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('MergeStrategyFactory', () => {
    it('returns concrete strategies for known identifiers', () => {
      expect(MergeStrategyFactory.create('deep-merge')).toBeInstanceOf(DeepMergeStrategy);
      expect(MergeStrategyFactory.create('override')).toBeInstanceOf(OverrideStrategy);

      const selective = MergeStrategyFactory.create('selective', {
        mergePaths: ['metadata.tags'],
        overridePaths: ['spec.resources'],
      });
      expect(selective).toBeInstanceOf(SelectiveMergeStrategy);
    });

    it('requires options for selective strategy', () => {
      expect(() => MergeStrategyFactory.create('selective')).toThrow(
        'Selective merge strategy requires options with merge/override paths'
      );
    });

    it('rejects unknown strategies', () => {
      expect(() => MergeStrategyFactory.create('unexpected' as any)).toThrow(
        'Unknown merge strategy: unexpected'
      );
    });
  });

  describe('SelectiveMergeStrategy', () => {
    let strategy: SelectiveMergeStrategy;

    beforeEach(() => {
      strategy = new SelectiveMergeStrategy({
        mergePaths: ['spec.rules', 'metadata.annotations.*'],
        overridePaths: ['spec.owner', 'metadata.labels.team'],
      });
    });

    it('merges configured paths recursively while preserving base content', () => {
      const templates = [
        {
          spec: {
            rules: ['baseline'],
            owner: { name: 'alpha', contact: 'alpha@example.com' },
            defaults: { enable: true },
          },
          metadata: {
            annotations: {
              'mission/overview': ['stage-1'],
            },
          },
        },
        {
          spec: {
            rules: ['addition'],
            owner: { name: 'beta', contact: 'beta@example.com' },
            defaults: { threshold: 3 },
          },
          metadata: {
            annotations: {
              'mission/overview': ['stage-2'],
            },
          },
        },
      ];

      const result = strategy.merge(templates) as Record<string, any>;

      expect(result.spec?.rules).toEqual(['baseline', 'addition']);
      expect(result.spec?.owner).toEqual({ name: 'beta', contact: 'beta@example.com' });
      expect(result.spec?.defaults).toEqual({ enable: true, threshold: 3 });
      expect(result.metadata?.annotations?.['mission/overview']).toEqual(['stage-1', 'stage-2']);
    });

    it('supports wildcard override patterns', () => {
      const wildcardStrategy = new SelectiveMergeStrategy({
        mergePaths: [],
        overridePaths: ['metadata.labels.*'],
      });

      const result = wildcardStrategy.merge([
        { metadata: { labels: { team: 'alpha', tier: 'gold' } } },
        { metadata: { labels: { team: 'beta' } } },
      ]) as Record<string, any>;

      expect(result.metadata?.labels?.team).toBe('beta');
      expect(result.metadata?.labels?.tier).toBe('gold');
    });

    it('falls back to mission merger when no overrides or merges specified', () => {
      const mergeSpy = jest
        .spyOn(MissionMerger.prototype, 'merge')
        .mockImplementation((base: any, extension: any) => ({
          ...base,
          ...extension,
          $merged: true,
        }));

      const neutralStrategy = new SelectiveMergeStrategy({
        mergePaths: [],
        overridePaths: [],
      });

      const result = neutralStrategy.merge([
        { spec: { defaults: { retries: 1 } } },
        { spec: { defaults: { timeout: 30 } } },
      ]) as Record<string, any>;

      expect(mergeSpy).toHaveBeenCalled();
      expect(mergeSpy.mock.calls[0][0]).toMatchObject({ defaults: { retries: 1 } });
      expect(result.spec?.defaults).toHaveProperty('timeout', 30);
    });

    it('matches wildcard patterns against equal path length only', () => {
      const selective = strategy as unknown as {
        matchesPattern: (path: string, pattern: string) => boolean;
      };

      expect(
        selective.matchesPattern('metadata.annotations.summary', 'metadata.annotations.*')
      ).toBe(true);
      expect(selective.matchesPattern('metadata.annotations', 'metadata.annotations.*')).toBe(
        false
      );
      expect(selective.matchesPattern('metadata.annotations.summary', '*')).toBe(true);
    });
  });

  describe('strategy base cases', () => {
    it('returns empty object when deep merge receives no templates', () => {
      const strategy = new DeepMergeStrategy();
      expect(strategy.merge([])).toEqual({});
    });

    it('returns copy of single template for override strategy', () => {
      const strategy = new OverrideStrategy();
      const source = { value: 42 };
      const merged = strategy.merge([source]);
      expect(merged).toEqual(source);
      expect(merged).not.toBe(source);
    });

    it('handles empty arrays in selective strategy without custom paths', () => {
      const strategy = new SelectiveMergeStrategy({});
      expect(strategy.merge([])).toEqual({});

      const single = { spec: { phases: ['phase-1'] } };
      expect(strategy.merge([single])).toEqual(single);
    });

    it('merges arrays when mergePaths configured', () => {
      const strategy = new SelectiveMergeStrategy({ mergePaths: ['spec.tasks'] });
      const merged = strategy.merge([
        { spec: { tasks: ['a'] } },
        { spec: { tasks: ['b', 'c'] } },
      ]) as any;

      expect(merged.spec.tasks).toEqual(['a', 'b', 'c']);
    });
  });
});
