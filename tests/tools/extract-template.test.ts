/**
 * Integration tests for the get_template_extraction MCP tool
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureDir, ensureTempDir, pathExists, removeDir } from '../../src/utils/fs';
import {
  extractTemplate,
  ExtractTemplateParams,
  writeTemplate,
  generateExtractionReport,
} from '../../src/tools/extract-template';

describe('get_template_extraction MCP Tool', () => {
  let tempDir: string;
  let testMissionDir: string;
  let outputDir: string;
  let previousWorkspaceRoot: string | undefined;
  let previousWorkspaceAllowlist: string | undefined;

  beforeEach(async () => {
    previousWorkspaceRoot = process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    previousWorkspaceAllowlist = process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST;
    tempDir = await ensureTempDir('extract-template-test-');
    testMissionDir = path.join(tempDir, 'test-mission');
    outputDir = path.join(tempDir, 'templates');

    await ensureDir(testMissionDir);
    await ensureDir(outputDir);
    process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = tempDir;
    process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST = tempDir;
  });

  afterEach(async () => {
    if (previousWorkspaceRoot !== undefined) {
      process.env.MISSION_PROTOCOL_WORKSPACE_ROOT = previousWorkspaceRoot;
    } else {
      delete process.env.MISSION_PROTOCOL_WORKSPACE_ROOT;
    }
    if (previousWorkspaceAllowlist !== undefined) {
      process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST = previousWorkspaceAllowlist;
    } else {
      delete process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST;
    }
    previousWorkspaceRoot = undefined;
    previousWorkspaceAllowlist = undefined;

    if (tempDir && (await pathExists(tempDir))) {
      await removeDir(tempDir);
    }
  });

  describe('Parameter Validation', () => {
    it('should fail when missionFile is missing', async () => {
      const params: any = {
        templateName: 'test-template',
        author: 'test@example.com',
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('missionFile');
    });

    it('should fail when templateName is missing', async () => {
      const params: any = {
        missionFile: testMissionDir,
        author: 'test@example.com',
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('templateName');
    });

    it('should fail when author is missing', async () => {
      const params: any = {
        missionFile: testMissionDir,
        templateName: 'test-template',
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('author');
    });

    it('should fail when mission file does not exist', async () => {
      const missingPath = path.join(tempDir, 'missing-mission');
      const params: ExtractTemplateParams = {
        missionFile: missingPath,
        templateName: 'test-template',
        author: 'test@example.com',
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('does not exist');
    });

    it('should fail when templateName has invalid characters', async () => {
      await fs.writeFile(path.join(testMissionDir, 'test.js'), 'console.log("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'invalid template name!',
        author: 'test@example.com',
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('alphanumeric');
    });

    it('should fail when confidenceThreshold is out of range', async () => {
      await fs.writeFile(path.join(testMissionDir, 'test.js'), 'console.log("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test@example.com',
        confidenceThreshold: 1.5,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('0.0 and 1.0');
    });
  });

  describe('Template Extraction', () => {
    it('should extract a template from a directory', async () => {
      // Create a simple test mission
      await fs.writeFile(
        path.join(testMissionDir, 'app.js'),
        'const express = require("express");\nconst app = express();\napp.listen(3000);'
      );

      await fs.writeFile(
        path.join(testMissionDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-service',
            version: '1.0.0',
          },
          null,
          2
        )
      );

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'express-service',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);
      expect(result.template).toBeDefined();

      // Verify template was written to disk
      const templateDir = path.join(outputDir, 'express-service');
      expect(await pathExists(templateDir)).toBe(true);
      expect(await pathExists(path.join(templateDir, 'template-metadata.json'))).toBe(true);
      expect(await pathExists(path.join(templateDir, 'EXTRACTION_REPORT.md'))).toBe(true);
    });

    it('should extract template from a single file', async () => {
      const missionFile = path.join(testMissionDir, 'mission.yaml');
      await fs.writeFile(missionFile, 'name: test-mission\ntype: build\nstatus: complete');

      const params: ExtractTemplateParams = {
        missionFile,
        templateName: 'mission-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      // Template should be created from the parent directory
      const templateDir = path.join(outputDir, 'mission-template');
      expect(await pathExists(templateDir)).toBe(true);
    });

    it('should respect custom confidence threshold', async () => {
      await fs.writeFile(
        path.join(testMissionDir, 'config.yaml'),
        'name: test-app\nversion: 1.0.0'
      );

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test@example.com',
        outputDir,
        confidenceThreshold: 0.8,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);
      expect(result.template).toBeDefined();
    });

    it('should use default output directory when not specified', async () => {
      await fs.writeFile(path.join(testMissionDir, 'app.js'), 'console.log("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test@example.com',
      };

      const templatesRoot = path.join(tempDir, 'templates');
      const hadTemplatesDir = await pathExists(templatesRoot);

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      const defaultTemplateDir = path.join(templatesRoot, 'test-template');

      // Check that template was created in default location
      expect(await pathExists(defaultTemplateDir)).toBe(true);

      // Clean up the test artifact without disturbing pre-existing templates
      if (await pathExists(defaultTemplateDir)) {
        await removeDir(defaultTemplateDir, { recursive: true, force: true });
      }

      if (!hadTemplatesDir && (await pathExists(templatesRoot))) {
        await removeDir(templatesRoot, { recursive: true, force: true });
      }
    });
  });

  describe('Template Output', () => {
    it('should create template-metadata.json with correct structure', async () => {
      await fs.writeFile(
        path.join(testMissionDir, 'config.json'),
        JSON.stringify({ name: 'test-service', port: 8080 }, null, 2)
      );

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test-author@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      const metadataPath = path.join(outputDir, 'test-template', 'template-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

      expect(metadata.templateId).toBe('test-mission');
      expect(metadata.author).toBe('test-author@example.com');
      expect(metadata.parameters).toBeDefined();
      expect(metadata.creationDate).toBeDefined();
    });

    it('should create all template files', async () => {
      const srcDir = path.join(testMissionDir, 'src');
      await ensureDir(srcDir);

      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("main")');
      await fs.writeFile(path.join(testMissionDir, 'README.md'), '# Test Project');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'multi-file-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      const templateDir = path.join(outputDir, 'multi-file-template');
      expect(await pathExists(path.join(templateDir, 'src'))).toBe(true);
      expect(await pathExists(path.join(templateDir, 'README.md'))).toBe(true);
    });

    it('should create EXTRACTION_REPORT.md', async () => {
      await fs.writeFile(path.join(testMissionDir, 'app.py'), 'print("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      const reportPath = path.join(outputDir, 'test-template', 'EXTRACTION_REPORT.md');
      expect(await pathExists(reportPath)).toBe(true);

      const report = await fs.readFile(reportPath, 'utf-8');
      expect(report).toContain('# Template Extraction Report');
      expect(report).toContain('## Summary');
      expect(report).toContain('## Performance Metrics');
      expect(report).toContain('## Extracted Parameters');
      expect(report).toContain('## Next Steps');
    });

    it('should write hooks when present', async () => {
      const templateDir = path.join(outputDir, 'with-hooks');

      const result: any = {
        success: true,
        totalTime: 0,
        template: {
          fileStructure: [{ path: 'README.md', content: '# With Hooks' }],
          metadata: {
            templateId: 'with-hooks',
            templateVersion: '1.0.0',
            name: 'With Hooks',
            description: 'Test template with hooks',
            author: 'test@example.com',
            tags: [],
            parameters: {},
            creationDate: new Date().toISOString(),
            lastUpdatedDate: new Date().toISOString(),
            usageCount: 0,
            generatedSuccessRate: 0,
          },
          hooks: {
            preGenerate: '#!/usr/bin/env bash\necho pre',
            postGenerate: '#!/usr/bin/env bash\necho post',
          },
        },
      };

      await writeTemplate(templateDir, result);

      expect(await pathExists(path.join(templateDir, 'hooks', 'pre_gen_project.sh'))).toBe(true);
      expect(await pathExists(path.join(templateDir, 'hooks', 'post_gen_project.sh'))).toBe(true);
    });

    it('should throw when writing without a template', async () => {
      const templateDir = path.join(outputDir, 'no-template');
      const badResult: any = { success: true, totalTime: 0 };

      await expect(writeTemplate(templateDir, badResult)).rejects.toThrow('No template to write');
    });

    it('should generate a failure extraction report when template missing', () => {
      const report = generateExtractionReport({ success: false, totalTime: 0 });
      expect(report).toContain('Extraction failed');
    });

    it('should exclude node_modules and other common directories', async () => {
      const nodeModulesDir = path.join(testMissionDir, 'node_modules');
      await ensureDir(nodeModulesDir);
      await fs.writeFile(path.join(nodeModulesDir, 'package.json'), '{}');

      await fs.writeFile(path.join(testMissionDir, 'app.js'), 'console.log("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'test-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);

      const templateDir = path.join(outputDir, 'test-template');
      expect(await pathExists(path.join(templateDir, 'node_modules'))).toBe(false);
      expect(await pathExists(path.join(templateDir, 'app.js'))).toBe(true);
    });
  });

  describe('Security Guards', () => {
    it('should reject mission paths outside the workspace allowlist', async () => {
      const outsideDir = await ensureTempDir('extract-template-outside-');

      try {
        const params: ExtractTemplateParams = {
          missionFile: outsideDir,
          templateName: 'unauthorized',
          author: 'test@example.com',
        };

        const result = await extractTemplate(params);

        expect(result.success).toBe(false);
        expect(result.errors && result.errors[0]).toMatch(/allowed base directory|Path cannot|Path escapes/);
      } finally {
        await removeDir(outsideDir, { recursive: true, force: true });
      }
    });

    it('should reject output directories outside the workspace allowlist', async () => {
      await fs.writeFile(path.join(testMissionDir, 'app.js'), 'console.log("secure")');
      const outsideDir = await ensureTempDir('extract-template-outside-output-');

      try {
        const params: ExtractTemplateParams = {
          missionFile: testMissionDir,
          templateName: 'unsafe-output',
          author: 'test@example.com',
          outputDir: outsideDir,
        };

        const result = await extractTemplate(params);

        expect(result.success).toBe(false);
        expect(result.errors && result.errors[0]).toMatch(/allowed base directory|Path cannot|Path escapes/);
      } finally {
        await removeDir(outsideDir, { recursive: true, force: true });
      }
    });
  });

  describe('Performance', () => {
    it('should complete extraction quickly for small missions', async () => {
      await fs.writeFile(path.join(testMissionDir, 'app.js'), 'console.log("test")');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'quick-template',
        author: 'test@example.com',
        outputDir,
      };

      const startTime = Date.now();
      const result = await extractTemplate(params);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should report accurate timing metrics', async () => {
      await fs.writeFile(path.join(testMissionDir, 'config.yaml'), 'name: test\nversion: 1.0.0');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'timed-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.stage1?.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.stage2?.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should extract a Flask API template', async () => {
      await fs.writeFile(
        path.join(testMissionDir, 'app.py'),
        'from flask import Flask\n\napp = Flask("customer-api")\n\n@app.route("/health")\ndef health():\n    return "OK"\n\nif __name__ == "__main__":\n    app.run(port=8080)'
      );

      await fs.writeFile(
        path.join(testMissionDir, 'requirements.txt'),
        'flask==2.0.0\ngunicorn==20.1.0'
      );

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'flask-api',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);
      expect(result.template?.metadata.tags).toContain('python');

      const metadataPath = path.join(outputDir, 'flask-api', 'template-metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

      expect(Object.keys(metadata.parameters).length).toBeGreaterThan(0);
    });

    it('should extract a Node.js microservice template', async () => {
      await fs.writeFile(
        path.join(testMissionDir, 'package.json'),
        JSON.stringify(
          {
            name: 'order-service',
            version: '1.0.0',
            description: 'Order processing microservice',
            main: 'index.js',
            scripts: {
              start: 'node index.js',
            },
          },
          null,
          2
        )
      );

      await fs.writeFile(
        path.join(testMissionDir, 'index.js'),
        'const express = require("express");\nconst app = express();\n\napp.get("/health", (req, res) => res.send("OK"));\n\napp.listen(3000);'
      );

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'node-microservice',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      expect(result.success).toBe(true);
      expect(result.template?.metadata.tags).toContain('javascript');

      const reportPath = path.join(outputDir, 'node-microservice', 'EXTRACTION_REPORT.md');
      const report = await fs.readFile(reportPath, 'utf-8');

      expect(report).toContain('order-service');
    });
  });

  describe('Error Handling', () => {
    it('should handle empty directories gracefully', async () => {
      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'empty-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      // Should still succeed but with minimal output
      expect(result.success).toBe(true);
    });

    it('should handle file read errors gracefully', async () => {
      const badFile = path.join(testMissionDir, 'bad.json');
      await fs.writeFile(badFile, '{invalid json');

      const params: ExtractTemplateParams = {
        missionFile: testMissionDir,
        templateName: 'error-template',
        author: 'test@example.com',
        outputDir,
      };

      const result = await extractTemplate(params);

      // Should still succeed, just skip the bad file
      expect(result.success).toBe(true);
    });
  });
});
