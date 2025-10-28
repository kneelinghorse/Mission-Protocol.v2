/**
 * split_mission MCP Tool
 *
 * Autonomously splits oversized missions into coherent sub-missions
 * using the hybrid semantic-structural decomposition algorithm.
 *
 * Algorithm:
 * 1. Load and parse mission file (YAML or text)
 * 2. Analyze complexity using ComplexityScorer
 * 3. If complexity exceeds threshold, split using MissionSplitter
 * 4. Generate individual sub-mission files
 * 5. Return execution plan and file paths
 *
 * @module tools/split-mission
 * @version 1.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../loaders/yaml-loader';
import { GenericMission, isGenericMission } from '../schemas/generic-mission';
import { MissionSplitter, SubMission, SplitResult } from '../intelligence/mission-splitter';
import { ComplexityScorer, ComplexityAnalysis } from '../intelligence/complexity-scorer';
import { ITokenCounter, SupportedModel } from '../intelligence/types';
import { ensureDir, pathExists, writeFileAtomic } from '../utils/fs';
import { resolveWorkspacePath } from '../utils/workspace-io';

/**
 * Parameters for split_mission tool
 */
export interface SplitMissionParams {
  /** Path to mission file to split (YAML format) */
  missionFile: string;

  /** Target model for token optimization */
  model?: SupportedModel;

  /** Maximum number of sub-missions to create */
  maxSubMissions?: number;

  /** Output directory for sub-mission files */
  outputDir?: string;

  /** Whether to preserve original file structure */
  preserveStructure?: boolean;
}

/**
 * Split result with file paths
 */
export interface SplitMissionResult {
  shouldSplit: boolean;
  complexity: {
    score: number;
    reasons: string[];
  };
  subMissionFiles?: string[];
  executionPlan?: {
    order: number;
    file: string;
    objective: string;
    dependencies: string[];
  }[];
  summary: string;
  tokenUsage?: {
    model: SupportedModel;
    totalTokens: number;
    estimatedCost?: number;
    contextWindow: number;
    utilization: number;
  };
}

/**
 * MCP Tool Definition for mission splitting
 */
export const createMissionSplitsToolDefinition = {
  name: 'create_mission_splits',
  description:
    'Automatically splits a large or complex mission into smaller, coherent sub-missions. This tool analyzes mission complexity and decomposes it using semantic-structural analysis while preserving atomic operations and context. Use this when a mission is too large to complete in a single session or has a high complexity score.',
  inputSchema: {
    type: 'object',
    required: ['missionFile'],
    properties: {
      missionFile: {
        type: 'string',
        description: 'Path to the mission file (YAML) to analyze and split',
      },
      model: {
        type: 'string',
        enum: ['claude', 'gpt', 'gemini'],
        description: 'Target AI model for token optimization (default: claude)',
      },
      maxSubMissions: {
        type: 'number',
        description: 'Maximum number of sub-missions to create (default: 10)',
      },
      outputDir: {
        type: 'string',
        description: 'Directory to save sub-mission files (default: same as mission file)',
      },
      preserveStructure: {
        type: 'boolean',
        description: 'Preserve original mission structure in sub-missions (default: true)',
      },
    },
  },
} as const;

/**
 * Legacy alias maintained for one release cycle
 */
export const splitMissionToolDefinitionDeprecated = {
  ...createMissionSplitsToolDefinition,
  name: 'split_mission',
  description:
    '[DEPRECATED] Use create_mission_splits instead. Generates the same token-balanced mission segments.',
} as const;

/**
 * SplitMissionToolImpl
 *
 * Main implementation class for mission splitting
 */
export class SplitMissionToolImpl {
  private loader: SecureYAMLLoader;
  private splitter: MissionSplitter;
  private complexityScorer: ComplexityScorer;
  private model: SupportedModel;

  constructor(
    loader: SecureYAMLLoader,
    tokenCounter: ITokenCounter,
    model: SupportedModel = 'claude'
  ) {
    this.loader = loader;
    this.model = model;

    // Initialize complexity scorer with model-specific config
    const contextWindow = this.getContextWindow(model);
    this.complexityScorer = new ComplexityScorer(tokenCounter, {
      model,
      contextWindow,
      agentTimeHorizon: 60, // 60 minutes default
    });

    // Initialize mission splitter
    this.splitter = new MissionSplitter(this.complexityScorer);
  }

  /**
   * Execute mission splitting
   *
   * @param params - Split parameters
   * @returns Split result with file paths and execution plan
   */
  async execute(params: SplitMissionParams): Promise<SplitMissionResult> {
    const validated = await this.validateParams(params);

    // 1. Load mission file
    const mission = await this.loadMissionFile(validated.missionFile);

    // 2. Analyze complexity
    const complexity = await this.complexityScorer.calculateCCS(mission);
    const tokenUsage = this.buildTokenUsage(complexity);

    // 3. Check if split is needed
    if (!complexity.shouldSplit) {
      return {
        shouldSplit: false,
        complexity: {
          score: complexity.compositeScore,
          reasons: ['Mission complexity is within acceptable limits'],
        },
        summary: `Mission complexity score: ${complexity.compositeScore.toFixed(2)}/10. No split needed.`,
        tokenUsage,
      };
    }

    // 4. Split mission
    const splitResult = await this.splitter.split(mission, {
      maxSubMissions: validated.maxSubMissions,
      preserveStructure: validated.preserveStructure ?? true,
    });

    // 5. Generate sub-mission files
    const outputDir = validated.outputDir || path.dirname(validated.missionFile);
    const subMissionFiles = await this.writeSubMissions(
      splitResult,
      outputDir,
      path.basename(validated.missionFile, path.extname(validated.missionFile))
    );

    // 6. Create execution plan
    const executionPlan = this.createExecutionPlan(splitResult.subMissions, subMissionFiles);

    // 7. Generate summary
    const summary = this.generateSummary(complexity, splitResult, subMissionFiles);

    return {
      shouldSplit: true,
      complexity: {
        score: complexity.compositeScore,
        reasons: complexity.reasons,
      },
      subMissionFiles,
      executionPlan,
      summary,
      tokenUsage,
    };
  }

  /**
   * Validate input parameters
   */
  private async validateParams(params: SplitMissionParams): Promise<SplitMissionParams> {
    if (!params.missionFile || params.missionFile.trim().length === 0) {
      throw new Error('missionFile is required');
    }

    const sanitizedMissionFile = await resolveWorkspacePath(params.missionFile, {
      allowedExtensions: ['.yaml', '.yml'],
    });

    if (!(await pathExists(sanitizedMissionFile))) {
      throw new Error(`Mission file not found: ${params.missionFile}`);
    }

    if (params.maxSubMissions !== undefined && params.maxSubMissions < 2) {
      throw new Error('maxSubMissions must be at least 2');
    }

    let sanitizedOutputDir: string | undefined;
    if (params.outputDir) {
      sanitizedOutputDir = await resolveWorkspacePath(params.outputDir, {
        allowRelative: true,
      });

      if (!(await pathExists(sanitizedOutputDir))) {
        throw new Error(`Output directory not found: ${params.outputDir}`);
      }
    }

    return {
      ...params,
      missionFile: sanitizedMissionFile,
      outputDir: sanitizedOutputDir,
    };
  }

  /**
   * Build token usage summary from complexity analysis
   */
  private buildTokenUsage(complexity: ComplexityAnalysis) {
    const contextWindow = this.getContextWindow(this.model);
    const totalTokens = complexity.tokenDetails.count;

    return {
      model: complexity.tokenDetails.model,
      totalTokens,
      estimatedCost: complexity.tokenDetails.estimatedCost,
      contextWindow,
      utilization: totalTokens / contextWindow,
    };
  }

  /**
   * Load mission from file
   */
  private async loadMissionFile(filePath: string): Promise<GenericMission | string> {
    try {
      // Try to load as YAML
      const content = await fs.readFile(filePath, 'utf-8');

      try {
        const parsed = YAML.parse(content);

        // Check if it's a GenericMission
        if (isGenericMission(parsed)) {
          return parsed;
        }

        // Otherwise return as text
        return content;
      } catch {
        // If YAML parsing fails, return as text
        return content;
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load mission file: ${error.message}`);
      }
      throw new Error('Failed to load mission file: Unknown error');
    }
  }

  /**
   * Write sub-missions to files
   */
  private async writeSubMissions(
    splitResult: SplitResult,
    outputDir: string,
    baseName: string
  ): Promise<string[]> {
    await ensureDir(outputDir);

    const writes = splitResult.subMissions.map(async (subMission) => {
      const fileName = `${baseName}_sub${subMission.order}.yaml`;
      const filePath = path.join(outputDir, fileName);

      const missionYaml = this.subMissionToYAML(subMission, splitResult.preservedContext);
      await writeFileAtomic(filePath, missionYaml, { encoding: 'utf-8' });

      return filePath;
    });

    return Promise.all(writes);
  }

  /**
   * Convert SubMission to YAML format
   */
  private subMissionToYAML(subMission: SubMission, preservedContext: string): string {
    const mission: GenericMission = {
      schemaType: 'Mission',
      schemaVersion: '2.0',
      missionId: subMission.id,
      objective: subMission.objective,
      context: {
        background: `${preservedContext}\n\n${subMission.context}`,
        dependencies: subMission.dependencies,
        constraints: [],
      },
      successCriteria: [
        `Complete ${subMission.objective}`,
        'All deliverables produced',
        'Pass to next sub-mission if applicable',
      ],
      deliverables:
        subMission.deliverables.length > 0
          ? subMission.deliverables
          : ['Sub-mission completion report'],
      domainFields: {
        order: subMission.order,
        instructions: subMission.instructions,
        dependencies: subMission.dependencies,
      },
    };

    return YAML.stringify(mission, {
      indent: 2,
      lineWidth: 0,
    });
  }

  /**
   * Create execution plan
   */
  private createExecutionPlan(
    subMissions: SubMission[],
    files: string[]
  ): Array<{
    order: number;
    file: string;
    objective: string;
    dependencies: string[];
  }> {
    return subMissions.map((sm, i) => ({
      order: sm.order,
      file: files[i],
      objective: sm.objective,
      dependencies: sm.dependencies,
    }));
  }

  /**
   * Generate summary text
   */
  private generateSummary(
    complexity: ComplexityAnalysis,
    splitResult: SplitResult,
    files: string[]
  ): string {
    const contextWindow = this.getContextWindow(this.model);
    const utilization = complexity.tokenDetails.count / contextWindow;

    const parts: string[] = [
      '# Mission Split Analysis',
      '',
      `**Complexity Score:** ${complexity.compositeScore.toFixed(2)}/10`,
      '',
      '**Reasons for Split:**',
      ...complexity.reasons.map((r: string) => `- ${r}`),
      '',
      `**Sub-Missions Created:** ${splitResult.subMissions.length}`,
      '',
      '**Token Usage:**',
      `- Model: ${complexity.tokenDetails.model}`,
      `- Mission tokens: ${complexity.tokenDetails.count}`,
      `- Context utilization: ${(utilization * 100).toFixed(1)}% of ${contextWindow.toLocaleString()} tokens`,
      ...(complexity.tokenDetails.estimatedCost !== undefined
        ? [`- Estimated input cost: $${complexity.tokenDetails.estimatedCost.toFixed(4)}`]
        : []),
      '',
      '**Execution Order:**',
    ];

    for (let i = 0; i < splitResult.subMissions.length; i++) {
      const sm = splitResult.subMissions[i];
      parts.push(`${i + 1}. ${sm.objective}`);
      if (sm.dependencies.length > 0) {
        parts.push(`   Dependencies: ${sm.dependencies.join(', ')}`);
      }
      parts.push(`   File: ${files[i]}`);
      parts.push('');
    }

    parts.push('**Next Steps:**');
    parts.push('1. Review sub-mission files for accuracy');
    parts.push('2. Execute sub-missions in order');
    parts.push('3. Ensure context is properly propagated between steps');

    return parts.join('\n');
  }

  /**
   * Get context window for model
   */
  private getContextWindow(model: SupportedModel): number {
    const windows: Record<SupportedModel, number> = {
      claude: 200000, // Claude Sonnet/Opus
      gpt: 128000, // GPT-4 Turbo
      gemini: 1000000, // Gemini 1.5 Pro
    };
    return windows[model] || 200000;
  }

  /**
   * Format result for LLM consumption
   */
  formatForLLM(result: SplitMissionResult): string {
    const tokenUsage = result.tokenUsage;

    if (!result.shouldSplit) {
      const tokenLines = tokenUsage
        ? [
            `**Token Usage (${tokenUsage.model}):**`,
            `- Mission tokens: ${tokenUsage.totalTokens}`,
            `- Context utilization: ${(tokenUsage.utilization * 100).toFixed(1)}% of ${tokenUsage.contextWindow.toLocaleString()} tokens`,
            ...(tokenUsage.estimatedCost !== undefined
              ? [`- Estimated input cost: $${tokenUsage.estimatedCost.toFixed(4)}`]
              : []),
          ]
        : ['**Token Usage:**', '- Token metrics unavailable for this result.'];

      return `# Mission Analysis Complete

${result.summary}

${tokenLines.join('\n')}

The mission can be executed as-is without splitting.`;
    }

    const tokenLines = tokenUsage
      ? [
          `**Token Usage (${tokenUsage.model}):**`,
          `- Mission tokens: ${tokenUsage.totalTokens}`,
          `- Context utilization: ${(tokenUsage.utilization * 100).toFixed(1)}% of ${tokenUsage.contextWindow.toLocaleString()} tokens`,
          ...(tokenUsage.estimatedCost !== undefined
            ? [`- Estimated input cost: $${tokenUsage.estimatedCost.toFixed(4)}`]
            : []),
        ]
      : ['**Token Usage:**', '- Token metrics unavailable for this result.'];

    return `# Mission Successfully Split

${result.summary}

${tokenLines.join('\n')}

## Files Created

${result.subMissionFiles?.map((f, i) => `${i + 1}. \`${f}\``).join('\n')}

## Execution Plan

${result.executionPlan
  ?.map(
    (ep) =>
      `**Step ${ep.order}:** ${ep.objective}\n- File: \`${ep.file}\`\n- Dependencies: ${ep.dependencies.length > 0 ? ep.dependencies.join(', ') : 'None'}`
  )
  .join('\n\n')}

You can now execute these sub-missions sequentially, starting with step 1.`;
  }
}
