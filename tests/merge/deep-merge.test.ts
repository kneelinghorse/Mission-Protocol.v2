/**
 * Comprehensive test suite for deep merge algorithm
 *
 * Tests all merge scenarios:
 * - Dictionary merging (shallow and deep)
 * - List/array concatenation
 * - Scalar value replacement
 * - Null handling and field removal
 * - Edge cases and type mismatches
 * - Real-world mission template merging
 */

import { describe, it, expect } from '@jest/globals';
import { MissionMerger, deepMerge, MergeOptions } from '../../src/merge/deep-merge';

describe('MissionMerger', () => {
  let merger: MissionMerger;

  beforeEach(() => {
    merger = new MissionMerger();
  });

  describe('Dictionary Merging', () => {
    it('should merge shallow objects', () => {
      const base = { a: 1, b: 2 };
      const extension = { c: 3 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
      expect(base).toEqual({ a: 1, b: 2 }); // No mutation
    });

    it('should override base values with extension values', () => {
      const base = { a: 1, b: 2 };
      const extension = { b: 999 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1, b: 999 });
    });

    it('should merge nested objects recursively', () => {
      const base = {
        context: {
          background: 'Generic background',
          dependencies: ['dep1'],
        },
      };
      const extension = {
        context: {
          background: 'Domain background',
          constraints: ['constraint1'],
        },
      };
      const result = merger.merge(base, extension);

      expect(result).toEqual({
        context: {
          background: 'Domain background',
          dependencies: ['dep1'],
          constraints: ['constraint1'],
        },
      });
    });

    it('should merge deeply nested objects', () => {
      const base = {
        level1: {
          level2: {
            level3: {
              value: 'base',
            },
          },
        },
      };
      const extension = {
        level1: {
          level2: {
            level3: {
              newValue: 'extension',
            },
          },
        },
      };
      const result = merger.merge(base, extension);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              value: 'base',
              newValue: 'extension',
            },
          },
        },
      });
    });
  });

  describe('List/Array Merging', () => {
    it('should concatenate arrays by default', () => {
      const base = { items: [1, 2] };
      const extension = { items: [3, 4] };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ items: [1, 2, 3, 4] });
    });

    it('should concatenate empty arrays correctly', () => {
      const base = { items: [] };
      const extension = { items: [1] };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ items: [1] });
    });

    it('should replace arrays when arrayStrategy is "replace"', () => {
      const base = { items: [1, 2, 3] };
      const extension = { items: [4, 5] };
      const options: MergeOptions = { arrayStrategy: 'replace' };
      const result = merger.merge(base, extension, options);

      expect(result).toEqual({ items: [4, 5] });
    });

    it('should remove duplicates when listStrategy is "unique"', () => {
      const base = { tags: ['tag1', 'tag2'] };
      const extension = { tags: ['tag2', 'tag3'] };
      const options: MergeOptions = { listStrategy: 'unique' };
      const result = merger.merge(base, extension, options);

      expect(result.tags).toHaveLength(3);
      expect(result.tags).toContain('tag1');
      expect(result.tags).toContain('tag2');
      expect(result.tags).toContain('tag3');
    });

    it('should concatenate arrays of objects', () => {
      const base = { items: [{ id: 1 }, { id: 2 }] };
      const extension = { items: [{ id: 3 }] };
      const result = merger.merge(base, extension);

      expect(result).toEqual({
        items: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
    });
  });

  describe('Scalar Value Handling', () => {
    it('should replace string values', () => {
      const base = { name: 'Generic' };
      const extension = { name: 'Domain' };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ name: 'Domain' });
    });

    it('should replace number values', () => {
      const base = { count: 10 };
      const extension = { count: 20 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ count: 20 });
    });

    it('should replace boolean values', () => {
      const base = { enabled: false };
      const extension = { enabled: true };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ enabled: true });
    });
  });

  describe('Null and Undefined Handling', () => {
    it('should remove field when extension value is null', () => {
      const base = { a: 1, b: 2, c: 3 };
      const extension = { b: null };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1, c: 3 });
      expect(result).not.toHaveProperty('b');
    });

    it('should handle null in nested objects', () => {
      const base = {
        context: {
          background: 'text',
          dependencies: ['dep1'],
        },
      };
      const extension = {
        context: {
          dependencies: null,
        },
      };
      const result = merger.merge(base, extension);

      expect(result).toEqual({
        context: {
          background: 'text',
        },
      });
    });

    it('should ignore undefined values', () => {
      const base = { a: 1, b: 2 };
      const extension = { b: undefined, c: 3 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should handle base being null', () => {
      const base = null;
      const extension = { a: 1 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle extension being null', () => {
      const base = { a: 1 };
      const extension = null;
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1 });
    });
  });

  describe('Type Mismatch Handling', () => {
    it('should replace object with scalar (domain wins)', () => {
      const base = { value: { nested: 'object' } };
      const extension = { value: 'scalar' };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ value: 'scalar' });
    });

    it('should replace scalar with object (domain wins)', () => {
      const base = { value: 'scalar' };
      const extension = { value: { nested: 'object' } };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ value: { nested: 'object' } });
    });

    it('should replace array with scalar (domain wins)', () => {
      const base = { value: [1, 2, 3] };
      const extension = { value: 'scalar' };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ value: 'scalar' });
    });

    it('should replace scalar with array (domain wins)', () => {
      const base = { value: 'scalar' };
      const extension = { value: [1, 2, 3] };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ value: [1, 2, 3] });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const base = {};
      const extension = { a: 1 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle merging with empty extension', () => {
      const base = { a: 1 };
      const extension = {};
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1 });
    });

    it('should handle Date objects as scalars', () => {
      const date1 = new Date('2025-01-01');
      const date2 = new Date('2025-02-01');
      const base = { date: date1 };
      const extension = { date: date2 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ date: date2 });
    });

    it('should handle RegExp objects as scalars', () => {
      const regex1 = /test1/;
      const regex2 = /test2/;
      const base = { pattern: regex1 };
      const extension = { pattern: regex2 };
      const result = merger.merge(base, extension);

      expect(result).toEqual({ pattern: regex2 });
    });

    it('should not mutate source objects', () => {
      const base = { a: 1, nested: { b: 2 } };
      const extension = { nested: { c: 3 } };
      const baseCopy = JSON.parse(JSON.stringify(base));
      const extCopy = JSON.parse(JSON.stringify(extension));

      merger.merge(base, extension);

      expect(base).toEqual(baseCopy);
      expect(extension).toEqual(extCopy);
    });
  });

  describe('Determinism', () => {
    it('should produce same output for same inputs', () => {
      const base = {
        a: 1,
        b: { c: 2 },
        d: [1, 2, 3],
      };
      const extension = {
        b: { e: 4 },
        d: [4, 5],
      };

      const result1 = merger.merge(base, extension);
      const result2 = merger.merge(base, extension);

      expect(result1).toEqual(result2);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    it('should produce deterministic hash for merged results', () => {
      const base = { x: 1, y: 2, z: 3 };
      const extension = { y: 99, w: 4 };

      const hash1 = JSON.stringify(merger.merge(base, extension));
      const hash2 = JSON.stringify(merger.merge(base, extension));

      expect(hash1).toBe(hash2);
    });
  });

  describe('Real-world Mission Merging', () => {
    it('should merge generic mission with domain fields', () => {
      const genericMission = {
        schemaType: 'Mission' as const,
        schemaVersion: '2.0' as const,
        missionId: 'generic-001',
        objective: 'Complete a technical task',
        context: {
          background: 'Generic background',
          dependencies: [],
        },
        successCriteria: ['Generic criterion'],
        deliverables: ['Generic deliverable'],
        domainFields: {},
      };

      const domainPack = {
        context: {
          background: 'Software development task',
          constraints: ['Use TypeScript', 'Follow coding standards'],
        },
        successCriteria: ['All tests pass', 'Code reviewed'],
        domainFields: {
          techStack: 'TypeScript',
          framework: 'Node.js',
          testingFramework: 'Jest',
        },
      };

      const result = merger.merge(genericMission, domainPack);

      expect(result).toEqual({
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'generic-001',
        objective: 'Complete a technical task',
        context: {
          background: 'Software development task',
          dependencies: [],
          constraints: ['Use TypeScript', 'Follow coding standards'],
        },
        successCriteria: ['Generic criterion', 'All tests pass', 'Code reviewed'],
        deliverables: ['Generic deliverable'],
        domainFields: {
          techStack: 'TypeScript',
          framework: 'Node.js',
          testingFramework: 'Jest',
        },
      });
    });

    it('should merge context objects correctly', () => {
      const baseContext = {
        background: 'Base context',
        dependencies: ['dep1', 'dep2'],
      };

      const domainContext = {
        background: 'Domain context',
        constraints: ['constraint1'],
      };

      const result = merger.merge({ context: baseContext }, { context: domainContext });

      expect(result.context).toEqual({
        background: 'Domain context',
        dependencies: ['dep1', 'dep2'],
        constraints: ['constraint1'],
      });
    });
  });

  describe('deepMerge convenience function', () => {
    it('should work as a standalone function', () => {
      const base = { a: 1, b: 2 };
      const extension = { c: 3 };
      const result = deepMerge(base, extension);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should accept merge options', () => {
      const base = { items: [1, 2] };
      const extension = { items: [3, 4] };
      const result = deepMerge(base, extension, { arrayStrategy: 'replace' });

      expect(result).toEqual({ items: [3, 4] });
    });
  });

  describe('Additional Coverage Tests', () => {
    it('should handle undefined extension at top level', () => {
      const base = { a: 1 };
      const extension = undefined;
      const result = merger.merge(base, extension);

      expect(result).toEqual({ a: 1 });
    });

    it('should merge arrays at top level', () => {
      const base = [1, 2, 3];
      const extension = [4, 5];
      const result = merger.merge(base, extension);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should replace scalar at top level', () => {
      const base = 'old value';
      const extension = 'new value';
      const result = merger.merge(base, extension);

      expect(result).toBe('new value');
    });

    it('should handle array with override strategy', () => {
      const base = [1, 2, 3];
      const extension = [4, 5];
      const result = merger.merge(base, extension, { listStrategy: 'override' });

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
