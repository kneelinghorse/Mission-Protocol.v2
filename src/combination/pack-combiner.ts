/**
 * Pack Combiner - Combines multiple domain packs into a single cohesive pack
 *
 * Supports multiple merge strategies and handles dependency resolution.
 * Integrates with DependencyResolver for correct load order and circular
 * dependency detection.
 *
 * Algorithm:
 * 1. Resolve dependencies and determine load order
 * 2. Load all required packs in dependency order
 * 3. Merge packs using selected strategy
 * 4. Validate combined result
 * 5. Return combined pack
 *
 * @module combination/pack-combiner
 */

import { DomainPack } from '../domains/types';
import { DependencyResolver } from './dependency-resolver';
import { MergeStrategyFactory, IMergeStrategy } from './merge-strategies';
import { CombinationOptions, CombinationResult, CombinedPack, ResolvedDependencies } from './types';

/**
 * PackCombiner
 *
 * Combines multiple domain packs with dependency resolution and merge strategies
 */
export class PackCombiner {
  private resolver: DependencyResolver;

  constructor() {
    this.resolver = new DependencyResolver();
  }

  /**
   * Combine multiple domain packs into a single pack
   *
   * @param packs - Array of packs to combine
   * @param availablePacks - All available packs (for dependency resolution)
   * @param options - Combination options
   * @returns Combination result
   */
  combine(
    packs: DomainPack[],
    availablePacks: DomainPack[],
    options?: CombinationOptions
  ): CombinationResult {
    const opts: Required<CombinationOptions> = {
      strategy: options?.strategy || 'deep-merge',
      overridePaths: options?.overridePaths || [],
      mergePaths: options?.mergePaths || [],
      validate: options?.validate ?? true,
      resolveDependencies: options?.resolveDependencies ?? true,
    };

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate inputs
    if (packs.length === 0) {
      return {
        success: false,
        errors: ['No packs provided for combination'],
        warnings: [],
      };
    }

    // Step 1: Resolve dependencies
    let packsToLoad = packs;
    let dependencyResolution;

    if (opts.resolveDependencies) {
      dependencyResolution = this.resolver.resolve(packs, availablePacks);

      if (!dependencyResolution.success) {
        return {
          success: false,
          dependencyResolution,
          errors: dependencyResolution.errors,
          warnings,
        };
      }

      // Load packs in dependency order
      const packMap = new Map<string, DomainPack>();
      for (const pack of [...packs, ...availablePacks]) {
        packMap.set(pack.manifest.name, pack);
      }

      packsToLoad = dependencyResolution.loadOrder
        .map((name) => packMap.get(name))
        .filter((p): p is DomainPack => p !== undefined);

      if (packsToLoad.length !== dependencyResolution.loadOrder.length) {
        const missing = dependencyResolution.loadOrder.filter((name) => !packMap.has(name));
        errors.push(`Failed to load packs: ${missing.join(', ')}`);
        return {
          success: false,
          dependencyResolution,
          errors,
          warnings,
        };
      }
    }

    // Step 2: Merge packs using selected strategy
    try {
      const mergeStrategy = MergeStrategyFactory.create(opts.strategy, options);
      const combinedPack = this.mergePacks(packsToLoad, mergeStrategy);

      // Step 3: Validate if requested
      if (opts.validate) {
        const validationResult = this.validateCombinedPack(combinedPack);
        if (!validationResult.valid) {
          errors.push(...validationResult.errors);
          warnings.push(...validationResult.warnings);
        }
      }

      return {
        success: errors.length === 0,
        combinedPack,
        dependencyResolution,
        errors,
        warnings,
      };
    } catch (error) {
      if (error instanceof Error) {
        errors.push(`Pack combination failed: ${error.message}`);
      } else {
        errors.push('Pack combination failed: Unknown error');
      }

      return {
        success: false,
        dependencyResolution,
        errors,
        warnings,
      };
    }
  }

  /**
   * Merge packs using the provided strategy
   */
  private mergePacks(packs: DomainPack[], strategy: IMergeStrategy): CombinedPack {
    // Extract templates from all packs
    const templates = packs.map((pack) => pack.template);

    // Merge templates using strategy
    const combinedTemplate = strategy.merge(templates);

    // Combine manifests
    const firstPack = packs[0];
    const packNames = packs.map((p) => p.manifest.name);
    const allDependencies = this.mergeDependencies(packs);

    const combinedManifest = {
      name: `combined-${packNames.join('-')}`,
      version: '1.0.0', // Combined packs get a new version
      displayName: `Combined: ${packs.map((p) => p.manifest.displayName).join(' + ')}`,
      description: `Combined pack from: ${packNames.join(', ')}`,
      author: firstPack.manifest.author || 'System',
      combinedFrom: packNames,
    };

    return {
      manifest: combinedManifest,
      template: combinedTemplate,
      dependencies: allDependencies,
      combinationOrder: packNames,
    };
  }

  /**
   * Merge dependencies from all packs, removing duplicates
   */
  private mergeDependencies(packs: DomainPack[]): Array<{ name: string; version: string }> {
    const depMap = new Map<string, string>();

    for (const pack of packs) {
      if (pack.manifest.dependencies) {
        for (const dep of pack.manifest.dependencies) {
          // Keep the first version encountered (from dependency order)
          if (!depMap.has(dep.name)) {
            depMap.set(dep.name, dep.version);
          }
        }
      }
    }

    return Array.from(depMap.entries()).map(([name, version]) => ({
      name,
      version,
    }));
  }

  /**
   * Validate a combined pack
   */
  private validateCombinedPack(pack: CombinedPack): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate manifest
    if (!pack.manifest.name || pack.manifest.name.trim().length === 0) {
      errors.push('Combined pack name is required');
    }

    if (!pack.manifest.version || pack.manifest.version.trim().length === 0) {
      errors.push('Combined pack version is required');
    }

    if (!pack.manifest.combinedFrom || pack.manifest.combinedFrom.length === 0) {
      errors.push('Combined pack must specify source packs');
    }

    // Validate template
    if (typeof pack.template !== 'object' || pack.template === null) {
      errors.push('Combined template must be an object');
    }

    // Validate combination order matches source packs
    if (
      pack.combinationOrder.length !== pack.manifest.combinedFrom.length ||
      !pack.combinationOrder.every((name, i) => name === pack.manifest.combinedFrom[i])
    ) {
      warnings.push('Combination order does not match manifest source packs');
    }

    // Warn if template is empty
    if (Object.keys(pack.template).length === 0) {
      warnings.push('Combined template is empty');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Combine packs by name, looking them up in available packs
   *
   * Convenience method that accepts pack names instead of pack objects
   *
   * @param packNames - Names of packs to combine
   * @param availablePacks - All available packs
   * @param options - Combination options
   * @returns Combination result
   */
  combineByName(
    packNames: string[],
    availablePacks: DomainPack[],
    options?: CombinationOptions
  ): CombinationResult {
    const packMap = new Map(availablePacks.map((p) => [p.manifest.name, p]));
    const packs: DomainPack[] = [];
    const errors: string[] = [];

    for (const name of packNames) {
      const pack = packMap.get(name);
      if (!pack) {
        errors.push(`Pack "${name}" not found in available packs`);
      } else {
        packs.push(pack);
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors,
        warnings: [],
      };
    }

    return this.combine(packs, availablePacks, options);
  }

  /**
   * Preview combination without actually performing it
   *
   * Returns what the combination would produce without creating the combined pack
   *
   * @param packs - Packs to preview
   * @param availablePacks - Available packs
   * @param options - Combination options
   * @returns Preview result with load order and validation
   */
  preview(
    packs: DomainPack[],
    availablePacks: DomainPack[],
    _options?: CombinationOptions
  ): {
    loadOrder: string[];
    dependencies: ResolvedDependencies;
    warnings: string[];
  } {
    const warnings: string[] = [];

    // Resolve dependencies
    const dependencies = this.resolver.resolve(packs, availablePacks);

    if (!dependencies.success) {
      warnings.push(...dependencies.errors);
      return {
        loadOrder: [],
        dependencies,
        warnings,
      };
    }

    // Validate each pack's dependencies
    for (const pack of packs) {
      const validation = this.resolver.validateDependencies(pack, availablePacks);
      if (!validation.valid) {
        warnings.push(...validation.errors.map((e) => `${pack.manifest.name}: ${e}`));
      }
    }

    return {
      loadOrder: dependencies.loadOrder,
      dependencies,
      warnings,
    };
  }
}

/**
 * Convenience function for combining packs
 *
 * @param packs - Packs to combine
 * @param availablePacks - Available packs for dependency resolution
 * @param options - Combination options
 * @returns Combination result
 */
export function combinePacks(
  packs: DomainPack[],
  availablePacks: DomainPack[],
  options?: CombinationOptions
): CombinationResult {
  const combiner = new PackCombiner();
  return combiner.combine(packs, availablePacks, options);
}
