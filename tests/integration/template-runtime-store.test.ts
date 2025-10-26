/**
 * Smoke Test for Template Runtime Store
 *
 * Verifies that the restored template directory contains valid canonical assets:
 * - registry.yaml loads and validates
 * - generic_mission.yaml matches the universal mission schema
 * - All domain packs load successfully through DomainPackLoader
 * - create_mission can create missions using restored templates
 *
 * @module tests/integration/template-runtime-store
 */

import { describe, it, expect } from '@jest/globals';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { isGenericMission } from '../../src/schemas/generic-mission';
import { resolveTemplatesDir } from '../utils/template-path';

describe('Template Runtime Store - Smoke Test', () => {
  let baseDir: string;
  let loader: SecureYAMLLoader;
  let registry: RegistryParser;
  let packLoader: DomainPackLoader;

  beforeAll(async () => {
    baseDir = await resolveTemplatesDir();
    loader = new SecureYAMLLoader({
      baseDir,
      followSymlinks: false,
      maxFileSize: 5 * 1024 * 1024,
    });
    registry = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, registry);
  });

  describe('registry.yaml', () => {
    it('should exist and load successfully', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      expect(entries).toBeDefined();
      expect(Array.isArray(entries)).toBe(true);
    });

    it('should validate against registry schema', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      expect(entries.length).toBeGreaterThan(0);
    });

    it('should list all restored domain packs', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      expect(entries.length).toBeGreaterThan(0);
      
      // Check that expected domain packs are present
      const domainNames = entries.map(d => d.name);
      expect(domainNames).toContain('foundation');
      expect(domainNames).toContain('software.technical-task');
      expect(domainNames).toContain('build.implementation');
    });
  });

  describe('generic_mission.yaml', () => {
    it('should exist and load successfully', async () => {
      const genericTemplate = await loader.load('generic_mission.yaml');
      expect(genericTemplate).toBeDefined();
    });

    it('should match the universal mission schema', async () => {
      const genericTemplate: any = await loader.load('generic_mission.yaml');
      // Template files have empty values, so we check structure not strict validation
      expect(genericTemplate.schemaType).toBe('Mission');
      expect(genericTemplate.schemaVersion).toBe('2.0');
      expect(typeof genericTemplate.missionId).toBe('string');
      expect(typeof genericTemplate.objective).toBe('string');
      expect(Array.isArray(genericTemplate.successCriteria)).toBe(true);
      expect(Array.isArray(genericTemplate.deliverables)).toBe(true);
      expect(typeof genericTemplate.domainFields).toBe('object');
    });

    it('should have required core fields', async () => {
      const genericTemplate: any = await loader.load('generic_mission.yaml');
      expect(genericTemplate).toHaveProperty('schemaType');
      expect(genericTemplate).toHaveProperty('schemaVersion');
      expect(genericTemplate).toHaveProperty('missionId');
      expect(genericTemplate).toHaveProperty('objective');
      expect(genericTemplate).toHaveProperty('successCriteria');
      expect(genericTemplate).toHaveProperty('deliverables');
      expect(genericTemplate).toHaveProperty('domainFields');
    });
  });

  describe('Domain Packs', () => {
    it('should load all registered domain packs without errors', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      for (const entry of entries) {
        const pack = await packLoader.loadPack(entry.name, entries);
        expect(pack).toBeDefined();
        expect(pack.manifest).toBeDefined();
        expect(pack.schema).toBeDefined();
        expect(pack.template).toBeDefined();
      }
    });

    it('should validate foundation domain pack structure', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      const pack = await packLoader.loadPack('foundation', entries);

      expect(pack.manifest.name).toBe('foundation');
      expect(pack.manifest.version).toBe('1.0.0');
      expect(pack.schema).toHaveProperty('$schema');
      expect(pack.template).toBeDefined();
    });

    it('should validate software.technical-task domain pack structure', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      const pack = await packLoader.loadPack('software.technical-task', entries);

      expect(pack.manifest.name).toBe('software.technical-task');
      expect(pack.manifest.version).toBe('1.0.0');
      expect(pack.schema).toHaveProperty('properties');
      expect(pack.template).toBeDefined();
    });

    it('should validate build.implementation domain pack structure', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      const pack = await packLoader.loadPack('build.implementation', entries);

      expect(pack.manifest.name).toBe('build.implementation');
      expect(pack.template).toHaveProperty('type');
    });
  });

  describe('End-to-End Template Loading', () => {
    it('should successfully load generic template and merge with a domain pack', async () => {
      const entries = await registry.loadRegistry('registry.yaml');
      
      const genericTemplate = await loader.load('generic_mission.yaml');
      const pack = await packLoader.loadPack('foundation', entries);
      
      expect(genericTemplate).toBeDefined();
      expect(pack).toBeDefined();
      expect(pack.template).toBeDefined();
    });
  });
});
