/**
 * Tests for PackCombiner
 *
 * Validates pack combination with different merge strategies,
 * dependency resolution integration, and validation.
 */

import { PackCombiner } from '../../src/combination/pack-combiner';
import { DomainPack } from '../../src/domains/types';
import { CombinationStrategy } from '../../src/combination/types';

describe('PackCombiner', () => {
  let combiner: PackCombiner;

  beforeEach(() => {
    combiner = new PackCombiner();
  });

  // Helper function to create mock packs
  function createMockPack(
    name: string,
    template: Record<string, unknown>,
    version: string = '1.0.0',
    dependencies: Array<{ name: string; version: string }> = []
  ): DomainPack {
    return {
      manifest: {
        name,
        version,
        displayName: `${name} Pack`,
        description: `Test pack ${name}`,
        author: 'Test Author',
        schema: 'schema.yaml',
        dependencies,
      },
      schema: { type: 'object' },
      template,
    };
  }

  describe('combine() - Deep Merge Strategy', () => {
    it('should combine two packs using deep merge', () => {
      const packA = createMockPack('pack-a', {
        field1: 'value1',
        nested: { a: 1 },
      });

      const packB = createMockPack('pack-b', {
        field2: 'value2',
        nested: { b: 2 },
      });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'deep-merge',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack).toBeDefined();
      expect(result.combinedPack?.template).toEqual({
        field1: 'value1',
        field2: 'value2',
        nested: { a: 1, b: 2 },
      });
    });

    it('should concatenate arrays in deep merge mode', () => {
      const packA = createMockPack('pack-a', {
        items: ['item1', 'item2'],
      });

      const packB = createMockPack('pack-b', {
        items: ['item3', 'item4'],
      });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'deep-merge',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template.items).toEqual([
        'item1',
        'item2',
        'item3',
        'item4',
      ]);
    });

    it('should handle three or more packs', () => {
      const packA = createMockPack('pack-a', { a: 1 });
      const packB = createMockPack('pack-b', { b: 2 });
      const packC = createMockPack('pack-c', { c: 3 });

      const result = combiner.combine([packA, packB, packC], [packA, packB, packC], {
        strategy: 'deep-merge',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('combine() - Override Strategy', () => {
    it('should use last pack values in override mode', () => {
      const packA = createMockPack('pack-a', {
        field: 'value-a',
        nested: { a: 1, shared: 'from-a' },
      });

      const packB = createMockPack('pack-b', {
        field: 'value-b',
        nested: { b: 2, shared: 'from-b' },
      });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'override',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({
        field: 'value-b',
        nested: { b: 2, shared: 'from-b' },
      });
    });

    it('should completely replace arrays in override mode', () => {
      const packA = createMockPack('pack-a', { items: ['a1', 'a2'] });
      const packB = createMockPack('pack-b', { items: ['b1'] });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'override',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template.items).toEqual(['b1']);
    });
  });

  describe('combine() - Selective Strategy', () => {
    it('should merge specified paths and override others', () => {
      const packA = createMockPack('pack-a', {
        merge: { a: 1 },
        override: { a: 1 },
      });

      const packB = createMockPack('pack-b', {
        merge: { b: 2 },
        override: { b: 2 },
      });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'selective',
        mergePaths: ['merge'],
        overridePaths: ['override'],
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({
        merge: { a: 1, b: 2 }, // Merged
        override: { b: 2 },      // Overridden
      });
    });
  });

  describe('combine() - Dependency Resolution', () => {
    it('should resolve dependencies and load in correct order', () => {
      // pack-c depends on pack-b, pack-b depends on pack-a
      const packA = createMockPack('pack-a', { a: 1 });
      const packB = createMockPack('pack-b', { b: 2 }, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);
      const packC = createMockPack('pack-c', { c: 3 }, '1.0.0', [
        { name: 'pack-b', version: '1.0.0' },
      ]);

      const result = combiner.combine([packC], [packA, packB, packC], {
        strategy: 'deep-merge',
        resolveDependencies: true,
      });

      expect(result.success).toBe(true);
      expect(result.dependencyResolution?.loadOrder).toEqual(['pack-a', 'pack-b', 'pack-c']);
      expect(result.combinedPack?.template).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should fail when circular dependency is detected', () => {
      const packA = createMockPack('pack-a', { a: 1 }, '1.0.0', [
        { name: 'pack-b', version: '1.0.0' },
      ]);
      const packB = createMockPack('pack-b', { b: 2 }, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);

      const result = combiner.combine([packA], [packA, packB], {
        resolveDependencies: true,
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.dependencyResolution?.circularDependencies.length).toBeGreaterThan(0);
    });

    it('should skip dependency resolution when disabled', () => {
      const packA = createMockPack('pack-a', { a: 1 });
      const packB = createMockPack('pack-b', { b: 2 }, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);

      const result = combiner.combine([packB], [packA, packB], {
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.dependencyResolution).toBeUndefined();
      // Only pack-b is combined (dependencies not resolved)
      expect(result.combinedPack?.template).toEqual({ b: 2 });
    });
  });

  describe('combine() - Validation', () => {
    it('should validate combined pack by default', () => {
      const packA = createMockPack('pack-a', { a: 1 });
      const packB = createMockPack('pack-b', { b: 2 });

      const result = combiner.combine([packA, packB], [packA, packB]);

      expect(result.success).toBe(true);
      expect(result.combinedPack).toBeDefined();
    });

    it('should skip validation when disabled', () => {
      const packA = createMockPack('pack-a', { a: 1 });

      const result = combiner.combine([packA], [packA], {
        validate: false,
      });

      expect(result.success).toBe(true);
    });

    it('should fail validation for empty pack list', () => {
      const result = combiner.combine([], []);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No packs provided for combination');
    });
  });

  describe('combine() - Manifest Merging', () => {
    it('should create combined manifest with source pack names', () => {
      const packA = createMockPack('pack-a', {});
      const packB = createMockPack('pack-b', {});

      const result = combiner.combine([packA, packB], [packA, packB], {
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.manifest.combinedFrom).toEqual(['pack-a', 'pack-b']);
      expect(result.combinedPack?.manifest.name).toContain('combined');
    });

    it('should merge dependencies from all packs', () => {
      const packA = createMockPack('pack-a', {}, '1.0.0', [
        { name: 'dep-1', version: '1.0.0' },
      ]);
      const packB = createMockPack('pack-b', {}, '1.0.0', [
        { name: 'dep-2', version: '1.0.0' },
      ]);

      const result = combiner.combine([packA, packB], [packA, packB], {
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.dependencies).toHaveLength(2);
      expect(result.combinedPack?.dependencies).toContainEqual({
        name: 'dep-1',
        version: '1.0.0',
      });
      expect(result.combinedPack?.dependencies).toContainEqual({
        name: 'dep-2',
        version: '1.0.0',
      });
    });
  });

  describe('combineByName()', () => {
    it('should combine packs by name', () => {
      const packA = createMockPack('pack-a', { a: 1 });
      const packB = createMockPack('pack-b', { b: 2 });

      const result = combiner.combineByName(
        ['pack-a', 'pack-b'],
        [packA, packB],
        { resolveDependencies: false }
      );

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({ a: 1, b: 2 });
    });

    it('should fail when pack name not found', () => {
      const packA = createMockPack('pack-a', {});

      const result = combiner.combineByName(['missing-pack'], [packA]);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Pack "missing-pack" not found in available packs');
    });
  });

  describe('preview()', () => {
    it('should preview combination without executing', () => {
      const packA = createMockPack('pack-a', {});
      const packB = createMockPack('pack-b', {}, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);

      const preview = combiner.preview([packB], [packA, packB], {
        resolveDependencies: true,
      });

      expect(preview.loadOrder).toEqual(['pack-a', 'pack-b']);
      expect(preview.warnings).toEqual([]);
    });

    it('should return warnings for invalid dependencies', () => {
      const packA = createMockPack('pack-a', {}, '2.0.0'); // Wrong version
      const packB = createMockPack('pack-b', {}, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);

      const preview = combiner.preview([packB], [packA, packB]);

      expect(preview.warnings.length).toBeGreaterThan(0);
      expect(preview.warnings[0]).toContain('version mismatch');
    });

    it('should return warnings for circular dependencies', () => {
      const packA = createMockPack('pack-a', {}, '1.0.0', [
        { name: 'pack-b', version: '1.0.0' },
      ]);
      const packB = createMockPack('pack-b', {}, '1.0.0', [
        { name: 'pack-a', version: '1.0.0' },
      ]);

      const preview = combiner.preview([packA], [packA, packB]);

      expect(preview.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single pack combination', () => {
      const pack = createMockPack('pack-a', { a: 1 });

      const result = combiner.combine([pack], [pack], {
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({ a: 1 });
    });

    it('should handle empty templates', () => {
      const packA = createMockPack('pack-a', {});
      const packB = createMockPack('pack-b', {});

      const result = combiner.combine([packA, packB], [packA, packB], {
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({});
      // Empty template warning is expected
      if (result.warnings && result.warnings.length > 0) {
        expect(result.warnings).toContain('Combined template is empty');
      }
    });

    it('should handle deeply nested objects', () => {
      const packA = createMockPack('pack-a', {
        level1: { level2: { level3: { a: 1 } } },
      });
      const packB = createMockPack('pack-b', {
        level1: { level2: { level3: { b: 2 } } },
      });

      const result = combiner.combine([packA, packB], [packA, packB], {
        strategy: 'deep-merge',
        resolveDependencies: false,
      });

      expect(result.success).toBe(true);
      expect(result.combinedPack?.template).toEqual({
        level1: { level2: { level3: { a: 1, b: 2 } } },
      });
    });
  });
});
