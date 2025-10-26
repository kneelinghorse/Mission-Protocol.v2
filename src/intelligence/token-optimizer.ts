/**
 * Token Optimizer
 *
 * Main class implementing the 4-pass compression pipeline:
 * 1. Sanitization & Normalization
 * 2. Structural Refactoring
 * 3. Linguistic Simplification
 * 4. Model-Specific Templating
 */

import {
  TokenOptimizerConfig,
  OptimizationResult,
  CompressionStats,
  CompressionPassType,
  SupportedModel,
  CompressionLevel,
} from './types';
import { TokenCounter } from './token-counters';
import { ModelTranspiler } from './model-transpilers';
import {
  getDefaultRuleset,
  applySanitization,
  applyStructuralRefactoring,
  applyLinguisticSimplification,
  extractPreservedSections,
  replaceWithPlaceholders,
  restorePreservedSections,
} from './compression-rules';

/**
 * Token optimizer class
 */
export class TokenOptimizer {
  private tokenCounter: TokenCounter;
  private transpiler: ModelTranspiler;

  constructor(
    tokenCounter?: TokenCounter,
    transpiler?: ModelTranspiler
  ) {
    this.tokenCounter = tokenCounter || new TokenCounter();
    this.transpiler = transpiler || new ModelTranspiler();
  }

  /**
   * Optimize mission content
   */
  async optimize(
    missionContent: string,
    config: TokenOptimizerConfig
  ): Promise<OptimizationResult> {
    const { model, level, ruleset, preserveTags, dryRun } = config;

    // Get default ruleset and merge with custom rules
    const finalRuleset = {
      ...getDefaultRuleset(level),
      ...ruleset,
    };

    // Add custom preserve tags if provided
    if (preserveTags && preserveTags.length > 0) {
      for (const tag of preserveTags) {
        finalRuleset.preservePatterns.push(
          new RegExp(`<${tag}>.*?</${tag}>`, 'gs')
        );
      }
    }

    // Count original tokens
    const originalTokenCount = await this.tokenCounter.count(missionContent, model);

    // Track passes applied
    const passesApplied: CompressionPassType[] = [];
    let result = missionContent;
    const warnings: string[] = [];

    try {
      // Extract and preserve protected sections
      const preserved = extractPreservedSections(
        result,
        finalRuleset.preservePatterns
      );
      result = replaceWithPlaceholders(result, preserved);

      // Pass 1: Sanitization & Normalization
      if (finalRuleset.sanitizationRules.length > 0) {
        result = applySanitization(result, finalRuleset.sanitizationRules);
        passesApplied.push('sanitization');
      }

      // Pass 2: Structural Refactoring
      if (finalRuleset.structuralRules.length > 0) {
        result = applyStructuralRefactoring(result, finalRuleset.structuralRules);
        passesApplied.push('structural');
      }

      // Pass 3: Linguistic Simplification
      if (finalRuleset.linguisticRules.length > 0) {
        result = applyLinguisticSimplification(result, finalRuleset.linguisticRules);
        passesApplied.push('linguistic');
      }

      // Restore preserved sections
      result = restorePreservedSections(result, preserved);

      // Pass 4: Model-Specific Templating
      result = this.transpiler.transpile(result, model);
      passesApplied.push('model-specific');

      // Count compressed tokens
      const compressedTokenCount = await this.tokenCounter.count(result, model);
      const denominator = compressedTokenCount.count === 0 ? 1 : compressedTokenCount.count;

      // Calculate stats
      const stats: CompressionStats = {
        originalTokens: originalTokenCount.count,
        compressedTokens: compressedTokenCount.count,
        reductionPercentage: this.calculateReductionPercentage(
          originalTokenCount.count,
          compressedTokenCount.count
        ),
        compressionRatio: originalTokenCount.count / denominator,
        passesApplied,
      };
      const tokenUsage = {
        model,
        original: originalTokenCount,
        optimized: compressedTokenCount,
        savings: originalTokenCount.count - compressedTokenCount.count,
        compressionRatio: stats.compressionRatio,
      };

      // Check if we achieved target reduction
      if (stats.reductionPercentage < 20 || stats.reductionPercentage > 30) {
        warnings.push(
          `Compression achieved ${stats.reductionPercentage.toFixed(1)}% reduction, target is 20-30%`
        );
      }

      // If dry run, return original content
      if (dryRun) {
        result = missionContent;
      }

      return {
        original: missionContent,
        optimized: result,
        stats,
        model,
        level,
        tokenUsage,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      throw new Error(`Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Optimize a mission file
   */
  async optimizeFile(
    filePath: string,
    config: TokenOptimizerConfig
  ): Promise<OptimizationResult> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return this.optimize(content, config);
  }

  /**
   * Calculate reduction percentage
   */
  private calculateReductionPercentage(original: number, compressed: number): number {
    return ((original - compressed) / original) * 100;
  }

  /**
   * Batch optimize multiple missions
   */
  async optimizeBatch(
    missions: Array<{ content: string; id: string }>,
    config: TokenOptimizerConfig
  ): Promise<Map<string, OptimizationResult>> {
    const results = new Map<string, OptimizationResult>();

    for (const mission of missions) {
      const result = await this.optimize(mission.content, config);
      results.set(mission.id, result);
    }

    return results;
  }

  /**
   * Get compression preview (dry run)
   */
  async preview(
    missionContent: string,
    model: SupportedModel,
    level: CompressionLevel
  ): Promise<OptimizationResult> {
    return this.optimize(missionContent, {
      model,
      level,
      dryRun: true,
    });
  }
}

/**
 * Export singleton instance
 */
export const defaultOptimizer = new TokenOptimizer();

/**
 * Convenience function for quick optimization
 */
export async function optimizeMission(
  content: string,
  model: SupportedModel,
  level: CompressionLevel = 'balanced'
): Promise<OptimizationResult> {
  return defaultOptimizer.optimize(content, { model, level });
}
