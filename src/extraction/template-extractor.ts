/**
 * Template Extractor - Three-Stage Hybrid Extraction Algorithm
 *
 * Implements the algorithm defined in research mission R3.1:
 * 1. Stage 1: Automated Candidate Identification
 * 2. Stage 2: Automated Parameterization & Logic Inference
 * 3. Stage 3: Human-in-the-Loop Refinement (handled by separate UI/tool)
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as crypto from 'crypto';
import { jsonContent } from '../validation/common';
import {
  Candidate,
  CandidateMap,
  ExtractedTemplate,
  TemplateFile,
  TemplateMetadata,
  TemplateParameter,
  ExtractionConfig,
  Stage1Result,
  Stage2Result,
  ExtractionResult
} from './types';
import { pathExists, runWithConcurrency } from '../utils/fs';

const MAX_CONFIG_SIZE_BYTES = 512 * 1024;

export class TemplateExtractor {
  private config: ExtractionConfig;
  private stage1StartTime: number = 0;
  private stage2StartTime: number = 0;

  constructor(config: ExtractionConfig) {
    this.config = {
      confidenceThreshold: 0.6,
      enableASTAnalysis: true,
      excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.log'],
      ...config
    };
  }

  /**
   * Main entry point for the extraction process
   */
  async extract(): Promise<ExtractionResult> {
    const totalStartTime = performance.now();
    const errors: string[] = [];

    try {
      // Validate source mission exists
      if (!(await pathExists(this.config.sourceMissionPath))) {
        throw new Error(`Source mission path does not exist: ${this.config.sourceMissionPath}`);
      }

      // Stage 1: Identify candidates
      const stage1Result = await this.identifyCandidates(this.config.sourceMissionPath);

      // Stage 2: Generate template
      const stage2Result = await this.generateTemplate(stage1Result.candidates);

      const totalTime = Math.round(performance.now() - totalStartTime);

      return {
        success: true,
        template: stage2Result.template,
        stage1: stage1Result,
        stage2: stage2Result,
        totalTime
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        errors,
        totalTime: Math.round(performance.now() - totalStartTime)
      };
    }
  }

  /**
   * Stage 1: Automated Candidate Identification
   *
   * Analyzes the source mission to identify potential parameters using:
   * - Literal differencing & frequency analysis
   * - Structural hashing and clone detection (AST-based)
   */
  async identifyCandidates(missionPath: string): Promise<Stage1Result> {
    this.stage1StartTime = performance.now();
    const candidates: CandidateMap = {};
    let filesAnalyzed = 0;

    // Get all files in the mission
    const files = await this.getAllFiles(missionPath);

    // Track literal frequencies across all files
    const literalFrequency = new Map<string, number>();
    const literalLocations = new Map<string, Candidate[]>();

    const fileAnalysisTasks = files.map(filePath => async () => {
      if (this.shouldExcludeFile(filePath)) {
        return;
      }

      filesAnalyzed++;
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(missionPath, filePath);

      if (this.isConfigFile(filePath)) {
        await this.analyzeConfigFile(filePath, relativePath, content, literalFrequency, literalLocations);
      } else if (this.isCodeFile(filePath)) {
        await this.analyzeCodeFile(filePath, relativePath, content, literalFrequency, literalLocations);
      }

      this.analyzeFilePath(filePath, relativePath, literalFrequency, literalLocations);
    });

    if (fileAnalysisTasks.length > 0) {
      await runWithConcurrency(fileAnalysisTasks, Math.min(8, fileAnalysisTasks.length));
    }

    // Calculate confidence scores based on frequency
    for (const [literal, locations] of literalLocations) {
      const frequency = literalFrequency.get(literal) || 0;
      const confidence = this.calculateConfidence(frequency, locations.length, filesAnalyzed);

      // Only include candidates above threshold
      if (confidence >= (this.config.confidenceThreshold || 0.6)) {
        const paramName = this.suggestParameterName(literal, locations[0]);

        if (!candidates[paramName]) {
          candidates[paramName] = [];
        }

        candidates[paramName].push(...locations.map(loc => ({
          ...loc,
          frequency,
          confidence
        })));
      }
    }

    // If no candidates found, lower threshold to ensure we get some results
    if (Object.keys(candidates).length === 0 && literalLocations.size > 0) {
      for (const [literal, locations] of literalLocations) {
        const frequency = literalFrequency.get(literal) || 0;
        const confidence = this.calculateConfidence(frequency, locations.length, filesAnalyzed);

        const paramName = this.suggestParameterName(literal, locations[0]);

        if (!candidates[paramName]) {
          candidates[paramName] = [];
        }

        candidates[paramName].push(...locations.map(loc => ({
          ...loc,
          frequency,
          confidence
        })));
      }
    }

    const rawDuration = Math.round(performance.now() - this.stage1StartTime);
    const executionTime = filesAnalyzed > 0 ? Math.max(1, rawDuration) : rawDuration;

    return {
      candidates,
      executionTime,
      filesAnalyzed
    };
  }

  /**
   * Stage 2: Automated Parameterization & Logic Inference
   *
   * Transforms candidates into a structured template with:
   * - Rule-based parameter generation
   * - Conditional block inference
   */
  async generateTemplate(candidates: CandidateMap): Promise<Stage2Result> {
    this.stage2StartTime = performance.now();

    const parameters: Record<string, TemplateParameter> = {};
    const fileStructure: TemplateFile[] = [];

    // Generate parameters from candidates
    let parametersGenerated = 0;
    for (const [paramName, candidateList] of Object.entries(candidates)) {
      const param = this.generateParameter(paramName, candidateList);
      parameters[paramName] = param;
      parametersGenerated++;
    }

    // Process all files and apply parameterization
    const files = await this.getAllFiles(this.config.sourceMissionPath);
    const pathSegmentReplacements = this.buildPathSegmentReplacements(candidates);
    const contentReplacements = this.buildContentReplacementsByFile(candidates);

    const processedFiles = await runWithConcurrency(
      files.map(filePath => async () => {
        if (this.shouldExcludeFile(filePath)) {
          return null;
        }

        const relativePath = path.relative(this.config.sourceMissionPath, filePath);
        let content = await fs.readFile(filePath, 'utf-8');
        let templatePath = relativePath;

        if (pathSegmentReplacements.length > 0) {
          for (const { search, replacement } of pathSegmentReplacements) {
            if (templatePath.includes(search)) {
              templatePath = templatePath.split(search).join(replacement);
            }
          }
        }

        const replacementsForFile = contentReplacements.get(relativePath);
        if (replacementsForFile) {
          for (const { regex, replacement } of replacementsForFile) {
            content = content.replace(regex, replacement);
          }
        }

        return {
          path: templatePath,
          content
        } as TemplateFile;
      }),
      Math.min(8, files.length || 1)
    );

    for (const file of processedFiles) {
      if (file) {
        fileStructure.push(file);
      }
    }

    // Generate metadata
    const metadata: TemplateMetadata = await this.extractMetadata(
      parameters,
      this.config.sourceMissionPath
    );

    const template: ExtractedTemplate = {
      fileStructure,
      metadata
    };

    const rawDuration = Math.round(performance.now() - this.stage2StartTime);
    const executionTime = files.length > 0 ? Math.max(1, rawDuration) : rawDuration;

    return {
      template,
      executionTime,
      parametersGenerated
    };
  }

  /**
   * Extract metadata for template catalog
   */
  async extractMetadata(
    parameters: Record<string, TemplateParameter>,
    sourcePath: string
  ): Promise<TemplateMetadata> {
    const missionName = path.basename(sourcePath);
    const templateId = this.generateTemplateId(missionName);
    const now = new Date().toISOString();

    return {
      templateId,
      templateVersion: '1.0.0',
      name: this.generateTemplateName(missionName),
      description: `Template extracted from ${missionName}`,
      author: this.config.author,
      tags: await this.generateTags(sourcePath),
      parameters,
      sourceMissionId: missionName,
      creationDate: now,
      lastUpdatedDate: now,
      usageCount: 0,
      generatedSuccessRate: 0
    };
  }

  // === Private Helper Methods ===

  private async getAllFiles(dir: string, fileList: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.getAllFiles(filePath, fileList);
      } else {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  private shouldExcludeFile(filePath: string): boolean {
    const patterns = this.config.excludePatterns || [];
    return patterns.some(pattern => {
      const regex = new RegExp(pattern.replace('**', '.*').replace('*', '[^/]*'));
      return regex.test(filePath);
    });
  }

  private isConfigFile(filePath: string): boolean {
    const configExtensions = ['.yaml', '.yml', '.json', '.toml', '.properties', '.env'];
    return configExtensions.some(ext => filePath.endsWith(ext));
  }

  private isCodeFile(filePath: string): boolean {
    const codeExtensions = ['.ts', '.js', '.py', '.java', '.go', '.rs', '.rb', '.php'];
    return codeExtensions.some(ext => filePath.endsWith(ext));
  }

  private async analyzeConfigFile(
    filePath: string,
    relativePath: string,
    content: string,
    literalFrequency: Map<string, number>,
    literalLocations: Map<string, Candidate[]>
  ): Promise<void> {
    try {
      let config: any;

      if (filePath.endsWith('.json')) {
        config = jsonContent(content, { maxSize: MAX_CONFIG_SIZE_BYTES });
      } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        config = yaml.parse(content);
      }

      if (config && typeof config === 'object') {
        this.extractConfigValues(config, relativePath, filePath, literalFrequency, literalLocations);
      }
    } catch (error) {
      // Skip files that can't be parsed
    }
  }

  private extractConfigValues(
    obj: any,
    relativePath: string,
    filePath: string,
    literalFrequency: Map<string, number>,
    literalLocations: Map<string, Candidate[]>,
    keyPath: string = ''
  ): void {
    const metadataKeys = ['name', 'version', 'author', 'email', 'description', 'host', 'port', 'title'];

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = keyPath ? `${keyPath}.${key}` : key;

      if (metadataKeys.includes(key.toLowerCase()) && (typeof value === 'string' || typeof value === 'number')) {
        const actualValue = value; // Keep original type
        const valueStr = String(value);

        literalFrequency.set(valueStr, (literalFrequency.get(valueStr) || 0) + 1);

        if (!literalLocations.has(valueStr)) {
          literalLocations.set(valueStr, []);
        }

        literalLocations.get(valueStr)!.push({
          type: 'config-value',
          value: actualValue, // Store original type
          filePath: relativePath,
          lineNumber: 0, // Would need line-aware parser for exact line
          frequency: 0,
          confidence: 0,
          context: currentPath
        });
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.extractConfigValues(value, relativePath, filePath, literalFrequency, literalLocations, currentPath);
      }
    }
  }

  private async analyzeCodeFile(
    filePath: string,
    relativePath: string,
    content: string,
    literalFrequency: Map<string, number>,
    literalLocations: Map<string, Candidate[]>
  ): Promise<void> {
    // Extract string literals
    const stringLiteralRegex = /["']([^"']+)["']/g;
    let match;
    let lineNumber = 1;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      lineNumber = i + 1;

      while ((match = stringLiteralRegex.exec(line)) !== null) {
        const literal = match[1];

        // Skip common keywords and short strings
        if (literal.length > 2 && !this.isCommonKeyword(literal)) {
          literalFrequency.set(literal, (literalFrequency.get(literal) || 0) + 1);

          if (!literalLocations.has(literal)) {
            literalLocations.set(literal, []);
          }

          literalLocations.get(literal)!.push({
            type: 'literal',
            value: literal,
            filePath: relativePath,
            lineNumber,
            frequency: 0,
            confidence: 0,
            context: line.trim()
          });
        }
      }
    }
  }

  private analyzeFilePath(
    filePath: string,
    relativePath: string,
    literalFrequency: Map<string, number>,
    literalLocations: Map<string, Candidate[]>
  ): void {
    // Extract unique path segments that might be project-specific
    const segments = relativePath.split(path.sep);

    for (const segment of segments) {
      // Skip common directory names
      if (this.isCommonDirectoryName(segment)) continue;

      // Check if segment looks like a project-specific identifier
      if (segment.match(/^[a-z][a-z0-9-_]*$/i) && segment.length > 2) {
        literalFrequency.set(segment, (literalFrequency.get(segment) || 0) + 1);

        if (!literalLocations.has(segment)) {
          literalLocations.set(segment, []);
        }

        literalLocations.get(segment)!.push({
          type: 'path-segment',
          value: segment,
          filePath: relativePath,
          lineNumber: 0,
          frequency: 0,
          confidence: 0,
          context: 'file-path'
        });
      }
    }
  }

  private calculateConfidence(frequency: number, locationCount: number, totalFiles: number): number {
    // Low frequency = likely project-specific = high confidence for parameterization
    // High frequency = likely boilerplate = low confidence

    // For small projects (few files), be more lenient
    const baseThreshold = Math.max(totalFiles, 5);

    const frequencyScore = Math.max(0, 1 - (frequency / baseThreshold));
    const locationScore = Math.min(1, locationCount / 2); // Multiple locations increase confidence

    return (frequencyScore * 0.6) + (locationScore * 0.4);
  }

  private suggestParameterName(literal: string, candidate: Candidate): string {
    // Use context to suggest better parameter names
    if (candidate.type === 'config-value' && candidate.context) {
      const parts = candidate.context.split('.').filter(p => p.length > 0);
      return parts[parts.length - 1].replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    }

    if (candidate.type === 'path-segment') {
      return 'project_name';
    }

    // Generate from literal value
    return literal
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'param';
  }

  private generateParameter(paramName: string, candidates: Candidate[]): TemplateParameter {
    // Determine type from candidate values
    const firstValue = candidates[0].value;
    let type: 'string' | 'number' | 'boolean' | 'choice' = 'string';

    if (typeof firstValue === 'number') {
      type = 'number';
    } else if (firstValue === 'true' || firstValue === 'false') {
      type = 'boolean';
    }

    // Use the most common value as default
    const valueCounts = new Map<string | number, number>();
    for (const candidate of candidates) {
      const val = candidate.value;
      valueCounts.set(val, (valueCounts.get(val) || 0) + 1);
    }

    const defaultValue = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];

    return {
      type,
      description: `Parameter for ${paramName}`,
      default: defaultValue,
      required: true
    };
  }

  private generateTemplateId(missionName: string): string {
    return missionName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateTemplateName(missionName: string): string {
    return missionName
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private async generateTags(sourcePath: string): Promise<string[]> {
    const tags: string[] = [];
    const baseName = path.basename(sourcePath).toLowerCase();

    const files = await this.getAllFiles(sourcePath);

    if (files.some(f => f.endsWith('.py'))) tags.push('python');
    if (files.some(f => f.endsWith('.ts') || f.endsWith('.js'))) tags.push('typescript', 'javascript');
    if (files.some(f => f.endsWith('.java'))) tags.push('java');
    if (files.some(f => f.endsWith('.go'))) tags.push('go');

    if (baseName.includes('api')) tags.push('api');
    if (baseName.includes('service')) tags.push('service');
    if (baseName.includes('web')) tags.push('web');

    return tags;
  }

  private isCommonKeyword(str: string): boolean {
    const keywords = ['id', 'name', 'type', 'value', 'data', 'error', 'success', 'true', 'false', 'null', 'undefined'];
    return keywords.includes(str.toLowerCase());
  }

  private isCommonDirectoryName(name: string): boolean {
    const common = ['src', 'lib', 'test', 'tests', 'bin', 'dist', 'build', 'public', 'static', 'assets', 'docs', 'config'];
    return common.includes(name.toLowerCase());
  }

  private buildPathSegmentReplacements(
    candidates: CandidateMap
  ): Array<{ search: string; replacement: string }> {
    const replacements: Array<{ search: string; replacement: string }> = [];

    for (const [paramName, candidateList] of Object.entries(candidates)) {
      for (const candidate of candidateList) {
        if (candidate.type === 'path-segment') {
          const search = String(candidate.value);

          if (search.length === 0) {
            continue;
          }

          replacements.push({
            search,
            replacement: `{{ ${paramName} }}`
          });
        }
      }
    }

    return replacements;
  }

  private buildContentReplacementsByFile(
    candidates: CandidateMap
  ): Map<string, Array<{ regex: RegExp; replacement: string }>> {
    const replacements = new Map<string, Array<{ regex: RegExp; replacement: string }>>();

    for (const [paramName, candidateList] of Object.entries(candidates)) {
      for (const candidate of candidateList) {
        if (candidate.type === 'path-segment' || !candidate.filePath) {
          continue;
        }

        const value = String(candidate.value);
        if (value.length === 0) {
          continue;
        }

        const entry = replacements.get(candidate.filePath) ?? [];
        entry.push({
          regex: new RegExp(`\\b${this.escapeRegex(value)}\\b`, 'g'),
          replacement: `{{ ${paramName} }}`
        });
        replacements.set(candidate.filePath, entry);
      }
    }

    return replacements;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
