/**
 * Type definitions for pack combination and dependency resolution
 *
 * Enables combining multiple domain packs into cohesive mission configurations
 * with dependency resolution and circular dependency detection.
 *
 * @module combination/types
 */

import { DomainPack } from '../domains/types';

/**
 * Merge strategy for combining domain packs
 */
export type CombinationStrategy =
  | 'deep-merge'    // Recursively merge objects and concatenate arrays
  | 'override'      // Later packs override earlier packs completely
  | 'selective';    // User specifies which fields to merge vs override

/**
 * Options for pack combination
 */
export interface CombinationOptions {
  /** Merge strategy to use (default: 'deep-merge') */
  strategy?: CombinationStrategy;

  /** For 'selective' strategy, specify which paths to override */
  overridePaths?: string[];

  /** For 'selective' strategy, specify which paths to merge */
  mergePaths?: string[];

  /** Whether to validate the combined result against schemas */
  validate?: boolean;

  /** Whether to resolve dependencies automatically */
  resolveDependencies?: boolean;
}

/**
 * Represents a combined domain pack
 */
export interface CombinedPack {
  /** The combined manifest (merged metadata) */
  manifest: {
    name: string;
    version: string;
    displayName: string;
    description: string;
    author?: string;
    combinedFrom: string[]; // List of source pack names
  };

  /** Combined domain fields template */
  template: Record<string, unknown>;

  /** All dependencies from all packs */
  dependencies: Array<{
    name: string;
    version: string;
  }>;

  /** Order in which packs were combined (affects merge precedence) */
  combinationOrder: string[];
}

/**
 * Dependency graph node
 */
export interface DependencyNode {
  /** Pack name */
  name: string;

  /** Pack version */
  version: string;

  /** Direct dependencies of this pack */
  dependencies: Array<{
    name: string;
    version: string;
  }>;

  /** Resolved status */
  resolved: boolean;
}

/**
 * Dependency resolution result
 */
export interface ResolvedDependencies {
  /** Ordered list of packs to load (topologically sorted) */
  loadOrder: string[];

  /** Full dependency graph */
  graph: Map<string, DependencyNode>;

  /** Any circular dependencies detected */
  circularDependencies: string[][];

  /** Whether resolution was successful */
  success: boolean;

  /** Error messages if resolution failed */
  errors: string[];
}

/**
 * Pack combination result
 */
export interface CombinationResult {
  /** Whether combination was successful */
  success: boolean;

  /** The combined pack (if successful) */
  combinedPack?: CombinedPack;

  /** Dependency resolution details */
  dependencyResolution?: ResolvedDependencies;

  /** Any errors that occurred */
  errors: string[];

  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * Error classes for pack combination
 */
export class PackCombinationError extends Error {
  constructor(message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'PackCombinationError';
  }
}

export class CircularDependencyError extends PackCombinationError {
  constructor(message: string, public cycle: string[]) {
    super(message, { cycle });
    this.name = 'CircularDependencyError';
  }
}

export class DependencyNotFoundError extends PackCombinationError {
  constructor(message: string, public missingPack: string) {
    super(message, { missingPack });
    this.name = 'DependencyNotFoundError';
  }
}
