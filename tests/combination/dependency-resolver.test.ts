/**
 * Tests for DependencyResolver
 *
 * Validates dependency resolution, circular dependency detection,
 * and topological sorting.
 */

import { DependencyResolver } from '../../src/combination/dependency-resolver';
import { DomainPack } from '../../src/domains/types';
import { CircularDependencyError, DependencyNotFoundError } from '../../src/combination/types';

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  // Helper function to create mock packs
  function createMockPack(
    name: string,
    version: string = '1.0.0',
    dependencies: Array<{ name: string; version: string }> = []
  ): DomainPack {
    return {
      manifest: {
        name,
        version,
        displayName: `${name} Pack`,
        description: `Test pack ${name}`,
        schema: 'schema.yaml',
        dependencies,
      },
      schema: { type: 'object' },
      template: {},
    };
  }

  describe('resolve()', () => {
    it('should resolve a single pack with no dependencies', () => {
      const pack = createMockPack('pack-a');
      const result = resolver.resolve([pack], [pack]);

      expect(result.success).toBe(true);
      expect(result.loadOrder).toEqual(['pack-a']);
      expect(result.circularDependencies).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should resolve multiple packs with no dependencies', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b');
      const packC = createMockPack('pack-c');

      const result = resolver.resolve([packA, packB, packC], [packA, packB, packC]);

      expect(result.success).toBe(true);
      expect(result.loadOrder).toHaveLength(3);
      expect(result.loadOrder).toContain('pack-a');
      expect(result.loadOrder).toContain('pack-b');
      expect(result.loadOrder).toContain('pack-c');
    });

    it('should resolve linear dependency chain', () => {
      // pack-c depends on pack-b, pack-b depends on pack-a
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packC = createMockPack('pack-c', '1.0.0', [{ name: 'pack-b', version: '1.0.0' }]);

      const result = resolver.resolve([packC], [packA, packB, packC]);

      expect(result.success).toBe(true);
      expect(result.loadOrder).toEqual(['pack-a', 'pack-b', 'pack-c']);
    });

    it('should resolve diamond dependency structure', () => {
      // pack-d depends on pack-b and pack-c
      // pack-b and pack-c both depend on pack-a
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packC = createMockPack('pack-c', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packD = createMockPack('pack-d', '1.0.0', [
        { name: 'pack-b', version: '1.0.0' },
        { name: 'pack-c', version: '1.0.0' },
      ]);

      const result = resolver.resolve([packD], [packA, packB, packC, packD]);

      expect(result.success).toBe(true);
      expect(result.loadOrder[0]).toBe('pack-a'); // Base dependency first
      expect(result.loadOrder[result.loadOrder.length - 1]).toBe('pack-d'); // Dependent last
      expect(result.loadOrder).toHaveLength(4);
    });

    it('should detect circular dependency (2 packs)', () => {
      // pack-a depends on pack-b, pack-b depends on pack-a
      const packA = createMockPack('pack-a', '1.0.0', [{ name: 'pack-b', version: '1.0.0' }]);
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const result = resolver.resolve([packA], [packA, packB]);

      expect(result.success).toBe(false);
      expect(result.circularDependencies.length).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect circular dependency (3 packs)', () => {
      // pack-a -> pack-b -> pack-c -> pack-a
      const packA = createMockPack('pack-a', '1.0.0', [{ name: 'pack-b', version: '1.0.0' }]);
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-c', version: '1.0.0' }]);
      const packC = createMockPack('pack-c', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const result = resolver.resolve([packA], [packA, packB, packC]);

      expect(result.success).toBe(false);
      expect(result.circularDependencies.length).toBeGreaterThan(0);
    });

    it('should fail when dependency is not available', () => {
      const packA = createMockPack('pack-a', '1.0.0', [{ name: 'missing-pack', version: '1.0.0' }]);

      const result = resolver.resolve([packA], [packA]);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('missing-pack');
    });
  });

  describe('validateDependencies()', () => {
    it('should validate pack with no dependencies', () => {
      const pack = createMockPack('pack-a');
      const result = resolver.validateDependencies(pack, [pack]);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate pack with satisfied dependencies', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const result = resolver.validateDependencies(packB, [packA, packB]);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation when dependency not found', () => {
      const pack = createMockPack('pack-a', '1.0.0', [{ name: 'missing-pack', version: '1.0.0' }]);

      const result = resolver.validateDependencies(pack, [pack]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('missing-pack');
    });

    it('should fail validation when dependency version mismatches', () => {
      const packA = createMockPack('pack-a', '2.0.0'); // Different version
      const packB = createMockPack('pack-b', '1.0.0', [
        { name: 'pack-a', version: '1.0.0' }, // Requires 1.0.0
      ]);

      const result = resolver.validateDependencies(packB, [packA, packB]);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('version mismatch');
    });
  });

  describe('getTransitiveDependencies()', () => {
    it('should return empty array for pack with no dependencies', () => {
      const pack = createMockPack('pack-a');
      const deps = resolver.getTransitiveDependencies('pack-a', [pack]);

      expect(deps).toEqual([]);
    });

    it('should return direct dependencies', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const deps = resolver.getTransitiveDependencies('pack-b', [packA, packB]);

      expect(deps).toEqual(['pack-a']);
    });

    it('should return transitive dependencies', () => {
      // pack-c -> pack-b -> pack-a
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packC = createMockPack('pack-c', '1.0.0', [{ name: 'pack-b', version: '1.0.0' }]);

      const deps = resolver.getTransitiveDependencies('pack-c', [packA, packB, packC]);

      expect(deps).toContain('pack-a');
      expect(deps).toContain('pack-b');
      expect(deps).toHaveLength(2);
    });

    it('should handle diamond dependencies without duplicates', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packC = createMockPack('pack-c', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);
      const packD = createMockPack('pack-d', '1.0.0', [
        { name: 'pack-b', version: '1.0.0' },
        { name: 'pack-c', version: '1.0.0' },
      ]);

      const deps = resolver.getTransitiveDependencies('pack-d', [packA, packB, packC, packD]);

      expect(deps).toContain('pack-a');
      expect(deps).toContain('pack-b');
      expect(deps).toContain('pack-c');
      expect(deps).toHaveLength(3); // No duplicates
    });

    it('should throw error for non-existent pack', () => {
      expect(() => {
        resolver.getTransitiveDependencies('missing-pack', []);
      }).toThrow(DependencyNotFoundError);
    });
  });

  describe('Dependency Graph', () => {
    it('should build correct dependency graph', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const result = resolver.resolve([packB], [packA, packB]);

      expect(result.graph.size).toBe(2);
      expect(result.graph.has('pack-a')).toBe(true);
      expect(result.graph.has('pack-b')).toBe(true);

      const nodeA = result.graph.get('pack-a');
      expect(nodeA?.dependencies).toEqual([]);
      expect(nodeA?.resolved).toBe(true);

      const nodeB = result.graph.get('pack-b');
      expect(nodeB?.dependencies).toHaveLength(1);
      expect(nodeB?.dependencies[0].name).toBe('pack-a');
    });

    it('should mark all nodes as resolved in successful resolution', () => {
      const packA = createMockPack('pack-a');
      const packB = createMockPack('pack-b', '1.0.0', [{ name: 'pack-a', version: '1.0.0' }]);

      const result = resolver.resolve([packB], [packA, packB]);

      expect(result.success).toBe(true);
      for (const node of result.graph.values()) {
        expect(node.resolved).toBe(true);
      }
    });
  });

  test('resolve handles non-error throw types when building graph', () => {
    const resolver = new DependencyResolver();
    const buildSpy = jest.spyOn(resolver as any, 'buildGraph').mockImplementation(() => {
      throw 'string failure';
    });

    const result = resolver.resolve([], []);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual([]);

    buildSpy.mockRestore();
  });
});
