/**
 * Phase 2 End-to-End Integration Tests
 *
 * Validates complete flow from domain pack loading through mission creation.
 * Tests the full stack: registry, loaders, merging, validation, and tool execution.
 *
 * @module tests/integration/phase2-flow
 */

import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { MissionMerger } from '../../src/merge/deep-merge';
import { CreateMissionToolImpl } from '../../src/tools/create-mission';
import { GenericMission, isGenericMission } from '../../src/schemas/generic-mission';
import { DomainPackEntry } from '../../src/types/registry';
import { ensureDir, ensureTempDir, pathExists, removeDir } from '../../src/utils/fs';
import { resolveTemplatesDir } from '../utils/template-path';
import * as path from 'path';

describe('Phase 2 End-to-End Integration Tests', () => {
  let templatesDir: string;
  let loader: SecureYAMLLoader;

  beforeAll(async () => {
    templatesDir = await resolveTemplatesDir();
  });
  let registry: RegistryParser;
  let packLoader: DomainPackLoader;
  let merger: MissionMerger;
  let createMissionTool: CreateMissionToolImpl;

  beforeEach(async () => {
    // If shared templates are missing (CI sandbox), create minimal fixtures in a temp dir
    if (!(await pathExists(path.join(templatesDir, 'registry.yaml')))) {
      const tmp = await ensureTempDir('phase2-fixtures-');
      const localTemplates = path.join(tmp, 'templates');
      await ensureDir(path.join(localTemplates, 'packs', 'software.technical-task'));
      await ensureDir(path.join(localTemplates, 'packs', 'business.market-research'));

      // Write registry
      await fs.writeFile(
        path.join(localTemplates, 'registry.yaml'),
        `domains:\n  - name: software.technical-task\n    description: Software development tasks and feature implementation\n    version: 1.0.0\n    author: core-team\n    path: packs/software.technical-task\n    schema_version: 1.0.0\n  - name: business.market-research\n    description: Business analysis and market research missions\n    version: 1.0.0\n    author: core-team\n    path: packs/business.market-research\n    schema_version: 1.0.0\n`
      );

      // Write software pack
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'software.technical-task', 'pack.yaml'),
        `name: software.technical-task\nversion: 1.0.0\ndisplayName: "Software Development Task"\ndescription: "Software development tasks and feature implementation"\nauthor: "core-team"\nschema: "schema.json"\n`
      );
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'software.technical-task', 'schema.json'),
        `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"userStory":{"type":"string"},"technicalApproach":{"type":"array","items":{"type":"string"}}},"required":["userStory","technicalApproach"],"additionalProperties":true}`
      );
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'software.technical-task', 'template.yaml'),
        `userStory: "As a user, I can log in"\n` +
          `technicalApproach:\n  - "Implement secure password hashing"\n` +
          `nonFunctionalRequirements:\n  - "99.9% uptime"\n` +
          `outOfScope:\n  - "Third-party SSO"\n`
      );

      // Write business pack
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'business.market-research', 'pack.yaml'),
        `name: business.market-research\nversion: 1.0.0\ndisplayName: "Market Research Mission"\ndescription: "Business analysis and market research missions"\nauthor: "core-team"\nschema: "schema.json"\n`
      );
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'business.market-research', 'schema.json'),
        `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"stakeholders":{"type":"array","items":{"type":"string"}},"keyMetrics":{"type":"array","items":{"type":"string"}},"dataSources":{"type":"array","items":{"type":"string"}}},"required":["stakeholders","keyMetrics","dataSources"],"additionalProperties":true}`
      );
      await fs.writeFile(
        path.join(localTemplates, 'packs', 'business.market-research', 'template.yaml'),
        `stakeholders:\n  - "Product"\nkeyMetrics:\n  - "CAC"\n  - "LTV"\ndataSources:\n  - "Reports"\n`
      );

      // Write generic mission template used by create_mission tool
      await fs.writeFile(
        path.join(localTemplates, 'generic_mission.yaml'),
        `schemaType: "Mission"\nschemaVersion: "2.0"\nmissionId: "mission-00000000-000000-000"\nobjective: "Placeholder"\ncontext:\n  background: ""\n  dependencies: []\n  constraints: []\nsuccessCriteria:\n  - "Mission objective achieved"\ndeliverables:\n  - "Mission completion report"\ndomainFields: {}\n`
      );

      templatesDir = localTemplates;
    }
    const genericTemplatePath = path.join(templatesDir, 'generic_mission.yaml');
    if (!(await pathExists(genericTemplatePath))) {
      throw new Error(
        `Required template missing: ${genericTemplatePath}. ` +
          'Restore generic_mission.yaml to keep Phase 2 flow healthy.'
      );
    }
    // Initialize all components
    loader = new SecureYAMLLoader({ baseDir: templatesDir });
    registry = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, registry);
    merger = new MissionMerger();
    createMissionTool = new CreateMissionToolImpl(packLoader, merger, registry, loader);
  });

  describe('Generic Mission Creation', () => {
    it('creates a valid generic mission without domain', async () => {
      // Load registry entries
      const entries = await registry.loadRegistry('registry.yaml');

      // Create generic mission
      const result = await createMissionTool.execute(
        {
          objective: 'Test generic mission creation',
          successCriteria: ['Mission created successfully'],
          constraints: ['No external dependencies'],
        },
        entries
      );

      // Verify YAML output
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');

      // Parse and validate structure
      const mission = YAML.parse(result) as GenericMission;
      expect(isGenericMission(mission)).toBe(true);
      expect(mission.objective).toBe('Test generic mission creation');
      expect(mission.successCriteria).toContain('Mission created successfully');
      expect(mission.context.constraints).toContain('No external dependencies');
      expect(mission.missionId).toMatch(/^mission-\d{8}-\d{6}-\d{3}$/);
    });

    it('generates unique mission IDs', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result1 = await createMissionTool.execute({ objective: 'Test 1' }, entries);
      const result2 = await createMissionTool.execute({ objective: 'Test 2' }, entries);

      const mission1 = YAML.parse(result1) as GenericMission;
      const mission2 = YAML.parse(result2) as GenericMission;

      expect(mission1.missionId).not.toBe(mission2.missionId);
    });

    it('provides default values for optional fields', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result = await createMissionTool.execute(
        { objective: 'Minimal mission test' },
        entries
      );

      const mission = YAML.parse(result) as GenericMission;
      expect(mission.successCriteria).toEqual(['Mission objective achieved']);
      expect(mission.deliverables).toEqual(['Mission completion report']);
    });
  });

  describe('Software Domain Pack Integration', () => {
    it('creates a software development mission', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result = await createMissionTool.execute(
        {
          objective: 'Build a user authentication feature',
          domain: 'software.technical-task',
          successCriteria: ['Users can log in', 'Passwords are encrypted'],
        },
        entries
      );

      const mission = YAML.parse(result) as GenericMission;

      // Verify core fields
      expect(mission.objective).toBe('Build a user authentication feature');
      expect(mission.successCriteria).toContain('Users can log in');

      // Verify domain fields are present
      expect(mission.domainFields).toBeDefined();
      expect(mission.domainFields).toHaveProperty('userStory');
      expect(mission.domainFields).toHaveProperty('technicalApproach');
      expect(mission.domainFields).toHaveProperty('nonFunctionalRequirements');
      expect(mission.domainFields).toHaveProperty('outOfScope');
    });

    it('validates software domain pack schema', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // Load the software domain pack
      const pack = await packLoader.loadPack('software.technical-task', entries);

      // Verify pack structure
      expect(pack.manifest.name).toBe('software.technical-task');
      expect(pack.manifest.version).toBe('1.0.0');
      expect(pack.manifest.displayName).toBe('Software Development Task');

      // Verify schema exists and is valid
      expect(pack.schema).toBeDefined();
      expect(pack.schema.type).toBe('object');
      expect(pack.schema.properties).toHaveProperty('userStory');
      expect(pack.schema.properties).toHaveProperty('technicalApproach');

      // Verify template
      expect(pack.template).toBeDefined();
      expect(pack.template).toHaveProperty('userStory');
      expect(Array.isArray(pack.template.technicalApproach)).toBe(true);
    });
  });

  describe('Business Domain Pack Integration', () => {
    it('creates a business research mission', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result = await createMissionTool.execute(
        {
          objective: 'Analyze competitor pricing strategies',
          domain: 'business.market-research',
          successCriteria: ['Pricing analysis complete', 'Recommendations provided'],
        },
        entries
      );

      const mission = YAML.parse(result) as GenericMission;

      // Verify core fields
      expect(mission.objective).toBe('Analyze competitor pricing strategies');
      expect(mission.successCriteria).toContain('Pricing analysis complete');

      // Verify domain fields are present
      expect(mission.domainFields).toBeDefined();
      expect(mission.domainFields).toHaveProperty('stakeholders');
      expect(mission.domainFields).toHaveProperty('keyMetrics');
      expect(mission.domainFields).toHaveProperty('dataSources');
    });

    it('validates business domain pack schema', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // Load the business domain pack
      const pack = await packLoader.loadPack('business.market-research', entries);

      // Verify pack structure
      expect(pack.manifest.name).toBe('business.market-research');
      expect(pack.manifest.version).toBe('1.0.0');
      expect(pack.manifest.displayName).toBe('Market Research Mission');

      // Verify schema exists and is valid
      expect(pack.schema).toBeDefined();
      expect(pack.schema.type).toBe('object');
      expect(pack.schema.properties).toHaveProperty('stakeholders');
      expect(pack.schema.properties).toHaveProperty('keyMetrics');
      expect(pack.schema.properties).toHaveProperty('dataSources');

      // Verify template
      expect(pack.template).toBeDefined();
      expect(Array.isArray(pack.template.stakeholders)).toBe(true);
      expect(Array.isArray(pack.template.keyMetrics)).toBe(true);
      expect(Array.isArray(pack.template.dataSources)).toBe(true);
    });
  });

  describe('Registry Integration', () => {
    it('list_domains returns both new domain packs', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // Find software and business packs
      const softwarePack = entries.find(
        (e: DomainPackEntry) => e.name === 'software.technical-task'
      );
      const businessPack = entries.find(
        (e: DomainPackEntry) => e.name === 'business.market-research'
      );

      expect(softwarePack).toBeDefined();
      expect([
        'Software development tasks and feature implementation',
        'Missions for designing and implementing software features',
      ]).toContain(softwarePack?.description);
      expect(softwarePack?.version).toBe('1.0.0');

      expect(businessPack).toBeDefined();
      expect(businessPack?.description).toBe('Business analysis and market research missions');
      expect(businessPack?.version).toBe('1.0.0');
    });

    it('validates all domain packs can be loaded', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // Filter to only the new packs we created (skip the stub packs)
      const newPacks = entries.filter(
        (e: DomainPackEntry) =>
          e.name === 'software.technical-task' || e.name === 'business.market-research'
      );

      expect(newPacks.length).toBe(2);

      // Verify each pack can be loaded
      for (const entry of newPacks) {
        const pack = await packLoader.loadPack(entry.name, entries);
        expect(pack).toBeDefined();
        expect(pack.manifest).toBeDefined();
        expect(pack.schema).toBeDefined();
        expect(pack.template).toBeDefined();
      }
    });
  });

  describe('Template Merging Validation', () => {
    it('merges generic and domain templates correctly', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result = await createMissionTool.execute(
        {
          objective: 'Test merge validation',
          domain: 'software.technical-task',
          successCriteria: ['Merge successful'],
        },
        entries
      );

      const mission = YAML.parse(result) as GenericMission;

      // Verify core fields exist
      expect(mission.schemaType).toBe('Mission');
      expect(mission.schemaVersion).toBe('2.0');
      expect(mission.objective).toBe('Test merge validation');
      expect(mission.context).toBeDefined();
      expect(mission.successCriteria).toContain('Merge successful');
      expect(mission.deliverables).toBeDefined();

      // Verify domain fields exist and are merged correctly
      expect(mission.domainFields).toBeDefined();
      expect(mission.domainFields.userStory).toBeDefined();
      expect(mission.domainFields.technicalApproach).toBeDefined();
    });

    it('preserves field types after merge', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      const result = await createMissionTool.execute(
        {
          objective: 'Type preservation test',
          domain: 'business.market-research',
        },
        entries
      );

      const mission = YAML.parse(result) as GenericMission;

      // Verify types are preserved
      expect(typeof mission.objective).toBe('string');
      expect(Array.isArray(mission.successCriteria)).toBe(true);
      expect(Array.isArray(mission.deliverables)).toBe(true);
      expect(typeof mission.context).toBe('object');
      expect(Array.isArray(mission.domainFields.stakeholders)).toBe(true);
      expect(Array.isArray(mission.domainFields.keyMetrics)).toBe(true);
      expect(Array.isArray(mission.domainFields.dataSources)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('throws error for invalid domain name', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      await expect(
        createMissionTool.execute(
          {
            objective: 'Test invalid domain',
            domain: 'invalid.domain',
          },
          entries
        )
      ).rejects.toThrow('Domain pack "invalid.domain" not found');
    });

    it('throws error for missing objective', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      await expect(createMissionTool.execute({ objective: '' }, entries)).rejects.toThrow(
        'objective is required and cannot be empty'
      );
    });

    it('throws error for empty domain string', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      await expect(
        createMissionTool.execute(
          {
            objective: 'Test',
            domain: '',
          },
          entries
        )
      ).rejects.toThrow('domain cannot be empty if provided');
    });
  });

  describe('Phase 2 Milestone Validation', () => {
    it('validates all Phase 2 components working together', async () => {
      // This test validates the complete Phase 2 milestone:
      // 1. Registry parsing ✓
      // 2. Domain pack loading ✓
      // 3. Template merging ✓
      // 4. Mission validation ✓
      // 5. YAML generation ✓

      const entries = await registry.loadRegistry('registry.yaml');

      // Test 1: Generic mission
      const genericResult = await createMissionTool.execute(
        { objective: 'Phase 2 validation - generic' },
        entries
      );
      expect(genericResult).toBeTruthy();
      expect(isGenericMission(YAML.parse(genericResult))).toBe(true);

      // Test 2: Software mission
      const softwareResult = await createMissionTool.execute(
        {
          objective: 'Phase 2 validation - software',
          domain: 'software.technical-task',
        },
        entries
      );
      expect(softwareResult).toBeTruthy();
      const softwareMission = YAML.parse(softwareResult) as GenericMission;
      expect(softwareMission.domainFields.userStory).toBeDefined();

      // Test 3: Business mission
      const businessResult = await createMissionTool.execute(
        {
          objective: 'Phase 2 validation - business',
          domain: 'business.market-research',
        },
        entries
      );
      expect(businessResult).toBeTruthy();
      const businessMission = YAML.parse(businessResult) as GenericMission;
      expect(businessMission.domainFields.stakeholders).toBeDefined();

      // Phase 2 complete! ✓
    });

    it('confirms 2 production-ready domain packs exist', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      const productionPacks = entries.filter(
        (e: DomainPackEntry) =>
          e.name === 'software.technical-task' || e.name === 'business.market-research'
      );

      expect(productionPacks.length).toBe(2);

      // Verify each pack is production-ready
      for (const pack of productionPacks) {
        expect(pack.version).toBe('1.0.0');
        expect(pack.author).toBe('core-team');

        // Verify files exist
        const packDir = path.join(templatesDir, pack.path);
        expect(await pathExists(path.join(packDir, 'pack.yaml'))).toBe(true);
        expect(await pathExists(path.join(packDir, 'schema.json'))).toBe(true);
        expect(await pathExists(path.join(packDir, 'template.yaml'))).toBe(true);
      }
    });
  });
});
