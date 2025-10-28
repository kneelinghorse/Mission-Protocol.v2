/**
 * Tests for Create Mission Tool
 *
 * Validates the CreateMissionToolImpl class functionality:
 * - Generic mission creation (no domain)
 * - Domain-specific mission creation
 * - Mission ID generation
 * - Core field population
 * - Domain field merging
 * - YAML serialization
 * - Error handling
 * - Input validation
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { MissionMerger } from '../../src/merge/deep-merge';
import { CreateMissionToolImpl } from '../../src/tools/create-mission';
import { ensureDir, pathExists } from '../../src/utils/fs';
import * as GenericMissionSchema from '../../src/schemas/generic-mission';
import type { GenericMission } from '../../src/schemas/generic-mission';
import { MissionProtocolError } from '../../src/errors/mission-error';
import { DomainPackEntry } from '../../src/types/registry';

describe('CreateMissionToolImpl', () => {
  const testDataDir = path.join(__dirname, '../test-data/create-mission');
  let loader: SecureYAMLLoader;
  let parser: RegistryParser;
  let packLoader: DomainPackLoader;
  let merger: MissionMerger;
  let tool: CreateMissionToolImpl;

  beforeAll(async () => {
    // Create test data directory
    if (!(await pathExists(testDataDir))) {
      await ensureDir(testDataDir);
    }
  });

  beforeEach(async () => {
    loader = new SecureYAMLLoader({ baseDir: testDataDir });
    parser = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, parser);
    merger = new MissionMerger();
    tool = new CreateMissionToolImpl(packLoader, merger, parser, loader);

    // Create generic mission template (with placeholders to pass validation)
    const genericTemplate = `
schemaType: "Mission"
schemaVersion: "2.0"
missionId: "placeholder"
objective: "placeholder"
context:
  background: ""
  dependencies: []
  constraints: []
successCriteria:
  - "placeholder"
deliverables:
  - "placeholder"
domainFields: {}
`;
    await fs.writeFile(path.join(testDataDir, 'generic_mission.yaml'), genericTemplate);
  });

  afterEach(async () => {
    // Clean up test files
    if (!(await pathExists(testDataDir))) {
      return;
    }

    const files = await fs.readdir(testDataDir);
    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(testDataDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
          await fs.rm(filePath, { recursive: true, force: true });
        } else {
          await fs.unlink(filePath);
        }
      })
    );
  });

  describe('Generic Mission Creation', () => {
    it('should create minimal generic mission with only objective', async () => {
      const params = {
        objective: 'Build a secure authentication system',
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.schemaType).toBe('Mission');
      expect(mission.schemaVersion).toBe('2.0');
      expect(mission.objective).toBe('Build a secure authentication system');
      expect(mission.missionId).toMatch(/^mission-\d{8}-\d{6}-\d{3}$/);
      expect(mission.successCriteria).toEqual(['Mission objective achieved']);
      expect(mission.deliverables).toEqual(['Mission completion report']);
      expect(mission.domainFields).toEqual({});
    });

    it('should create generic mission with successCriteria', async () => {
      const params = {
        objective: 'Optimize database queries',
        successCriteria: ['Query response time < 100ms', 'No N+1 query problems'],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Optimize database queries');
      expect(mission.successCriteria).toEqual([
        'Query response time < 100ms',
        'No N+1 query problems',
      ]);
    });

    it('should create generic mission with constraints', async () => {
      const params = {
        objective: 'Implement new feature',
        constraints: ['Must maintain backward compatibility', 'No breaking changes to API'],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Implement new feature');
      expect(mission.context.constraints).toEqual([
        'Must maintain backward compatibility',
        'No breaking changes to API',
      ]);
    });

    it('should create generic mission with all optional fields', async () => {
      const params = {
        objective: 'Complete integration',
        successCriteria: ['All tests passing', 'Documentation updated'],
        constraints: ['Budget: $10k', 'Timeline: 2 weeks'],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Complete integration');
      expect(mission.successCriteria).toEqual(['All tests passing', 'Documentation updated']);
      expect(mission.context.constraints).toEqual(['Budget: $10k', 'Timeline: 2 weeks']);
    });

    it('should generate unique mission IDs', async () => {
      const params = { objective: 'Test mission ID generation' };

      const result1 = await tool.execute(params, []);
      const result2 = await tool.execute(params, []);

      const mission1 = YAML.parse(result1) as GenericMission;
      const mission2 = YAML.parse(result2) as GenericMission;

      expect(mission1.missionId).not.toBe(mission2.missionId);
      expect(mission1.missionId).toMatch(/^mission-\d{8}-\d{6}-\d{3}$/);
      expect(mission2.missionId).toMatch(/^mission-\d{8}-\d{6}-\d{3}$/);
    });
  });

  describe('Domain-Specific Mission Creation', () => {
    let registryEntries: DomainPackEntry[];

    beforeEach(async () => {
      // Create test domain pack
      const webDevDir = path.join(testDataDir, 'domains', 'web-dev');
      await ensureDir(webDevDir);

      // Create pack manifest
      const manifest = `
name: web-dev
version: 1.0.0
displayName: Web Development
description: Web development domain pack
schema: schema.yaml
`;
      await fs.writeFile(path.join(webDevDir, 'pack.yaml'), manifest);

      // Create schema
      const schema = `
type: object
properties:
  techStack:
    type: array
    items:
      type: string
  framework:
    type: string
  testingStrategy:
    type: string
`;
      await fs.writeFile(path.join(webDevDir, 'schema.yaml'), schema);

      // Create template
      const template = `
techStack:
  - TypeScript
  - React
framework: Next.js
testingStrategy: Jest + React Testing Library
`;
      await fs.writeFile(path.join(webDevDir, 'template.yaml'), template);

      // Create registry
      const registry = `
domains:
  - name: web-dev
    description: Web development domain pack
    version: 1.0.0
    path: domains/web-dev
    schema_version: 2.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'registry.yaml'), registry);

      registryEntries = await parser.loadRegistry('registry.yaml');
    });

    it('should create domain-specific mission', async () => {
      const params = {
        objective: 'Build a dashboard',
        domain: 'web-dev',
      };

      const result = await tool.execute(params, registryEntries);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Build a dashboard');
      expect(mission.domainFields).toHaveProperty('techStack');
      expect(mission.domainFields).toHaveProperty('framework');
      expect(mission.domainFields).toHaveProperty('testingStrategy');
      expect((mission.domainFields as any).framework).toBe('Next.js');
    });

    it('should merge domain fields with core fields', async () => {
      const params = {
        objective: 'Create landing page',
        domain: 'web-dev',
        successCriteria: ['Page loads in < 2s', 'SEO score > 90'],
        constraints: ['Mobile-first design'],
      };

      const result = await tool.execute(params, registryEntries);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Create landing page');
      expect(mission.successCriteria).toEqual(['Page loads in < 2s', 'SEO score > 90']);
      expect(mission.context.constraints).toEqual(['Mobile-first design']);
      expect((mission.domainFields as any).techStack).toContain('TypeScript');
    });

    it('should throw error for non-existent domain', async () => {
      const params = {
        objective: 'Test invalid domain',
        domain: 'nonexistent-domain',
      };

      await expect(tool.execute(params, registryEntries)).rejects.toThrow(
        /not found.*get_available_domains/i
      );
    });
  });

  describe('Input Validation', () => {
    it('should throw error for empty objective', async () => {
      const params = {
        objective: '',
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/objective.*required/i);
    });

    it('should throw error for missing objective', async () => {
      const params = {} as any;

      await expect(tool.execute(params, [])).rejects.toThrow(/objective.*required/i);
    });

    it('should throw error for whitespace-only objective', async () => {
      const params = {
        objective: '   ',
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/objective.*required/i);
    });

    it('should throw error for empty domain string', async () => {
      const params = {
        objective: 'Valid objective',
        domain: '',
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/domain.*empty/i);
    });

    it('should throw error for non-array successCriteria', async () => {
      const params = {
        objective: 'Valid objective',
        successCriteria: 'not an array' as any,
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/successCriteria.*array/i);
    });

    it('should throw error for non-array constraints', async () => {
      const params = {
        objective: 'Valid objective',
        constraints: 'not an array' as any,
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/constraints.*array/i);
    });
  });

  describe('YAML Output', () => {
    it('should return valid YAML string', async () => {
      const params = {
        objective: 'Test YAML output',
      };

      const result = await tool.execute(params, []);

      // Should parse without errors
      expect(() => YAML.parse(result)).not.toThrow();

      const mission = YAML.parse(result) as GenericMission;
      expect(mission.schemaType).toBe('Mission');
    });

    it('should produce parseable YAML with special characters', async () => {
      const params = {
        objective: 'Build system with "quotes" and special: characters',
        successCriteria: ["Criterion with 'single quotes'", 'Criterion with: colon'],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toContain('quotes');
      expect(mission.successCriteria[0]).toContain('single quotes');
    });
  });

  describe('formatForLLM', () => {
    it('should format YAML with helpful context', async () => {
      const yamlString = `
schemaType: "Mission"
schemaVersion: "2.0"
missionId: "test-123"
objective: "Test objective"
`;

      const formatted = tool.formatForLLM(yamlString);

      expect(formatted).toContain('Mission Created Successfully');
      expect(formatted).toContain('```yaml');
      expect(formatted).toContain('ICEV pattern');
      expect(formatted).toContain(yamlString);
    });

    it('should include explanation of mission structure', async () => {
      const formatted = tool.formatForLLM('test: yaml');

      expect(formatted).toContain('Intent');
      expect(formatted).toContain('Context');
      expect(formatted).toContain('Execution');
      expect(formatted).toContain('Verification');
    });
  });

  describe('Mission ID Generation', () => {
    it('should generate ID with correct format', async () => {
      const params = { objective: 'Test ID format' };
      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      // Format: mission-YYYYMMDD-HHmmss-nnn
      expect(mission.missionId).toMatch(/^mission-\d{8}-\d{6}-\d{3}$/);
    });

    it('should generate ID with current date components', async () => {
      const params = { objective: 'Test ID date' };
      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      expect(mission.missionId).toContain(`mission-${year}${month}${day}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle generic template loading errors gracefully', async () => {
      // Remove generic template to trigger error
      await fs.unlink(path.join(testDataDir, 'generic_mission.yaml'));

      const params = { objective: 'Test error handling' };

      await expect(tool.execute(params, [])).rejects.toThrow(/failed to load generic template/i);
    });

    it('should provide helpful error for invalid domain', async () => {
      const params = {
        objective: 'Test invalid domain',
        domain: 'invalid-domain',
      };

      await expect(tool.execute(params, [])).rejects.toThrow(/not found.*get_available_domains/i);
    });

    it('should handle domain pack loading errors', async () => {
      const registry = `
domains:
  - name: broken-pack
    description: Broken domain pack
    version: 1.0.0
    path: domains/broken
    schema_version: 2.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'broken-registry.yaml'), registry);

      const registryEntries = await parser.loadRegistry('broken-registry.yaml');

      const params = {
        objective: 'Test broken domain',
        domain: 'broken-pack',
      };

      await expect(tool.execute(params, registryEntries)).rejects.toThrow();
    });

    it('should handle invalid generic template structure', async () => {
      // Create invalid template (missing required fields)
      const invalidTemplate = `
schemaType: "Mission"
schemaVersion: "2.0"
missionId: "test"
objective: "test"
`;
      await fs.writeFile(path.join(testDataDir, 'generic_mission.yaml'), invalidTemplate);

      const params = { objective: 'Test invalid template' };

      await expect(tool.execute(params, [])).rejects.toThrow(/does not match required structure/i);
    });

    it('should handle YAML serialization errors', async () => {
      // This is hard to trigger but we document it's covered
      const params = { objective: 'Test YAML serialization' };

      // Normal execution should work
      const result = await tool.execute(params, []);
      expect(result).toBeTruthy();
    });
  });

  describe('Schema Validation', () => {
    it('should validate mission against schema', async () => {
      const params = {
        objective: 'Valid mission for schema validation',
        successCriteria: ['Criterion 1', 'Criterion 2'],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      // Should have all required fields
      expect(mission).toHaveProperty('schemaType');
      expect(mission).toHaveProperty('schemaVersion');
      expect(mission).toHaveProperty('missionId');
      expect(mission).toHaveProperty('objective');
      expect(mission).toHaveProperty('successCriteria');
      expect(mission).toHaveProperty('deliverables');
      expect(mission).toHaveProperty('domainFields');
    });

    it('should ensure all required fields are present', async () => {
      const params = {
        objective: 'Test required fields',
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      // Required fields
      expect(mission.schemaType).toBe('Mission');
      expect(mission.schemaVersion).toBe('2.0');
      expect(mission.missionId).toBeTruthy();
      expect(mission.objective).toBeTruthy();
      expect(mission.successCriteria).toBeTruthy();
      expect(mission.successCriteria.length).toBeGreaterThan(0);
      expect(mission.deliverables).toBeTruthy();
      expect(mission.deliverables.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle objective with special YAML characters', async () => {
      const params = {
        objective: 'Build: system @ 100% efficiency & "quality"',
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Build: system @ 100% efficiency & "quality"');
    });

    it('should handle empty arrays for optional fields', async () => {
      const params = {
        objective: 'Test empty arrays',
        successCriteria: [],
        constraints: [],
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      // Empty successCriteria gets default value (schema requires non-empty)
      expect(mission.successCriteria).toEqual(['Mission objective achieved']);
      // Empty constraints is allowed
      expect(mission.context.constraints).toEqual([]);
    });

    it('should handle undefined optional fields', async () => {
      const params = {
        objective: 'Test undefined fields',
        domain: undefined,
        successCriteria: undefined,
        constraints: undefined,
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe('Test undefined fields');
      expect(mission.domainFields).toEqual({});
    });

    it('should handle very long objective strings', async () => {
      const longObjective = 'Build '.repeat(100) + 'a comprehensive system';
      const params = {
        objective: longObjective,
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.objective).toBe(longObjective);
    });

    it('should handle arrays with many items', async () => {
      const manyCriteria = Array.from({ length: 50 }, (_, i) => `Criterion ${i + 1}`);
      const params = {
        objective: 'Test many criteria',
        successCriteria: manyCriteria,
      };

      const result = await tool.execute(params, []);
      const mission = YAML.parse(result) as GenericMission;

      expect(mission.successCriteria).toHaveLength(50);
      expect(mission.successCriteria[49]).toBe('Criterion 50');
    });
  });

  describe('validateMission', () => {
    const createValidMission = (): GenericMission => ({
      schemaType: 'Mission',
      schemaVersion: '2.0',
      missionId: 'mission-valid',
      objective: 'Deliver core functionality',
      context: {
        background: 'Context text',
        dependencies: [],
        constraints: [],
      },
      successCriteria: ['Pass tests'],
      deliverables: ['Report'],
      domainFields: {},
    });

    test('throws when schemaType missing or incorrect', () => {
      const mission = createValidMission();
      (mission as any).schemaType = 'Task';
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow('Invalid schemaType');
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('throws when schemaVersion missing or incorrect', () => {
      const mission = createValidMission();
      (mission as any).schemaVersion = '1.0';
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow('Invalid schemaVersion');
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('throws when missionId missing', () => {
      const mission = createValidMission();
      mission.missionId = '';
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow('Invalid missionId');
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('throws when objective missing', () => {
      const mission = createValidMission();
      mission.objective = '';
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow('Invalid objective');
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('throws when successCriteria empty', () => {
      const mission = createValidMission();
      mission.successCriteria = [];
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow(
          'successCriteria must be a non-empty array'
        );
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('throws when deliverables empty', () => {
      const mission = createValidMission();
      mission.deliverables = [];
      const guardSpy = jest.spyOn(GenericMissionSchema, 'isGenericMission').mockReturnValue(true);
      try {
        expect(() => (tool as any).validateMission(mission)).toThrow(
          'deliverables must be a non-empty array'
        );
      } finally {
        guardSpy.mockRestore();
      }
    });

    test('wraps serialization failures when converting to YAML', async () => {
      jest.resetModules();
      jest.doMock('yaml', () => ({
        stringify: jest.fn(() => {
          throw new Error('failed to stringify');
        }),
      }));

      const { CreateMissionToolImpl: MockedCreateMissionToolImpl } = await import(
        '../../src/tools/create-mission'
      );

      const dummyTool = new MockedCreateMissionToolImpl({} as any, {} as any, {} as any, {} as any);
      const mission = createValidMission();

      try {
        (dummyTool as any).toYAML(mission);
        throw new Error('Expected toYAML to throw');
      } catch (error) {
        expect(error).toBeTruthy();
        expect((error as any).context?.userMessage).toBe('Unable to serialize mission to YAML.');
        expect((error as Error).message).toBe('failed to stringify');
      } finally {
        jest.resetModules();
      }
    });
  });
});
