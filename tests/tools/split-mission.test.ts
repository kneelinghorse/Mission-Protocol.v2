/**
 * Split Mission Tool Integration Tests
 *
 * End-to-end tests for the split_mission MCP tool
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { SplitMissionToolImpl, SplitMissionParams } from '../../src/tools/split-mission';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { ITokenCounter, TokenCount, SupportedModel } from '../../src/intelligence/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as YAML from 'yaml';

/**
 * Mock token counter
 */
class MockTokenCounter implements ITokenCounter {
  async count(text: string, model: SupportedModel): Promise<TokenCount> {
    return {
      model,
      count: Math.ceil(text.length * 0.25),
      estimatedCost: 0,
    };
  }
}

describe('SplitMissionTool Integration', () => {
  let tool: SplitMissionToolImpl;
  let loader: SecureYAMLLoader;
  let mockTokenCounter: MockTokenCounter;
  let tempDir: string;
  let testMissionPath: string;

  beforeEach(async () => {
    loader = new SecureYAMLLoader({ baseDir: path.join(__dirname, '../../templates') });
    mockTokenCounter = new MockTokenCounter();
    tool = new SplitMissionToolImpl(loader, mockTokenCounter, 'claude');

    // Create temp directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'split-mission-test-'));
    testMissionPath = path.join(tempDir, 'test-mission.yaml');
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('execute', () => {
    test('should split complex mission and create sub-mission files', async () => {
      const complexMission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-001',
        objective: 'Build complete full-stack application with authentication, database, API, and frontend',
        context: {
          background: 'Create a comprehensive web application',
          dependencies: ['PostgreSQL', 'Node.js', 'React'],
          constraints: ['Must use TypeScript', 'Must have >90% test coverage'],
        },
        successCriteria: [
          'Database schema created and migrated',
          'Authentication system working',
          'API endpoints implemented and tested',
          'Frontend deployed and responsive',
          'Integration tests passing',
          'Documentation complete',
          'CI/CD pipeline operational',
          'Monitoring configured',
          'Security audit passed',
          'Performance benchmarks met',
        ],
        deliverables: [
          'Database migrations',
          'Auth service code',
          'API implementation',
          'Frontend application',
          'Test suite',
          'Documentation',
          'Deployment scripts',
          'Monitoring config',
        ],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(complexMission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        model: 'claude',
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      expect(result.shouldSplit).toBe(true);
      expect(result.complexity.score).toBeGreaterThan(3);
      expect(result.subMissionFiles).toBeDefined();
      expect(result.subMissionFiles!.length).toBeGreaterThan(1);
      expect(result.executionPlan).toBeDefined();

      // Verify files were actually created
      for (const filePath of result.subMissionFiles!) {
        const fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        expect(fileExists).toBe(true);
      }
    });

    test('should not split simple mission', async () => {
      const simpleMission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-002',
        objective: 'Create a simple test file',
        context: {},
        successCriteria: ['File created'],
        deliverables: ['test.txt'],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(simpleMission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        model: 'claude',
      };

      const result = await tool.execute(params);

      expect(result.shouldSplit).toBe(false);
      expect(result.subMissionFiles).toBeUndefined();
    });

    test('should create valid YAML sub-mission files', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-003',
        objective: 'Multi-phase project requiring split',
        context: {
          background: 'Complex project with multiple phases',
        },
        successCriteria: [
          'Phase 1: Design complete',
          'Phase 2: Implementation done',
          'Phase 3: Testing finished',
          'Phase 4: Deployment successful',
          'Phase 5: Monitoring active',
        ],
        deliverables: [
          'Design documents',
          'Source code',
          'Test reports',
          'Deployment guide',
          'Monitoring dashboard',
        ],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      if (result.shouldSplit && result.subMissionFiles) {
        // Read and parse each sub-mission file
        for (const filePath of result.subMissionFiles) {
          const content = await fs.readFile(filePath, 'utf-8');
          const parsed = YAML.parse(content);

          // Verify it's a valid mission
          expect(parsed.schemaType).toBe('Mission');
          expect(parsed.schemaVersion).toBe('2.0');
          expect(parsed.missionId).toBeDefined();
          expect(parsed.objective).toBeDefined();
          expect(Array.isArray(parsed.successCriteria)).toBe(true);
          expect(Array.isArray(parsed.deliverables)).toBe(true);
        }
      }
    });

    test('should create execution plan with correct dependencies', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-004',
        objective: 'Sequential workflow mission',
        context: {},
        successCriteria: [
          'Step 1: Setup environment',
          'Step 2: Build application',
          'Step 3: Run tests',
          'Step 4: Deploy',
        ],
        deliverables: ['App code', 'Test results', 'Deployment'],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      if (result.executionPlan) {
        // Verify execution plan has correct structure
        expect(result.executionPlan.length).toBeGreaterThan(0);

        for (const step of result.executionPlan) {
          expect(step.order).toBeDefined();
          expect(step.file).toBeDefined();
          expect(step.objective).toBeDefined();
          expect(Array.isArray(step.dependencies)).toBe(true);
        }

        // First step should have no dependencies
        expect(result.executionPlan[0].dependencies.length).toBe(0);

        // Later steps should have dependencies
        if (result.executionPlan.length > 1) {
          const hasDependencies = result.executionPlan
            .slice(1)
            .some(step => step.dependencies.length > 0);
          expect(hasDependencies).toBe(true);
        }
      }
    });

    test('should respect maxSubMissions parameter', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-005',
        objective: 'Large mission with many steps',
        context: {},
        successCriteria: Array(20).fill('Criterion'),
        deliverables: Array(20).fill('Deliverable'),
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        maxSubMissions: 3,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      if (result.shouldSplit && result.subMissionFiles) {
        expect(result.subMissionFiles.length).toBeLessThanOrEqual(3);
      }
    });

    test('should generate meaningful summary', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-006',
        objective: 'Test summary generation',
        context: {},
        successCriteria: ['A', 'B', 'C'],
        deliverables: ['X', 'Y', 'Z'],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
      };

      const result = await tool.execute(params);

      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.summary.toLowerCase()).toContain('complexity');
    });

    test('should handle text mission format', async () => {
      const textMission = `
        Mission: Create a web application

        Objective: Build a modern web app

        Steps:
        1. Setup development environment
        2. Create project structure
        3. Implement core features
        4. Write tests
        5. Deploy to production

        Deliverables:
        - Application code
        - Test suite
        - Documentation
      `;

      await fs.writeFile(testMissionPath, textMission, 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      expect(result).toBeDefined();
      expect(result.complexity).toBeDefined();
    });
  });

  describe('validation', () => {
    test('should reject empty missionFile parameter', async () => {
      const params: SplitMissionParams = {
        missionFile: '',
      } as any;

      await expect(tool.execute(params)).rejects.toThrow('missionFile is required');
    });

    test('should reject non-existent file', async () => {
      const params: SplitMissionParams = {
        missionFile: '/non/existent/file.yaml',
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });

    test('should reject invalid maxSubMissions', async () => {
      await fs.writeFile(testMissionPath, 'objective: test', 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        maxSubMissions: 1,
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });

    test('should reject non-existent output directory', async () => {
      await fs.writeFile(testMissionPath, 'objective: test', 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: '/non/existent/directory',
      };

      await expect(tool.execute(params)).rejects.toThrow();
    });
  });

  describe('loader edge cases', () => {
    test('should handle YAML that is not a GenericMission by treating content as text', async () => {
      const rawYaml = 'foo: bar\nanswer: 42';
      await fs.writeFile(testMissionPath, rawYaml, 'utf-8');

      const result = await tool.execute({ missionFile: testMissionPath });

      expect(result).toBeDefined();
      expect(result.complexity).toBeDefined();
    });
  });

  describe('file naming', () => {
    test('should create sub-mission files with sequential numbering', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-007',
        objective: 'Test file naming',
        context: {},
        successCriteria: ['A', 'B', 'C', 'D'],
        deliverables: ['W', 'X', 'Y', 'Z'],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);

      if (result.shouldSplit && result.subMissionFiles) {
        // Check that files follow naming pattern: baseName_sub1.yaml, baseName_sub2.yaml, etc.
        for (let i = 0; i < result.subMissionFiles.length; i++) {
          const fileName = path.basename(result.subMissionFiles[i]);
          expect(fileName).toMatch(/test-mission_sub\d+\.yaml/);
        }
      }
    });
  });

  describe('formatForLLM', () => {
    test('should format split result for LLM', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-008',
        objective: 'Test LLM formatting',
        context: {},
        successCriteria: ['A', 'B', 'C'],
        deliverables: ['X', 'Y', 'Z'],
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const result = await tool.execute(params);
      const formatted = tool.formatForLLM(result);

      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);

      if (result.shouldSplit) {
        expect(formatted).toContain('Split');
        expect(formatted).toContain('Files Created');
      } else {
        expect(formatted).toContain('Analysis Complete');
      }
    });

    test('should format no-split result for LLM explicitly', async () => {
      const formatted = tool.formatForLLM({
        shouldSplit: false,
        complexity: { score: 3.2, reasons: ['Within limits'] },
        summary: 'Mission complexity score: 3.20/10. No split needed.',
      } as any);

      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('Mission Analysis Complete');
      expect(formatted).toContain('No split needed');
    });
  });

  describe('performance', () => {
    test('should complete split in reasonable time', async () => {
      const mission = {
        schemaType: 'Mission',
        schemaVersion: '2.0',
        missionId: 'integration-test-009',
        objective: 'Performance test',
        context: {
          background: 'Testing performance',
        },
        successCriteria: Array(15).fill('Criterion'),
        deliverables: Array(15).fill('Deliverable'),
        domainFields: {},
      };

      await fs.writeFile(testMissionPath, YAML.stringify(mission), 'utf-8');

      const params: SplitMissionParams = {
        missionFile: testMissionPath,
        outputDir: tempDir,
      };

      const startTime = Date.now();
      await tool.execute(params);
      const endTime = Date.now();

      const duration = endTime - startTime;
      expect(duration).toBeLessThan(5000); // Less than 5 seconds
    });
  });
});
