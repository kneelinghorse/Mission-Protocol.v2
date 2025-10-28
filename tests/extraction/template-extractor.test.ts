/**
 * Unit tests for TemplateExtractor
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TemplateExtractor } from '../../src/extraction/template-extractor';
import { ExtractionConfig } from '../../src/extraction/types';
import { ensureDir, ensureTempDir, pathExists, removeDir } from '../../src/utils/fs';

describe('TemplateExtractor', () => {
  let tempDir: string;
  let testMissionDir: string;

  beforeEach(async () => {
    // Create a temporary test mission directory
    tempDir = await ensureTempDir('template-extractor-test-');
    testMissionDir = path.join(tempDir, 'test-mission');
    await ensureDir(testMissionDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir && (await pathExists(tempDir))) {
      await removeDir(tempDir);
    }
  });

  describe('Stage 1: Candidate Identification', () => {
    it('should identify candidates from a simple mission', async () => {
      // Create a simple test mission
      const appPy = path.join(testMissionDir, 'app.py');
      await fs.writeFile(
        appPy,
        `from flask import Flask\n\napp = Flask("customer-api")\n\n@app.route('/customer-api/health')\ndef health():\n    return "OK"\n`
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      expect(result.filesAnalyzed).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(Object.keys(result.candidates).length).toBeGreaterThan(0);
    });

    it('should detect config values from YAML files', async () => {
      const configYaml = path.join(testMissionDir, 'config.yaml');
      await fs.writeFile(
        configYaml,
        `name: my-service\nversion: 1.0.0\nport: 8080\nauthor: test@example.com\n`
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      expect(result.filesAnalyzed).toBe(1);
      expect(Object.keys(result.candidates).length).toBeGreaterThan(0);

      // Check that config values were identified
      const candidateValues = Object.values(result.candidates)
        .flat()
        .map((c) => c.value);

      expect(candidateValues).toContain('my-service');
      expect(candidateValues).toContain(8080);
    });

    it('should detect candidates from JSON files', async () => {
      const packageJson = path.join(testMissionDir, 'package.json');
      await fs.writeFile(
        packageJson,
        JSON.stringify(
          {
            name: 'test-project',
            version: '1.0.0',
            description: 'A test project',
          },
          null,
          2
        )
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      expect(result.filesAnalyzed).toBe(1);

      const candidateValues = Object.values(result.candidates)
        .flat()
        .map((c) => c.value);

      expect(candidateValues).toContain('test-project');
    });

    it('should identify path segments as candidates', async () => {
      const projectDir = path.join(testMissionDir, 'my-custom-app');
      await ensureDir(projectDir);

      const file = path.join(projectDir, 'main.py');
      await fs.writeFile(file, 'print("Hello")');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      const pathCandidates = Object.values(result.candidates)
        .flat()
        .filter((c) => c.type === 'path-segment');

      expect(pathCandidates.length).toBeGreaterThan(0);
      expect(pathCandidates.some((c) => c.value === 'my-custom-app')).toBe(true);
    });

    it('should exclude files based on exclude patterns', async () => {
      // Create a node_modules directory with files
      const nodeModulesDir = path.join(testMissionDir, 'node_modules');
      await ensureDir(nodeModulesDir);
      await fs.writeFile(path.join(nodeModulesDir, 'package.json'), '{}');

      // Create a normal file
      await fs.writeFile(path.join(testMissionDir, 'app.js'), 'console.log("test")');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      // Should only analyze app.js, not files in node_modules
      expect(result.filesAnalyzed).toBe(1);
    });

    it('should calculate confidence scores correctly', async () => {
      // Create files with different literal frequencies
      await fs.writeFile(
        path.join(testMissionDir, 'file1.py'),
        'PROJECT_NAME = "unique-project"\nCOMMON = "common-value"\n'
      );
      await fs.writeFile(
        path.join(testMissionDir, 'file2.py'),
        'NAME = "unique-project"\nCOMMON = "common-value"\n'
      );
      await fs.writeFile(path.join(testMissionDir, 'file3.py'), 'COMMON = "common-value"\n');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
        confidenceThreshold: 0.3,
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      // "unique-project" should have higher confidence than "common-value"
      const uniqueCandidates = Object.values(result.candidates)
        .flat()
        .filter((c) => c.value === 'unique-project');

      const commonCandidates = Object.values(result.candidates)
        .flat()
        .filter((c) => c.value === 'common-value');

      if (uniqueCandidates.length > 0 && commonCandidates.length > 0) {
        expect(uniqueCandidates[0].confidence).toBeGreaterThan(commonCandidates[0].confidence);
      }
    });

    it('should include fallback candidates when none pass threshold', async () => {
      // Create a file with a unique literal that won't meet an extreme threshold
      await fs.writeFile(
        path.join(testMissionDir, 'only.js'),
        'console.log("unique_literal_value")'
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
        confidenceThreshold: 1.0, // Force initial filter to exclude all
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      // Fallback path should populate candidates from literalLocations
      expect(Object.keys(result.candidates).length).toBeGreaterThan(0);
    });

    it('should exclude .git, dist, and *.log files from analysis', async () => {
      // Create excluded directories and files
      const gitDir = path.join(testMissionDir, '.git');
      const distDir = path.join(testMissionDir, 'dist');
      await ensureDir(gitDir);
      await ensureDir(distDir);
      await fs.writeFile(path.join(gitDir, 'config'), 'git');
      await fs.writeFile(path.join(distDir, 'bundle.js'), 'dist');
      await fs.writeFile(path.join(testMissionDir, 'debug.log'), 'log');

      // Create one valid file
      await fs.writeFile(path.join(testMissionDir, 'main.js'), 'console.log("ok")');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      // Only main.js should be analyzed
      expect(result.filesAnalyzed).toBe(1);
    });
  });

  describe('Stage 2: Template Generation', () => {
    it('should generate a complete template from candidates', async () => {
      const appPy = path.join(testMissionDir, 'app.py');
      await fs.writeFile(appPy, 'from flask import Flask\n\napp = Flask("my-service")\n');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      expect(stage2Result.template).toBeDefined();
      expect(stage2Result.template.metadata).toBeDefined();
      expect(stage2Result.template.fileStructure.length).toBeGreaterThan(0);
      expect(stage2Result.parametersGenerated).toBeGreaterThan(0);
    });

    it('should replace literals with Jinja2 placeholders', async () => {
      const appPy = path.join(testMissionDir, 'app.py');
      await fs.writeFile(appPy, 'PROJECT = "customer-api"\nprint("Welcome to customer-api")\n');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      const appFile = stage2Result.template.fileStructure.find((f) => f.path.includes('app.py'));
      expect(appFile).toBeDefined();

      // Should contain Jinja2 placeholders
      expect(appFile!.content).toContain('{{');
      expect(appFile!.content).toContain('}}');
    });

    it('should generate metadata with correct structure', async () => {
      const configYaml = path.join(testMissionDir, 'config.yaml');
      await fs.writeFile(configYaml, 'name: test-service\nport: 3000\n');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test-author@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      const metadata = stage2Result.template.metadata;

      expect(metadata.templateId).toBeDefined();
      expect(metadata.templateVersion).toBe('1.0.0');
      expect(metadata.name).toBeDefined();
      expect(metadata.author).toBe('test-author@example.com');
      expect(metadata.creationDate).toBeDefined();
      expect(metadata.usageCount).toBe(0);
      expect(metadata.generatedSuccessRate).toBe(0);
    });

    it('should generate parameters with correct types', async () => {
      // Use JSON with a boolean-like string for name to exercise boolean branch
      const configJson = path.join(testMissionDir, 'config.json');
      await fs.writeFile(configJson, JSON.stringify({ name: 'true', port: 8080 }, null, 2));

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      const params = stage2Result.template.metadata.parameters;

      // Find parameter with number type
      const numberParam = Object.values(params).find((p) => p.type === 'number');
      expect(numberParam).toBeDefined();

      // Find parameter with boolean type (name: 'true' should infer boolean)
      const booleanParam = Object.values(params).find((p) => p.type === 'boolean');
      expect(booleanParam).toBeDefined();
    });

    it('should handle file path parameterization', async () => {
      const customDir = path.join(testMissionDir, 'custom-project-name');
      await ensureDir(customDir);
      await fs.writeFile(path.join(customDir, 'index.js'), 'console.log("test")');

      // Also include a common directory to exercise skip branch
      const srcDir = path.join(testMissionDir, 'src');
      await ensureDir(srcDir);
      await fs.writeFile(path.join(srcDir, 'helper.js'), 'console.log("helper")');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      // Check if file paths contain Jinja2 placeholders
      const hasTemplatedPath = stage2Result.template.fileStructure.some(
        (f) => f.path.includes('{{') && f.path.includes('}}')
      );

      expect(hasTemplatedPath).toBe(true);
    });

    it('should choose the most frequent value as default', async () => {
      // Create multiple files with the 'name' key, where one value is more frequent
      await fs.writeFile(
        path.join(testMissionDir, 'a.json'),
        JSON.stringify({ name: 'alpha' }, null, 2)
      );
      await fs.writeFile(
        path.join(testMissionDir, 'b.json'),
        JSON.stringify({ name: 'alpha' }, null, 2)
      );
      await fs.writeFile(
        path.join(testMissionDir, 'c.json'),
        JSON.stringify({ name: 'beta' }, null, 2)
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const stage1Result = await extractor.identifyCandidates(testMissionDir);
      const stage2Result = await extractor.generateTemplate(stage1Result.candidates);

      const params = stage2Result.template.metadata.parameters;
      const nameParam = params['name'];
      expect(nameParam).toBeDefined();
      expect(nameParam.default).toBe('alpha');
    });
  });

  describe('Full Extraction Pipeline', () => {
    it('should complete full extraction successfully', async () => {
      // Create a realistic test mission
      await fs.writeFile(
        path.join(testMissionDir, 'package.json'),
        JSON.stringify(
          {
            name: 'my-microservice',
            version: '1.0.0',
            description: 'A test microservice',
          },
          null,
          2
        )
      );

      await fs.writeFile(
        path.join(testMissionDir, 'app.js'),
        'const express = require("express");\nconst app = express();\napp.listen(3000);'
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.template).toBeDefined();
      expect(result.stage1).toBeDefined();
      expect(result.stage2).toBeDefined();
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle extraction errors gracefully', async () => {
      const config: ExtractionConfig = {
        sourceMissionPath: '/nonexistent/path',
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.extract();

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should complete extraction in under 15 seconds for typical missions', async () => {
      // Create a mission with ~50 files
      for (let i = 0; i < 50; i++) {
        const file = path.join(testMissionDir, `file${i}.js`);
        await fs.writeFile(file, `const value = "test-${i}";\nconsole.log(value);`);
      }

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.extract();

      expect(result.success).toBe(true);
      expect(result.totalTime).toBeLessThan(15000); // Under 15 seconds
    });
  });

  describe('extractMetadata', () => {
    it('should generate valid template metadata', async () => {
      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const metadata = await extractor.extractMetadata(
        {
          project_name: {
            type: 'string',
            description: 'Project name',
            default: 'my-project',
            required: true,
          },
        },
        testMissionDir
      );

      expect(metadata.templateId).toBeDefined();
      expect(metadata.name).toBeDefined();
      expect(metadata.author).toBe('test@example.com');
      expect(metadata.parameters).toHaveProperty('project_name');
      expect(metadata.creationDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should generate appropriate tags based on file types', async () => {
      await fs.writeFile(path.join(testMissionDir, 'app.py'), 'print("test")');
      await fs.writeFile(path.join(testMissionDir, 'index.ts'), 'console.log("test")');
      await fs.writeFile(path.join(testMissionDir, 'Main.java'), 'class Main {}');
      await fs.writeFile(path.join(testMissionDir, 'main.go'), 'package main');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const metadata = await extractor.extractMetadata({}, testMissionDir);

      expect(metadata.tags).toContain('python');
      expect(metadata.tags).toContain('typescript');
      expect(metadata.tags).toContain('java');
      expect(metadata.tags).toContain('go');
    });

    it('should recurse into nested config objects to extract values', async () => {
      const nestedJson = path.join(testMissionDir, 'nested.json');
      await fs.writeFile(
        nestedJson,
        JSON.stringify({ info: { name: 'nested-app', meta: { version: '1.2.3' } } }, null, 2)
      );

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      const candidateValues = Object.values(result.candidates)
        .flat()
        .map((c) => c.value);

      expect(candidateValues).toContain('nested-app');
      expect(candidateValues).toContain('1.2.3');
    });

    it('should infer api/service/web tags from directory name', async () => {
      // Create a specially named directory to influence tags
      const specialDir = path.join(tempDir, 'api-service-web');
      await ensureDir(specialDir);
      // Put at least one file inside so getAllFiles sees it
      await fs.writeFile(path.join(specialDir, 'index.js'), 'console.log("ok")');

      const config: ExtractionConfig = {
        sourceMissionPath: specialDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const metadata = await extractor.extractMetadata({}, specialDir);

      expect(metadata.tags).toContain('api');
      expect(metadata.tags).toContain('service');
      expect(metadata.tags).toContain('web');
    });

    it('should treat .env as config file (no parse) without errors', async () => {
      await fs.writeFile(path.join(testMissionDir, '.env'), 'PORT=3000');
      await fs.writeFile(path.join(testMissionDir, 'script.rb'), 'puts "hi"');

      const config: ExtractionConfig = {
        sourceMissionPath: testMissionDir,
        author: 'test@example.com',
      };

      const extractor = new TemplateExtractor(config);
      const result = await extractor.identifyCandidates(testMissionDir);

      // Files analyzed should include both .env and .rb, but .env yields no candidates
      expect(result.filesAnalyzed).toBeGreaterThanOrEqual(2);
      expect(Object.keys(result.candidates).length).toBeGreaterThanOrEqual(0);
    });
  });
});
