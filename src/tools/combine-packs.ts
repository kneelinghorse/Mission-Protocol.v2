/**
 * combine_packs MCP Tool
 *
 * Combines multiple domain packs into a single cohesive pack with
 * dependency resolution and merge strategy support.
 *
 * Algorithm:
 * 1. Validate input pack names
 * 2. Load packs from registry
 * 3. Resolve dependencies
 * 4. Combine using specified strategy
 * 5. Return combined pack as YAML
 *
 * @module tools/combine-packs
 */

import * as path from 'path';
import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../loaders/yaml-loader';
import { RegistryParser } from '../registry/registry-parser';
import { DomainPackLoader } from '../domains/domain-pack-loader';
import { PackCombiner } from '../combination/pack-combiner';
import { CombinationStrategy, CombinedPack } from '../combination/types';
import { DomainPackEntry } from '../types/registry';

/**
 * Parameters for combine_packs tool
 */
export interface CombinePacksParams {
  /** Array of pack names to combine (required) */
  packNames: string[];

  /** Merge strategy to use (default: 'deep-merge') */
  strategy?: CombinationStrategy;

  /** For 'selective' strategy: paths to override */
  overridePaths?: string[];

  /** For 'selective' strategy: paths to merge */
  mergePaths?: string[];

  /** Whether to resolve dependencies automatically (default: true) */
  resolveDependencies?: boolean;

  /** Output format (default: 'yaml') */
  format?: 'yaml' | 'json';
}

/**
 * MCP Tool Definition for creating combined packs
 */
export const createCombinedPackToolDefinition = {
  name: 'create_combined_pack',
  description:
    'Combines multiple domain packs into a single cohesive pack. Automatically resolves dependencies, ' +
    'detects circular dependencies, and applies the specified merge strategy. Use this tool when you need ' +
    'to create a mission that uses functionality from multiple domain packs.',
  inputSchema: {
    type: 'object',
    required: ['packNames'],
    properties: {
      packNames: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        description: 'Array of domain pack names to combine (use get_available_domains to see options)',
      },
      strategy: {
        type: 'string',
        enum: ['deep-merge', 'override', 'selective'],
        default: 'deep-merge',
        description:
          'Merge strategy: "deep-merge" (recursive merge), "override" (last wins), or "selective" (user-controlled)',
      },
      overridePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'For selective strategy: field paths to override (e.g., ["spec.resources"])',
      },
      mergePaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'For selective strategy: field paths to merge (e.g., ["spec.dependencies"])',
      },
      resolveDependencies: {
        type: 'boolean',
        default: true,
        description: 'Whether to automatically resolve and include dependencies',
      },
      format: {
        type: 'string',
        enum: ['yaml', 'json'],
        default: 'yaml',
        description: 'Output format for the combined pack',
      },
    },
  },
} as const;

/**
 * Legacy alias maintained for one release cycle
 */
export const combinePacksToolDefinitionDeprecated = {
  ...createCombinedPackToolDefinition,
  name: 'combine_packs',
  description:
    '[DEPRECATED] Use create_combined_pack instead. Provides the same multi-pack combination workflow.',
} as const;

/**
 * CombinePacksToolImpl
 *
 * Main implementation class for pack combination
 */
export class CombinePacksToolImpl {
  private packLoader: DomainPackLoader;
  private combiner: PackCombiner;
  private registry: RegistryParser;
  private loader: SecureYAMLLoader;

  constructor(
    packLoader: DomainPackLoader,
    combiner: PackCombiner,
    registry: RegistryParser,
    loader: SecureYAMLLoader
  ) {
    this.packLoader = packLoader;
    this.combiner = combiner;
    this.registry = registry;
    this.loader = loader;
  }

  /**
   * Execute the combine_packs tool
   *
   * @param params - Tool parameters
   * @param registryPath - Path to domain pack registry
   * @returns Combined pack as formatted string with metadata
   */
  async execute(
    params: CombinePacksParams,
    registryPath: string
  ): Promise<{
    success: boolean;
    combinedPack?: string;
    loadOrder?: string[];
    errors?: string[];
    warnings?: string[];
  }> {
    try {
      // Step 1: Validate inputs
      if (!params.packNames || params.packNames.length === 0) {
        return {
          success: false,
          errors: ['At least one pack name is required'],
        };
      }

      if (params.strategy === 'selective') {
        if (!params.overridePaths && !params.mergePaths) {
          return {
            success: false,
            errors: [
              'Selective strategy requires at least one of overridePaths or mergePaths',
            ],
          };
        }
      }

      // Step 2: Load registry
      const registryEntries: DomainPackEntry[] = await this.registry.loadRegistry(registryPath);

      // Step 3: Load all available packs (for dependency resolution)
      const availablePacks = await Promise.all(
        registryEntries.map((entry: DomainPackEntry) =>
          this.packLoader.loadPack(entry.name, registryEntries)
        )
      );

      // Step 4: Load requested packs
      const requestedPacks = await Promise.all(
        params.packNames.map(name =>
          this.packLoader.loadPack(name, registryEntries)
        )
      );

      // Step 5: Combine packs
      const result = this.combiner.combine(requestedPacks, availablePacks, {
        strategy: params.strategy || 'deep-merge',
        overridePaths: params.overridePaths,
        mergePaths: params.mergePaths,
        resolveDependencies: params.resolveDependencies ?? true,
        validate: true,
      });

      if (!result.success || !result.combinedPack) {
        return {
          success: false,
          errors: result.errors,
          warnings: result.warnings,
        };
      }

      // Step 6: Format output
      const format = params.format || 'yaml';
      const combinedPackStr = this.formatOutput(result.combinedPack, format);

      return {
        success: true,
        combinedPack: combinedPackStr,
        loadOrder: result.dependencyResolution?.loadOrder || [],
        errors: result.errors,
        warnings: result.warnings,
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          errors: [error.message],
        };
      }
      return {
        success: false,
        errors: ['Unknown error occurred during pack combination'],
      };
    }
  }

  /**
   * Preview pack combination without executing
   *
   * @param params - Tool parameters
   * @param registryPath - Path to domain pack registry
   * @returns Preview information
   */
  async preview(
    params: CombinePacksParams,
    registryPath: string
  ): Promise<{
    success: boolean;
    loadOrder?: string[];
    dependencies?: string[];
    warnings?: string[];
    errors?: string[];
  }> {
    try {
      // Load registry and packs
      const registryEntries: DomainPackEntry[] = await this.registry.loadRegistry(registryPath);
      const availablePacks = await Promise.all(
        registryEntries.map((entry: DomainPackEntry) =>
          this.packLoader.loadPack(entry.name, registryEntries)
        )
      );
      const requestedPacks = await Promise.all(
        params.packNames.map(name =>
          this.packLoader.loadPack(name, registryEntries)
        )
      );

      // Get preview
      const preview = this.combiner.preview(
        requestedPacks,
        availablePacks,
        {
          strategy: params.strategy || 'deep-merge',
          resolveDependencies: params.resolveDependencies ?? true,
        }
      );

      return {
        success: preview.warnings.length === 0,
        loadOrder: preview.loadOrder,
        dependencies: preview.dependencies.loadOrder,
        warnings: preview.warnings,
        errors: [],
      };
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false,
          errors: [error.message],
        };
      }
      return {
        success: false,
        errors: ['Unknown error occurred during preview'],
      };
    }
  }

  /**
   * Format combined pack as YAML or JSON
   */
  private formatOutput(
    combinedPack: CombinedPack,
    format: 'yaml' | 'json'
  ): string {
    if (format === 'json') {
      return JSON.stringify(combinedPack, null, 2);
    }

    // YAML format (default)
    const doc = new YAML.Document(combinedPack);
    return doc.toString();
  }
}

/**
 * Factory function to create tool instance
 */
export function createCombinePacksTool(
  packLoader: DomainPackLoader,
  registry: RegistryParser,
  loader: SecureYAMLLoader
): CombinePacksToolImpl {
  const combiner = new PackCombiner();
  return new CombinePacksToolImpl(packLoader, combiner, registry, loader);
}

/**
 * Tool handler function for MCP server integration
 */
export async function handleCombinePacks(
  params: CombinePacksParams,
  registryPath: string,
  packLoader: DomainPackLoader,
  registry: RegistryParser,
  loader: SecureYAMLLoader
): Promise<string> {
  const tool = createCombinePacksTool(packLoader, registry, loader);
  const result = await tool.execute(params, registryPath);

  if (!result.success) {
    const errors = result.errors?.join('\n') || 'Unknown error';
    throw new Error(`Pack combination failed:\n${errors}`);
  }

  // Format response with metadata
  let response = `✓ Successfully combined ${params.packNames.length} pack(s)\n\n`;

  if (result.loadOrder && result.loadOrder.length > 0) {
    response += `Load order (dependency-resolved):\n`;
    result.loadOrder.forEach((name, i) => {
      response += `  ${i + 1}. ${name}\n`;
    });
    response += '\n';
  }

  if (result.warnings && result.warnings.length > 0) {
    response += `Warnings:\n`;
    result.warnings.forEach(w => {
      response += `  ⚠ ${w}\n`;
    });
    response += '\n';
  }

  response += `Combined Pack:\n`;
  response += `${'='.repeat(60)}\n`;
  response += result.combinedPack || '';

  return response;
}
