/**
 * Merge strategies for pack combination
 *
 * Provides different strategies for merging domain packs:
 * - Deep Merge: Recursively merge objects and concatenate arrays
 * - Override: Later packs completely override earlier packs
 * - Selective: User controls which fields merge vs override
 *
 * @module combination/merge-strategies
 */

import { MissionMerger } from '../merge/deep-merge';
import { CombinationStrategy, CombinationOptions } from './types';

/**
 * MergeStrategy interface
 * All merge strategies implement this interface
 */
export interface IMergeStrategy {
  /**
   * Merge multiple templates according to the strategy
   *
   * @param templates - Array of templates to merge (order matters)
   * @returns Merged template
   */
  merge(templates: Record<string, unknown>[]): Record<string, unknown>;
}

/**
 * Deep Merge Strategy
 *
 * Recursively merges objects and concatenates arrays.
 * Later templates override/extend earlier ones.
 */
export class DeepMergeStrategy implements IMergeStrategy {
  private merger: MissionMerger;

  constructor() {
    this.merger = new MissionMerger();
  }

  merge(templates: Record<string, unknown>[]): Record<string, unknown> {
    if (templates.length === 0) {
      return {};
    }

    if (templates.length === 1) {
      return { ...templates[0] };
    }

    // Merge templates left to right
    let result = { ...templates[0] };
    for (let i = 1; i < templates.length; i++) {
      result = this.merger.merge(result, templates[i], {
        arrayStrategy: 'concat',
        listStrategy: 'append',
      });
    }

    return result;
  }
}

/**
 * Override Strategy
 *
 * Each subsequent template completely replaces the previous one.
 * Only the last template's values are used.
 */
export class OverrideStrategy implements IMergeStrategy {
  merge(templates: Record<string, unknown>[]): Record<string, unknown> {
    if (templates.length === 0) {
      return {};
    }

    // Return a copy of the last template
    return { ...templates[templates.length - 1] };
  }
}

/**
 * Selective Merge Strategy
 *
 * Allows fine-grained control over which fields are merged vs overridden.
 * Uses path patterns to determine behavior.
 */
export class SelectiveMergeStrategy implements IMergeStrategy {
  private merger: MissionMerger;
  private overridePaths: Set<string>;
  private mergePaths: Set<string>;

  constructor(options: CombinationOptions) {
    this.merger = new MissionMerger();
    this.overridePaths = new Set(options.overridePaths || []);
    this.mergePaths = new Set(options.mergePaths || []);
  }

  merge(templates: Record<string, unknown>[]): Record<string, unknown> {
    if (templates.length === 0) {
      return {};
    }

    if (templates.length === 1) {
      return { ...templates[0] };
    }

    // Start with first template
    let result = { ...templates[0] };

    // Merge each subsequent template
    for (let i = 1; i < templates.length; i++) {
      result = this.mergeSelectively(result, templates[i]);
    }

    return result;
  }

  /**
   * Selectively merge two objects based on path configuration
   */
  private mergeSelectively(
    base: Record<string, unknown>,
    extension: Record<string, unknown>,
    currentPath: string = ''
  ): Record<string, unknown> {
    const result = { ...base };

    for (const [key, value] of Object.entries(extension)) {
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;

      // Check if this path should be overridden
      if (this.shouldOverride(fieldPath)) {
        result[key] = value;
        continue;
      }

      // Check if this path should be merged
      if (this.shouldMerge(fieldPath)) {
        const baseValue = base[key];

        // Merge arrays by concatenation
        if (Array.isArray(baseValue) && Array.isArray(value)) {
          result[key] = [...baseValue, ...value];
        }
        // Merge objects recursively
        else if (this.isObject(baseValue) && this.isObject(value)) {
          result[key] = this.mergeSelectively(
            baseValue as Record<string, unknown>,
            value as Record<string, unknown>,
            fieldPath
          );
        }
        // Scalars: extension overrides
        else {
          result[key] = value;
        }
        continue;
      }

      // Default behavior: deep merge
      const baseValue = base[key];
      if (baseValue === undefined) {
        result[key] = value;
      } else {
        result[key] = this.merger.merge(baseValue, value);
      }
    }

    return result;
  }

  /**
   * Check if a path should use override strategy
   */
  private shouldOverride(path: string): boolean {
    // Exact match or wildcard match
    if (this.overridePaths.has(path)) {
      return true;
    }

    // Check wildcard patterns (e.g., "spec.resources.*")
    for (const pattern of this.overridePaths) {
      if (this.matchesPattern(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a path should use merge strategy
   */
  private shouldMerge(path: string): boolean {
    // Exact match or wildcard match
    if (this.mergePaths.has(path)) {
      return true;
    }

    // Check wildcard patterns
    for (const pattern of this.mergePaths) {
      if (this.matchesPattern(path, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Simple wildcard pattern matching
   * Supports "*" as wildcard for any segment
   */
  private matchesPattern(path: string, pattern: string): boolean {
    if (pattern === '*') {
      return true;
    }

    const pathParts = path.split('.');
    const patternParts = pattern.split('.');

    if (pathParts.length !== patternParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] !== '*' && patternParts[i] !== pathParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Type guard for plain objects
   */
  private isObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

/**
 * Strategy Factory
 *
 * Creates the appropriate merge strategy based on configuration
 */
export class MergeStrategyFactory {
  static create(strategy: CombinationStrategy, options?: CombinationOptions): IMergeStrategy {
    switch (strategy) {
      case 'deep-merge':
        return new DeepMergeStrategy();

      case 'override':
        return new OverrideStrategy();

      case 'selective':
        if (!options) {
          throw new Error('Selective merge strategy requires options with merge/override paths');
        }
        return new SelectiveMergeStrategy(options);

      default:
        throw new Error(`Unknown merge strategy: ${strategy}`);
    }
  }
}
