/**
 * MCP Tool: extract_template
 *
 * Exposes the template extraction functionality as an MCP tool
 * for use in Claude Desktop and other MCP-compatible environments.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { TemplateExtractor } from '../extraction/template-extractor';
import { ExtractionConfig, ExtractionResult } from '../extraction/types';
import { safeFilePath } from '../validation/common';
import { validateAndSanitize } from '../validation/middleware';
import { createFilePathSchema } from '../validation/schemas/file-path-schema';
import { ValidationError as InputValidationError } from '../validation/errors';
import { chmod, ensureDir, pathExists, runWithConcurrency, writeFileAtomic } from '../utils/fs';

/**
 * MCP Tool Interface for Template Extraction
 */
export interface ExtractTemplateParams {
  /** Path to the source mission file or directory */
  missionFile: string;

  /** Name for the template (used to generate templateId) */
  templateName: string;

  /** Author name or email */
  author: string;

  /** Optional: Output directory for the template (defaults to ./templates) */
  outputDir?: string;

  /** Optional: Minimum confidence threshold (0.0 to 1.0, default 0.6) */
  confidenceThreshold?: number;
}

/**
 * Main entry point for the extract_template MCP tool
 */
export async function extractTemplate(params: ExtractTemplateParams): Promise<ExtractionResult> {
  try {
    const validated = await validateParams(params);

    // Resolve the mission path
    const missionFile = await safeFilePath(validated.missionFile, {
      allowRelative: true,
      maxLength: 2048,
    });
    const missionPath = path.resolve(missionFile);

    // Determine if it's a file or directory
    const stats = await fs.stat(missionPath);
    const sourcePath = stats.isDirectory() ? missionPath : path.dirname(missionPath);

    // Create extraction config
    const config: ExtractionConfig = {
      sourceMissionPath: sourcePath,
      author: validated.author,
      confidenceThreshold: validated.confidenceThreshold ?? 0.6,
      enableASTAnalysis: true,
      excludePatterns: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '*.log',
        '.env',
        '.env.*',
      ],
    };

    // Run the extraction
    const extractor = new TemplateExtractor(config);
    const result = await extractor.extract();

    // If successful, write the template to disk
    if (result.success && result.template) {
      const outputDir = validated.outputDir
        ? await safeFilePath(validated.outputDir, { allowRelative: true })
        : './templates';
      const templateDir = await safeFilePath(path.join(outputDir, validated.templateName), {
        allowRelative: true,
      });

      await writeTemplate(templateDir, result);

      console.log(`✓ Template extracted successfully to: ${path.resolve(templateDir)}`);
      console.log(`✓ Files analyzed: ${result.stage1?.filesAnalyzed || 0}`);
      console.log(`✓ Parameters generated: ${result.stage2?.parametersGenerated || 0}`);
      console.log(`✓ Total time: ${result.totalTime}ms`);
    }

    return result;
  } catch (error) {
    if (error instanceof InputValidationError) {
      const maybeMessages = error.data?.messages;
      const dataMessages = Array.isArray(maybeMessages)
        ? maybeMessages.filter((message): message is string => typeof message === 'string')
        : undefined;
      const detailMessages =
        dataMessages && dataMessages.length > 0
          ? dataMessages
          : error.issues?.map((issue) => issue.message).filter(Boolean);
      const detail =
        detailMessages && detailMessages.length > 0 ? detailMessages[0] : error.message;
      const errorsList = detailMessages && detailMessages.length > 0 ? detailMessages : [detail];
      return {
        success: false,
        errors: errorsList,
        totalTime: 0,
      };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      errors: [errorMessage],
      totalTime: 0,
    };
  }
}

const ExtractTemplateParamsSchema = z
  .object({
    missionFile: createFilePathSchema({ allowRelative: true }),
    templateName: z
      .string()
      .min(3)
      .max(64)
      .regex(
        /^[a-zA-Z0-9-_]+$/,
        'templateName must contain only alphanumeric characters, hyphens, and underscores'
      ),
    author: z.string().min(1).max(128),
    outputDir: createFilePathSchema({ allowRelative: true }).optional(),
    confidenceThreshold: z
      .number({
        invalid_type_error: 'confidenceThreshold must be a number',
      })
      .refine((value) => value >= 0 && value <= 1, {
        message: 'confidenceThreshold must be between 0.0 and 1.0',
      })
      .optional(),
  })
  .strict();

type ValidatedExtractTemplateParams = z.infer<typeof ExtractTemplateParamsSchema>;

async function validateParams(
  params: ExtractTemplateParams
): Promise<ValidatedExtractTemplateParams> {
  const validated = await validateAndSanitize(params, ExtractTemplateParamsSchema);

  if (!(await pathExists(validated.missionFile))) {
    throw new Error(`Mission file does not exist: ${validated.missionFile}`);
  }

  return validated;
}

/**
 * Write the extracted template to disk
 */
export async function writeTemplate(templateDir: string, result: ExtractionResult): Promise<void> {
  if (!result.template) {
    throw new Error('No template to write');
  }

  const { template } = result;

  // Create template directory
  const sanitizedDir = await safeFilePath(path.resolve(templateDir), { allowRelative: false });
  await ensureDir(sanitizedDir);

  const writeTasks = template.fileStructure.map((file) => async () => {
    const filePath = await safeFilePath(file.path, {
      allowRelative: true,
      baseDir: sanitizedDir,
      maxLength: 4096,
    });
    await writeFileAtomic(filePath, file.content, { encoding: 'utf-8' });
  });

  if (writeTasks.length > 0) {
    await runWithConcurrency(writeTasks, Math.min(8, writeTasks.length));
  }

  // Write metadata file
  const metadataPath = await safeFilePath('template-metadata.json', {
    allowRelative: true,
    baseDir: sanitizedDir,
  });
  await writeFileAtomic(metadataPath, JSON.stringify(template.metadata, null, 2), {
    encoding: 'utf-8',
  });

  // Write extraction report
  const reportPath = await safeFilePath('EXTRACTION_REPORT.md', {
    allowRelative: true,
    baseDir: sanitizedDir,
  });
  const report = generateExtractionReport(result);
  await writeFileAtomic(reportPath, report, { encoding: 'utf-8' });

  // Write hooks if present
  if (template.hooks?.preGenerate) {
    const preHookPath = await safeFilePath(path.join('hooks', 'pre_gen_project.sh'), {
      allowRelative: true,
      baseDir: sanitizedDir,
    });
    await ensureDir(path.dirname(preHookPath));
    await writeFileAtomic(preHookPath, template.hooks.preGenerate, { encoding: 'utf-8' });
    await chmod(preHookPath, 0o755);
  }

  if (template.hooks?.postGenerate) {
    const postHookPath = await safeFilePath(path.join('hooks', 'post_gen_project.sh'), {
      allowRelative: true,
      baseDir: sanitizedDir,
    });
    await ensureDir(path.dirname(postHookPath));
    await writeFileAtomic(postHookPath, template.hooks.postGenerate, { encoding: 'utf-8' });
    await chmod(postHookPath, 0o755);
  }
}

/**
 * Generate a human-readable extraction report
 */
export function generateExtractionReport(result: ExtractionResult): string {
  const { template, stage1, stage2, totalTime } = result;

  if (!template) {
    return '# Extraction Report\n\nExtraction failed. See errors for details.';
  }

  let report = '# Template Extraction Report\n\n';

  report += `## Summary\n\n`;
  report += `- **Template ID**: ${template.metadata.templateId}\n`;
  report += `- **Template Name**: ${template.metadata.name}\n`;
  report += `- **Source Mission**: ${template.metadata.sourceMissionId}\n`;
  report += `- **Author**: ${template.metadata.author}\n`;
  report += `- **Generated**: ${template.metadata.creationDate}\n`;
  report += `\n`;

  report += `## Performance Metrics\n\n`;
  report += `- **Total Execution Time**: ${totalTime}ms\n`;
  report += `- **Stage 1 (Candidate Identification)**: ${stage1?.executionTime}ms\n`;
  report += `- **Stage 2 (Parameterization)**: ${stage2?.executionTime}ms\n`;
  report += `- **Files Analyzed**: ${stage1?.filesAnalyzed}\n`;
  report += `- **Parameters Generated**: ${stage2?.parametersGenerated}\n`;
  report += `\n`;

  report += `## Extracted Parameters\n\n`;
  report += `| Parameter | Type | Description | Default | Required |\n`;
  report += `|-----------|------|-------------|---------|----------|\n`;

  for (const [name, param] of Object.entries(template.metadata.parameters)) {
    report += `| ${name} | ${param.type} | ${param.description} | ${param.default} | ${param.required ? 'Yes' : 'No'} |\n`;
  }
  report += `\n`;

  report += `## Template Structure\n\n`;
  report += `\`\`\`\n`;
  for (const file of template.fileStructure) {
    const prefix = file.optional ? '[OPTIONAL] ' : '';
    report += `${prefix}${file.path}\n`;
  }
  report += `\`\`\`\n\n`;

  report += `## Next Steps\n\n`;
  report += `1. **Review Parameters**: Validate that parameter names and types are correct\n`;
  report += `2. **Test Template**: Generate a test project using this template\n`;
  report += `3. **Refine Logic**: Add any conditional blocks for optional features\n`;
  report += `4. **Documentation**: Update template description and parameter descriptions\n`;
  report += `5. **Publish**: Add template to the domain pack catalog\n`;
  report += `\n`;

  report += `## Human-in-the-Loop Refinement (Stage 3)\n\n`;
  report += `This template has been auto-generated using Stages 1 and 2 of the extraction algorithm.\n`;
  report += `The final Stage 3 (Human-in-the-Loop Refinement) requires manual review and enhancement:\n\n`;
  report += `- [ ] Validate and rename auto-generated parameter names\n`;
  report += `- [ ] Adjust parameter types and default values\n`;
  report += `- [ ] Add or refine conditional logic for optional features\n`;
  report += `- [ ] Enrich metadata with better descriptions and tags\n`;
  report += `- [ ] Add validation rules (regex patterns) for string parameters\n`;
  report += `- [ ] Test the template by generating a new mission\n`;
  report += `\n`;

  return report;
}

/**
 * MCP Tool Registration
 * Canonical specification for template extraction
 */
export const getTemplateExtractionToolDefinition = {
  name: 'get_template_extraction',
  description:
    'Extract a reusable template from a successful mission using the three-stage hybrid extraction algorithm',
  inputSchema: {
    type: 'object',
    properties: {
      missionFile: {
        type: 'string',
        description: 'Path to the source mission file or directory',
      },
      templateName: {
        type: 'string',
        description: 'Name for the template (used to generate templateId)',
      },
      author: {
        type: 'string',
        description: 'Author name or email',
      },
      outputDir: {
        type: 'string',
        description: 'Output directory for the template (optional, defaults to ./templates)',
      },
      confidenceThreshold: {
        type: 'number',
        description: 'Minimum confidence threshold for parameterization (0.0 to 1.0, default 0.6)',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['missionFile', 'templateName', 'author'],
  },
} as const;

/**
 * Legacy alias maintained for one release cycle
 */
export const extractTemplateToolDefinitionDeprecated = {
  ...getTemplateExtractionToolDefinition,
  name: 'extract_template',
  description:
    '[DEPRECATED] Use get_template_extraction instead. Performs the same three-stage extraction workflow.',
} as const;
