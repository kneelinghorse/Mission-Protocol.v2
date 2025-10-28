import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as YAML from 'yaml';
import { buildMissionProtocolContext, executeMissionProtocolTool } from '../../src/index';
import type { MissionProtocolContext } from '../../src/index';
import { createTemplateFromMission } from '../../src/tools/export-template';
import { resolveTemplatesDir } from '../utils/template-path';
import { ensureDir, ensureTempDir, pathExists, removeDir } from '../../src/utils/fs';
import { ValidationError } from '../../src/errors/validation-error';
import { DomainError } from '../../src/errors/domain-error';

const SAMPLE_MISSION = `
missionId: "INTEGRATION-001"
objective: "Coordinate integration coverage for Mission Protocol tools."

context: |
  This mission ensures all MCP tools behave correctly under integration tests.
  It validates success paths, edge cases, and error handling end-to-end.

successCriteria:
  - "All tools respond with structured content."
  - "Edge cases produce deterministic outputs."
  - "Errors surface actionable messages."

deliverables:
  - "reports/integration-coverage.md"
  - "artifacts/test-fixtures/"
  - "scripts/verification.sh"
`;

const TEMPLATE_METADATA = {
  name: 'integration-template',
  version: '1.0.0',
  author: 'integration-suite',
  signature: {
    keyId: 'integration-suite-key',
    algorithm: 'PGP-SHA256',
    value: 'aW50ZWdyYXRpb24=',
  },
} as const;

describe('Mission Protocol Tools Integration', () => {
  let context: MissionProtocolContext;
  let baseTemplatesDir: string;
  let tempRoot: string;
  let missionFile: string;
  let dependencyDir: string;
  let extractionSourceDir: string;
  let extractionOutputDir: string;
  let templateOutputBase: string;
  let largeMissionFile: string;
  let previousWorkspaceRoot: string | undefined;

  beforeAll(async () => {
    previousWorkspaceRoot = process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    baseTemplatesDir = await resolveTemplatesDir();
    context = await buildMissionProtocolContext({
      baseDir: baseTemplatesDir,
      defaultModel: 'claude',
    });

    tempRoot = await ensureTempDir('mission-protocol-tools-');
    process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = tempRoot;
    missionFile = path.join(tempRoot, 'mission.yaml');
    await fs.writeFile(missionFile, SAMPLE_MISSION, 'utf-8');

    dependencyDir = path.join(tempRoot, 'dependency-missions');
    await ensureDir(dependencyDir);

    const dependencyMissions = [
      {
        file: 'R4.3.yaml',
        data: {
          missionId: 'R4.3',
          objective: 'Research dependency analysis',
          context: 'Baseline mission feeding later build efforts.',
        },
      },
      {
        file: 'B4.3.yaml',
        data: {
          missionId: 'B4.3',
          objective: 'Build dependency insights',
          domainFields: {
            researchFoundation: [{ finding: 'Use DAG validation', sourceMission: 'R4.3' }],
          },
        },
      },
      {
        file: 'B4.4.yaml',
        data: {
          missionId: 'B4.4',
          objective: 'Integrate quality scoring with dependencies',
          domainFields: {
            handoffContext: {
              dependencies: ['B4.3'],
            },
          },
        },
      },
      {
        file: 'R4.5.yml',
        data: {
          missionId: 'R4.5',
          objective: 'Alternate extension coverage',
          context: 'Ensures .yml parsing path is covered.',
        },
      },
    ];

    for (const mission of dependencyMissions) {
      await fs.writeFile(
        path.join(dependencyDir, mission.file),
        YAML.stringify(mission.data),
        'utf-8'
      );
    }

    extractionSourceDir = path.join(tempRoot, 'extraction-source');
    extractionOutputDir = path.join(tempRoot, 'extraction-output');
    await ensureDir(extractionSourceDir);
    await ensureDir(extractionOutputDir);

    await fs.writeFile(
      path.join(extractionSourceDir, 'app.js'),
      'console.log("integration");\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(extractionSourceDir, 'package.json'),
      JSON.stringify({ name: 'integration-app', version: '1.0.0' }, null, 2),
      'utf-8'
    );
    await fs.writeFile(
      path.join(extractionSourceDir, 'mission.yaml'),
      YAML.stringify({
        name: 'integration-mission',
        type: 'build',
        status: 'planned',
      }),
      'utf-8'
    );

    templateOutputBase = path.join(tempRoot, 'template-exports');
    await ensureDir(templateOutputBase);

    largeMissionFile = path.join(tempRoot, 'large-mission.yaml');
    const largeMissionData = {
      missionId: 'INTEGRATION-LARGE',
      objective: `Scale test mission ${'X'.repeat(256)}`,
      context: `Ensures update_token_optimization handles large payloads ${'Y'.repeat(512)}`,
      successCriteria: Array.from(
        { length: 20 },
        (_, index) => `Criterion ${index + 1}: ${'Z'.repeat(12)}`
      ),
      constraints: Array.from({ length: 10 }, (_, index) => `Constraint ${index + 1}`),
    };
    await fs.writeFile(largeMissionFile, YAML.stringify(largeMissionData), 'utf-8');
  });

  afterAll(async () => {
    if (previousWorkspaceRoot !== undefined) {
      process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = previousWorkspaceRoot;
    } else {
      delete process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    }
    previousWorkspaceRoot = undefined;
    if (tempRoot && (await pathExists(tempRoot))) {
      await removeDir(tempRoot);
    }
  });

  const runTool = async (name: string, args?: unknown) =>
    executeMissionProtocolTool(name, args, context);

  describe('Happy path coverage', () => {
    it('lists available domains from the registry', async () => {
      const result = await runTool('get_available_domains');
      const structured = result.structuredContent as any;

      expect(structured.success).toBe(true);
      expect(Array.isArray(structured.domains)).toBe(true);
      expect(structured.domains.length).toBeGreaterThan(0);
      expect(result.content?.[0]?.text).toContain('domain pack');
    });

    it('supports legacy list_available_domains alias', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = await runTool('list_available_domains');
        const structured = result.structuredContent as any;

        expect(structured.success).toBe(true);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Tool 'list_available_domains' will be removed")
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('creates missions with optional domain merge', async () => {
      const params = {
        objective: 'Run end-to-end mission creation',
        domain: 'foundation',
        successCriteria: ['Mission compiled', 'Tests executed'],
        constraints: ['Timebox to 2 hours'],
      };

      const result = await runTool('create_mission', params);
      const structured = result.structuredContent as any;

      expect(structured.success).toBe(true);
      expect(structured.mission).toContain(params.objective);

      const missionYaml = structured.mission as string;
      const mission = YAML.parse(missionYaml);
      expect(mission.successCriteria).toEqual(expect.arrayContaining(params.successCriteria));
    });

    it('combines packs with dependency resolution', async () => {
      const result = await runTool('create_combined_pack', {
        packNames: ['foundation', 'software.technical-task'],
        format: 'yaml',
      });
      const structured = result.structuredContent as any;

      expect(structured.success).toBe(true);
      expect(structured.loadOrder?.length).toBeGreaterThan(0);
      expect(structured.combinedPack).toContain('foundation');
    });

    it('analyzes mission dependencies end-to-end', async () => {
      const result = await runTool('get_dependency_analysis', {
        missionDirectory: dependencyDir,
        includeInferred: true,
        minConfidence: 0.5,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);

      const summary = structured.summary as string;
      expect(summary).toContain('Total Missions: 4');
      expect(summary).toContain('Execution Order');
      expect(result.content?.[0]?.text).toContain('Dependency Analysis Report');
    });

    it('scores mission quality with verbose summary', async () => {
      const result = await runTool('get_mission_quality_score', {
        missionFile,
        verbose: true,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.result.summary).toBeDefined();
      expect(result.content?.[0]?.text).toContain('Mission Quality Assessment');
    });

    it('optimizes tokens in dry-run mode', async () => {
      const result = await runTool('update_token_optimization', {
        missionFile,
        targetModel: 'claude',
        dryRun: true,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.tokenUsage.model).toBe('claude');
      expect(structured.tokenUsage.original.count).toBeGreaterThan(0);
    });

    it('splits missions and reports complexity summary', async () => {
      const result = await runTool('create_mission_splits', {
        missionFile,
        outputDir: tempRoot,
        preserveStructure: true,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.result.summary).toBeDefined();
    });

    it('suggests mission splits with token usage insight', async () => {
      const result = await runTool('get_split_suggestions', {
        missionFile,
        detailed: true,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.result.recommendation).toBeDefined();
      expect(structured.tokenUsage).toBeDefined();
    });

    it('extracts a template from source files', async () => {
      const result = await runTool('get_template_extraction', {
        missionFile: extractionSourceDir,
        templateName: 'integration-sample',
        author: 'integration@test',
        outputDir: extractionOutputDir,
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);

      const templateDir = path.join(extractionOutputDir, 'integration-sample');
      expect(await pathExists(templateDir)).toBe(true);
      expect(await pathExists(path.join(templateDir, 'EXTRACTION_REPORT.md'))).toBe(true);
      expect(await pathExists(path.join(templateDir, 'template-metadata.json'))).toBe(true);
    });

    it('exports and re-imports templates successfully', async () => {
      const missionSpec = YAML.parse(SAMPLE_MISSION);
      const template = createTemplateFromMission(missionSpec, TEMPLATE_METADATA);

      const exportResult = await runTool('get_template_export', {
        template,
        outputPath: 'integration-template.yaml',
        baseDir: templateOutputBase,
      });

      const exportStructured = exportResult.structuredContent as any;
      expect(exportStructured.success).toBe(true);

      const exportedPath = path.join(templateOutputBase, 'integration-template.yaml');
      expect(await pathExists(exportedPath)).toBe(true);

      const importResult = await runTool('create_template_import', {
        templatePath: exportedPath,
        baseDir: templateOutputBase,
        skipSignatureVerification: true,
      });

      const importStructured = importResult.structuredContent as any;
      expect(importStructured.success).toBe(true);
      expect(importStructured.message).toContain('imported successfully');
    });
  });

  describe('Edge cases', () => {
    it('rejects create_mission calls with empty objective', async () => {
      try {
        await runTool('create_mission', { objective: '   ' });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain('objective');
        return;
      }
      throw new Error('Expected create_mission to throw on empty objective');
    });

    it('requires at least one pack when combining packs', async () => {
      const result = await runTool('create_combined_pack', { packNames: [] });
      const structured = result.structuredContent as any;

      expect(structured.success).toBe(false);
      expect(structured.errors?.[0]).toContain('At least one pack name');
    });

    it('supports maximum length template names during extraction', async () => {
      const maxName = 't'.repeat(64);
      const result = await runTool('get_template_extraction', {
        missionFile: extractionSourceDir,
        templateName: maxName,
        author: 'integration@test',
        outputDir: path.join(extractionOutputDir, 'max-name'),
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);

      const outputDir = path.join(extractionOutputDir, 'max-name', maxName);
      expect(await pathExists(outputDir)).toBe(true);
    });

    it('optimizes missions with large payloads and custom preserve tags', async () => {
      const result = await runTool('update_token_optimization', {
        missionFile: largeMissionFile,
        targetModel: 'claude',
        dryRun: true,
        preserveTags: Array.from({ length: 32 }, (_, index) => `tag-${index}`),
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.stats.originalTokens).toBeGreaterThan(0);
      expect(structured.tokenUsage.original.count).toBeGreaterThan(0);
    });

    it('executes multiple tools concurrently without conflicts', async () => {
      const [domains, mission, combination, quality] = await Promise.all([
        runTool('get_available_domains'),
        runTool('create_mission', { objective: 'Concurrent mission execution' }),
        runTool('create_combined_pack', { packNames: ['foundation'], format: 'yaml' }),
        runTool('get_mission_quality_score', { missionFile, verbose: false }),
      ]);

      expect((domains.structuredContent as any).success).toBe(true);
      expect((mission.structuredContent as any).success).toBe(true);
      expect((combination.structuredContent as any).success).toBe(true);
      expect((quality.structuredContent as any).success).toBe(true);
    });

    it('surfaces export errors when filesystem paths are blocked', async () => {
      const blockingFile = path.join(tempRoot, 'blocked-path');
      await fs.writeFile(blockingFile, 'content', 'utf-8');

      const template = createTemplateFromMission(
        { objective: 'Filesystem edge case', context: 'Test blocked path' },
        {
          name: 'fs-edge-template',
          version: '1.0.0',
          author: 'integration-suite',
          signature: {
            keyId: 'integration-suite-key',
            algorithm: 'PGP-SHA256',
            value: 'Zm9vYmFy',
          },
        }
      );

      const result = await runTool('get_template_export', {
        template,
        baseDir: tempRoot,
        outputPath: path.join('blocked-path', 'should-fail.yaml'),
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(structured.message).toContain('Export failed');
    });
  });

  describe('Error handling', () => {
    it('reports unknown domains during mission creation', async () => {
      try {
        await runTool('create_mission', {
          objective: 'Unknown domain mission',
          domain: 'non-existent-domain',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).message).toContain('non-existent-domain');
        return;
      }
      throw new Error('Expected create_mission to throw for unknown domain');
    });

    it('returns structured failure when get_mission_quality_score target is missing', async () => {
      const missingPath = path.join(tempRoot, 'missing-quality.yaml');
      const result = await runTool('get_mission_quality_score', { missionFile: missingPath });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(result.content?.[0]?.text).toContain('Quality scoring failed');
    });

    it('fails update_token_optimization when mission file is absent', async () => {
      const missingPath = path.join(tempRoot, 'missing-mission.yaml');
      const result = await runTool('update_token_optimization', {
        missionFile: missingPath,
        targetModel: 'claude',
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(structured.error).toContain('Mission file not found');
    });

    it('recovers create_mission_splits after missing file error', async () => {
      const missingPath = path.join(tempRoot, 'split-missing.yaml');
      let caughtError: unknown;

      try {
        await runTool('create_mission_splits', { missionFile: missingPath });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toContain('Mission file not found');

      const recoveryMission = {
        missionId: 'RECOVERY-1',
        objective: 'Recover split mission flow',
        context: 'Created after failure',
      };
      await fs.writeFile(missingPath, YAML.stringify(recoveryMission), 'utf-8');

      const recoveryResult = await runTool('create_mission_splits', {
        missionFile: missingPath,
        outputDir: tempRoot,
      });

      const structured = recoveryResult.structuredContent as any;
      expect(structured.success).toBe(true);
      expect(structured.result.summary).toContain('Mission complexity');
    });

    it('rejects get_split_suggestions with invalid mission file', async () => {
      try {
        await runTool('get_split_suggestions', { missionFile: '   ' });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('missionFile is required');
        return;
      }
      throw new Error('Expected get_split_suggestions to throw on invalid input');
    });

    it('highlights empty directories during dependency analysis', async () => {
      const emptyDir = path.join(tempRoot, 'empty-missions');
      await ensureDir(emptyDir);

      const result = await runTool('get_dependency_analysis', {
        missionDirectory: emptyDir,
      });

      const structured = result.structuredContent as any;
      const summary = structured.summary as string;
      expect(summary).toContain('Errors:');
      expect(summary).toContain('No mission files found');

      await removeDir(emptyDir);
    });

    it('surfaces validation errors for malformed extraction parameters', async () => {
      const result = await runTool('get_template_extraction', {
        missionFile: extractionSourceDir,
        templateName: 'invalid template name!',
        author: 'integration@test',
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(structured.errors?.[0]).toContain('alphanumeric');
    });

    it('rejects invalid trust levels during template import', async () => {
      const result = await runTool('create_template_import', {
        templatePath: 'fake.yaml',
        trustLevel: 'invalid-level',
      });

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(structured.message).toContain('Invalid trustLevel');
    });

    it('rejects malformed templates during export', async () => {
      const result = await runTool('get_template_export', {
        template: { apiVersion: 'mission-template.v1' },
        outputPath: 'invalid.yaml',
        baseDir: templateOutputBase,
      } as any);

      const structured = result.structuredContent as any;
      expect(structured.success).toBe(false);
      expect(structured.message).toContain('Export failed');
    });
  });
});
