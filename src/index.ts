#!/usr/bin/env node

/* istanbul ignore file */

/**
 * Mission Protocol v2 MCP Server
 *
 * Main entry point for the MCP server that exposes domain discovery tools.
 * Uses stdio transport for Claude Desktop integration.
 *
 * @module index
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';

import { SecureYAMLLoader } from './loaders/yaml-loader';
import { RegistryParser } from './registry/registry-parser';
import { DomainPackLoader } from './domains/domain-pack-loader';
import { MissionMerger } from './merge/deep-merge';
import { ListDomainsToolImpl, listDomainsToolDefinition } from './tools/list-domains';
import { CreateMissionToolImpl, createMissionToolDefinition } from './tools/create-mission';
import { mcpToolDefinition as extractTemplateToolDefinition, extractTemplate } from './tools/extract-template';
import { mcpToolDefinition as importTemplateToolDefinition, importTemplate } from './tools/import-template';
import { mcpToolDefinition as exportTemplateToolDefinition, exportTemplate } from './tools/export-template';
import { CombinePacksToolImpl, combinePacksToolDefinition } from './tools/combine-packs';
import { mcpToolDefinition as analyzeDependenciesToolDefinition, executeAnalyzeDependenciesTool } from './tools/analyze-dependencies';
import { scoreQualityTool, scoreQuality } from './tools/score-quality';
import { PackCombiner } from './combination/pack-combiner';
import { OptimizeTokensToolImpl, optimizeTokensToolDefinition } from './tools/optimize-tokens';
import { SplitMissionToolImpl, splitMissionToolDefinition } from './tools/split-mission';
import { SuggestSplitsToolImpl, suggestSplitsToolDefinition } from './tools/suggest-splits';
import { TokenCounter } from './intelligence/token-counters';
import { SupportedModel } from './intelligence/types';
import { ErrorHandler } from './errors/handler';
import { ErrorLogger } from './errors/logger';
import type { JsonValue } from './errors/types';

/**
 * MCP Server Configuration
 */
const SERVER_CONFIG = {
  name: 'mission-protocol',
  version: '2.0.0',
} as const;

/**
 * Main server instance
 */
const server = new Server(
  {
    name: SERVER_CONFIG.name,
    version: SERVER_CONFIG.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const errorLogger = new ErrorLogger();
ErrorHandler.useLogger(errorLogger);

/**
 * Mission Protocol server context shared across handlers
 */
export interface MissionProtocolContext {
  baseDir: string;
  defaultModel: SupportedModel;
  loader: SecureYAMLLoader;
  registryParser: RegistryParser;
  packCombiner: PackCombiner;
  listDomainsTool: ListDomainsToolImpl;
  createMissionTool: CreateMissionToolImpl;
  combinePacksTool: CombinePacksToolImpl;
  optimizeTokensTool: OptimizeTokensToolImpl;
  splitMissionTool: SplitMissionToolImpl;
  suggestSplitsTool: SuggestSplitsToolImpl;
  tokenCounter: TokenCounter;
}

/**
 * Global instances (initialized in main())
 */
let serverContext: MissionProtocolContext | null = null;

const TOOL_DEFINITIONS = [
  listDomainsToolDefinition,
  createMissionToolDefinition,
  extractTemplateToolDefinition,
  importTemplateToolDefinition,
  exportTemplateToolDefinition,
  combinePacksToolDefinition,
  analyzeDependenciesToolDefinition,
  scoreQualityTool,
  optimizeTokensToolDefinition,
  splitMissionToolDefinition,
  suggestSplitsToolDefinition,
] as const;

export function getToolDefinitions() {
  return TOOL_DEFINITIONS;
}

function summarizeValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => summarizeValue(item)) as JsonValue;
  }
  if (typeof value === 'object') {
    return '[object]';
  }
  if (typeof value === 'string' && value.length > 200) {
    return `${value.slice(0, 197)}…`;
  }
  return value as JsonValue;
}

function sanitizeArgs(args: unknown): Record<string, JsonValue> | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }
  const entries = Object.entries(args as Record<string, unknown>).slice(0, 10);
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of entries) {
    sanitized[key] = summarizeValue(value);
  }
  return sanitized;
}

export async function buildMissionProtocolContext(options?: {
  baseDir?: string;
  defaultModel?: SupportedModel;
}): Promise<MissionProtocolContext> {
  const baseDir = options?.baseDir ?? path.resolve(__dirname, '../templates');
  const defaultModel = options?.defaultModel ?? 'claude';

  // Initialize secure YAML loader
  const loader = new SecureYAMLLoader({
    baseDir,
    followSymlinks: false,
    maxFileSize: 5 * 1024 * 1024, // 5MB limit for registry files
  });

  // Initialize registry parser
  const registry = new RegistryParser(loader);

  // Initialize domain pack loader and merger
  const packLoader = new DomainPackLoader(loader, registry);
  const merger = new MissionMerger();
  const packCombiner = new PackCombiner();

  // Initialize token counter for intelligence tools
  const tokenCounter = new TokenCounter();

  // Initialize tools
  const listDomainsTool = new ListDomainsToolImpl(registry);
  const createMissionTool = new CreateMissionToolImpl(packLoader, merger, registry, loader);
  const combinePacksTool = new CombinePacksToolImpl(packLoader, packCombiner, registry, loader);
  const optimizeTokensTool = new OptimizeTokensToolImpl();
  const splitMissionTool = new SplitMissionToolImpl(loader, tokenCounter, defaultModel);
  const suggestSplitsTool = new SuggestSplitsToolImpl(tokenCounter, defaultModel);

  return {
    baseDir,
    defaultModel,
    loader,
    registryParser: registry,
    packCombiner,
    listDomainsTool,
    createMissionTool,
    combinePacksTool,
    optimizeTokensTool,
    splitMissionTool,
    suggestSplitsTool,
    tokenCounter,
  };
}

/**
 * Register tool handlers
 */
function registerToolHandlers(context: MissionProtocolContext): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: getToolDefinitions(),
    };
  });

  // Handle tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (!context) {
        throw new McpError(
          ErrorCode.InternalError,
          'Server context not initialized'
        );
      }

      return await executeMissionProtocolTool(name, args, context);
    } catch (error) {
      const sanitizedArgs = sanitizeArgs(args);
      const data: Record<string, JsonValue> = {
        tool: name,
      };
      if (sanitizedArgs) {
        data.args = sanitizedArgs;
      }

      const missionError = ErrorHandler.handle(
        error,
        'server.execute_tool',
        {
          module: 'server',
          data,
        },
        {
          rethrow: false,
          userMessage: 'Tool execution failed. Please check inputs and try again.',
        }
      );

      const publicError = ErrorHandler.toPublicError(missionError);
      const correlationFragment = publicError.correlationId
        ? ` (correlationId=${publicError.correlationId})`
        : '';

      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed${correlationFragment}: ${publicError.message}`
      );
    }
  });
}

export async function executeMissionProtocolTool(
  name: string,
  args: unknown,
  context: MissionProtocolContext
): Promise<CallToolResult> {
  const registryFile = 'registry.yaml';

  switch (name) {
    case 'list_available_domains': {
      const domains = await context.listDomainsTool.execute(registryFile);
      const formatted = context.listDomainsTool.formatForLLM(domains);

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
        structuredContent: {
          success: true,
          domains,
        },
      };
    }

    case 'create_mission': {
      const params = args as any;
      const registryEntries = await context.registryParser.loadRegistry(registryFile);
      const missionYaml = await context.createMissionTool.execute(params, registryEntries);
      const formatted = context.createMissionTool.formatForLLM(missionYaml);

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
        structuredContent: {
          success: true,
          mission: missionYaml,
        },
      };
    }

    case 'extract_template': {
      const params = args as any;
      const result = await extractTemplate(params);

      const summary = result.success
        ? `Template extracted: ${params.templateName} (files: ${result.stage1?.filesAnalyzed ?? 0}, params: ${result.stage2?.parametersGenerated ?? 0}, time: ${result.totalTime}ms)`
        : `Extraction failed: ${(result.errors && result.errors[0]) || 'Unknown error'}`;

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: { ...result },
      };
    }

    case 'import_template': {
      const params = args as any;
      const result = await importTemplate(params);

      const summary = result.success
        ? result.message
        : `Import failed: ${result.message}`;

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: {
          success: result.success,
          message: result.message,
        },
      };
    }

    case 'export_template': {
      const params = args as any;
      const result = await exportTemplate(params);

      const summary = result.success
        ? result.message
        : `Export failed: ${result.message}`;

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: {
          success: result.success,
          message: result.message,
        },
      };
    }

    case 'combine_packs': {
      const params = args as any;
      const result = await context.combinePacksTool.execute(params, registryFile);

      let summary = '';
      if (result.success) {
        summary += `✓ Successfully combined ${params.packNames.length} pack(s)\n\n`;

        if (result.loadOrder && result.loadOrder.length > 0) {
          summary += `Load order (dependency-resolved):\n`;
          result.loadOrder.forEach((packName: string, i: number) => {
            summary += `  ${i + 1}. ${packName}\n`;
          });
          summary += '\n';
        }

        if (result.warnings && result.warnings.length > 0) {
          summary += `Warnings:\n`;
          result.warnings.forEach((w: string) => {
            summary += `  ⚠ ${w}\n`;
          });
          summary += '\n';
        }

        summary += `Combined Pack:\n`;
        summary += `${'='.repeat(60)}\n`;
        summary += result.combinedPack || '';
      } else {
        summary = `Pack combination failed:\n${(result.errors || []).join('\n')}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: { ...result },
      };
    }

    case 'analyze_dependencies': {
      const params = args as any;
      const summary = await executeAnalyzeDependenciesTool(params);
      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: {
          success: true,
          summary,
        },
      };
    }

    case 'score_quality': {
      const params = args as any;
      const result = await scoreQuality(params);

      const summary = result.success
        ? result.summary || 'Quality assessment completed'
        : `Quality scoring failed: ${result.error}`;

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: {
          success: result.success,
          result,
        },
      };
    }

    case 'optimize_tokens': {
      const params = args as any;
      const result = await context.optimizeTokensTool.execute(params);

      if (!result.success) {
        const errorText = result.error || 'Token optimization failed';
        return {
          content: [
            {
              type: 'text',
              text: `Token optimization failed: ${errorText}`,
            },
          ],
          structuredContent: {
            success: false,
            error: errorText,
          },
          isError: true,
        };
      }

      const stats = result.stats!;
      const tokenUsage = result.tokenUsage;
      if (!tokenUsage) {
        throw new Error('optimize_tokens succeeded without token usage metrics');
      }
      let summary = '';

      summary += `✓ Token optimization completed for ${params.missionFile}\n\n`;
      summary += `**Statistics:**\n`;
      summary += `- Original tokens: ${stats.originalTokens}\n`;
      summary += `- Compressed tokens: ${stats.compressedTokens}\n`;
      summary += `- Savings: ${tokenUsage.savings} tokens (${stats.reductionPercentage.toFixed(1)}%)\n`;
      summary += `- Compression ratio: ${stats.compressionRatio.toFixed(2)}x\n`;
      summary += `- Passes applied: ${stats.passesApplied.join(', ')}\n`;

      if (tokenUsage.original.estimatedCost !== undefined && tokenUsage.optimized.estimatedCost !== undefined) {
        const costSavings = tokenUsage.original.estimatedCost - tokenUsage.optimized.estimatedCost;
        summary += `- Estimated cost savings: $${costSavings.toFixed(4)} (from $${(tokenUsage.original.estimatedCost ?? 0).toFixed(4)} to $${(tokenUsage.optimized.estimatedCost ?? 0).toFixed(4)})\n`;
      }

      if (result.warnings && result.warnings.length > 0) {
        summary += `\n**Warnings:**\n`;
        result.warnings.forEach((w) => {
          summary += `  ⚠ ${w}\n`;
        });
      }

      if (!params.dryRun) {
        summary += `\n✓ Mission file updated (backup created)\n`;
      } else {
        summary += `\n(Dry run mode - no files modified)\n`;
      }

      const heuristicWarning =
        tokenUsage.model === 'gemini'
          ? 'Gemini token counts use a conservative 1.5x heuristic and may overestimate usage. Validate against official countTokens API if near limits.'
          : undefined;

      if (heuristicWarning) {
        summary += `\n⚠ ${heuristicWarning}\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: summary,
          },
        ],
        structuredContent: {
          success: true,
          stats,
          warnings: result.warnings,
          optimizedContent: result.optimizedContent,
          tokenUsage: {
            model: tokenUsage.model,
            original: tokenUsage.original,
            optimized: tokenUsage.optimized,
            savings: tokenUsage.savings,
            compressionRatio: tokenUsage.compressionRatio,
            heuristicWarning,
          },
        },
      };
    }

    case 'split_mission': {
      const params = args as any;
      const result = await context.splitMissionTool.execute(params);
      let formatted = context.splitMissionTool.formatForLLM(result);

      const heuristicWarning =
        result.tokenUsage?.model === 'gemini'
          ? 'Gemini token counts use a conservative 1.5x heuristic and may overestimate usage.'
          : undefined;

      if (heuristicWarning) {
        formatted += `\n\n⚠ ${heuristicWarning}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
        structuredContent: {
          success: true,
          result,
          tokenUsage: result.tokenUsage
            ? {
                ...result.tokenUsage,
                heuristicWarning,
              }
            : undefined,
          heuristicWarning,
        },
      };
    }

    case 'suggest_splits': {
      const params = args as any;
      const result = await context.suggestSplitsTool.execute(params);
      let formatted = context.suggestSplitsTool.formatForLLM(result, params.detailed || false);

      const heuristicWarning =
        result.tokenUsage?.model === 'gemini'
          ? 'Gemini token counts use a conservative 1.5x heuristic and may overestimate usage.'
          : undefined;

      if (heuristicWarning) {
        formatted += `\n\n⚠ ${heuristicWarning}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: formatted,
          },
        ],
        structuredContent: {
          success: true,
          result,
          tokenUsage: result.tokenUsage
            ? {
                ...result.tokenUsage,
                heuristicWarning,
              }
            : undefined,
          heuristicWarning,
        },
      };
    }

    default:
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
  }
}

/**
 * Initialize server components
 */
async function initializeServer(): Promise<MissionProtocolContext> {
  try {
    console.error(`[INFO] Initializing MCP server...`);
    const context = await buildMissionProtocolContext();
    serverContext = context;

    console.error(`[INFO] Template base directory: ${context.baseDir}`);
    console.error(`[INFO] Default intelligence model: ${context.defaultModel}`);
    console.error(`[INFO] Server components initialized successfully`);

    return context;
  } catch (error) {
    const missionError = ErrorHandler.handle(
      error,
      'server.initialize',
      {
        module: 'server',
      },
      {
        rethrow: false,
        userMessage: 'Failed to initialize Mission Protocol server components.',
      }
    );
    throw missionError;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Initialize all server components
    const context = await initializeServer();

    // Register tool handlers
    registerToolHandlers(context);

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    console.error(`[INFO] Mission Protocol MCP server running on stdio`);
    console.error(`[INFO] Server: ${SERVER_CONFIG.name} v${SERVER_CONFIG.version}`);
  } catch (error) {
    const missionError = ErrorHandler.handle(
      error,
      'server.startup',
      {
        module: 'server',
        data: {
          stage: 'startup',
        },
      },
      {
        rethrow: false,
        userMessage: 'Mission Protocol server startup failed.',
      }
    );
    const publicError = ErrorHandler.toPublicError(missionError);
    const correlationFragment = publicError.correlationId
      ? ` (correlationId=${publicError.correlationId})`
      : '';
    console.error(`[FATAL] Server startup failed${correlationFragment}: ${publicError.message}`);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error(`[INFO] Received SIGINT, shutting down gracefully...`);
  try {
    await server.close();
  } catch (error) {
    ErrorHandler.handle(
      error,
      'server.shutdown',
      {
        module: 'server',
        data: {
          signal: 'SIGINT',
        },
      },
      {
        rethrow: false,
        userMessage: 'Graceful shutdown encountered an issue.',
      }
    );
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error(`[INFO] Received SIGTERM, shutting down gracefully...`);
  try {
    await server.close();
  } catch (error) {
    ErrorHandler.handle(
      error,
      'server.shutdown',
      {
        module: 'server',
        data: {
          signal: 'SIGTERM',
        },
      },
      {
        rethrow: false,
        userMessage: 'Graceful shutdown encountered an issue.',
      }
    );
  }
  process.exit(0);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    const missionError = ErrorHandler.handle(
      error,
      'server.unhandled',
      {
        module: 'server',
      },
      {
        rethrow: false,
        userMessage: 'Mission Protocol encountered an unrecoverable error.',
      }
    );
    const publicError = ErrorHandler.toPublicError(missionError);
    const correlationFragment = publicError.correlationId
      ? ` (correlationId=${publicError.correlationId})`
      : '';
    console.error(`[FATAL] Unhandled error${correlationFragment}: ${publicError.message}`);
    process.exit(1);
  });
}
