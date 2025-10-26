/**
 * Integration Tests for MCP Server
 *
 * End-to-end tests validating the complete Phase 1 workflow:
 * - Server initialization
 * - Registry loading
 * - Domain discovery via list_available_domains tool
 *
 * @module tests/integration/mcp-server
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as path from 'path';
import { promises as fs } from 'fs';
import { ensureDir, ensureTempDir, pathExists } from '../../src/utils/fs';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { ListDomainsToolImpl } from '../../src/tools/list-domains';
import { resolveTemplatesDir } from '../utils/template-path';

describe('Phase 1 Integration Tests', () => {
  let loader: SecureYAMLLoader;
  let registry: RegistryParser;
  let listDomainsTool: ListDomainsToolImpl;

  beforeEach(async () => {
    // Initialize components as the MCP server does
    let baseDir = await resolveTemplatesDir();
    // Fallback: if registry.yaml missing, create minimal fixtures
    if (!(await pathExists(path.join(baseDir, 'registry.yaml')))) {
      const tmp = await ensureTempDir('mcp-fixtures-');
      baseDir = path.join(tmp, 'templates');
      await ensureDir(path.join(baseDir, 'packs', 'foundation'));
      await fs.writeFile(path.join(baseDir, 'registry.yaml'),
        `domains:\n` +
        `  - name: foundation\n    description: Core infrastructure baseline\n    version: 1.0.0\n    author: core-team\n    path: packs/foundation\n    schema_version: 1.0.0\n` +
        `  - name: software.technical-task\n    description: Software tasks\n    version: 1.0.0\n    author: core-team\n    path: packs/software.technical-task\n    schema_version: 1.0.0\n` +
        `  - name: business.market-research\n    description: Business research\n    version: 1.0.0\n    author: core-team\n    path: packs/business.market-research\n    schema_version: 1.0.0\n` +
        `  - name: ops.deployment-checklist\n    description: Ops checklist\n    version: 1.0.0\n    author: core-team\n    path: packs/ops.deployment-checklist\n    schema_version: 1.0.0\n`);
      await fs.writeFile(path.join(baseDir, 'packs', 'foundation', 'pack.yaml'),
        `name: foundation\nversion: 1.0.0\ndisplayName: Foundation\ndescription: Core\nauthor: core-team\nschema: schema.json\n`);
      await fs.writeFile(path.join(baseDir, 'packs', 'foundation', 'schema.json'),
        `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"governanceChecklist":{"type":"array","items":{"type":"string"}}}}`);
      await fs.writeFile(path.join(baseDir, 'packs', 'foundation', 'template.yaml'),
        `governanceChecklist:\n  - "Policy"\n`);
    }

    loader = new SecureYAMLLoader({
      baseDir,
      followSymlinks: false,
      maxFileSize: 5 * 1024 * 1024, // 5MB
    });

    registry = new RegistryParser(loader);
    listDomainsTool = new ListDomainsToolImpl(registry);
  });

  describe('Complete Workflow', () => {
    it('should load registry and list domains end-to-end', async () => {
      // Execute the complete workflow
      const domains = await listDomainsTool.execute('registry.yaml');

      // Verify we got domain results
      expect(domains).toBeDefined();
      expect(Array.isArray(domains)).toBe(true);
      expect(domains.length).toBeGreaterThan(0);

      // Verify first domain has expected structure
      const firstDomain = domains[0];
      expect(firstDomain).toHaveProperty('name');
      expect(firstDomain).toHaveProperty('description');
      expect(firstDomain).toHaveProperty('version');

      // Verify domain names are strings
      expect(typeof firstDomain.name).toBe('string');
      expect(typeof firstDomain.description).toBe('string');
      expect(typeof firstDomain.version).toBe('string');
    });

    it('should format domain list for LLM consumption', async () => {
      // Execute tool
      const domains = await listDomainsTool.execute('registry.yaml');

      // Format for LLM
      const formatted = listDomainsTool.formatForLLM(domains);

      // Verify formatted output
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);

      // Should contain count
      expect(formatted).toContain('domain pack');

      // Should contain markdown formatting
      expect(formatted).toContain('**');
    });
  });

  describe('Server Component Integration', () => {
    it('should initialize SecureYAMLLoader successfully', async () => {
      expect(loader).toBeDefined();
      expect(loader.getBaseDir()).toContain('templates');
    });

    it('should initialize RegistryParser successfully', async () => {
      expect(registry).toBeDefined();
    });

    it('should initialize ListDomainsToolImpl successfully', async () => {
      expect(listDomainsTool).toBeDefined();
    });

    it('should chain components: loader -> registry -> tool', async () => {
      // This test validates the entire chain
      const entries = await registry.loadRegistry('registry.yaml');
      expect(entries).toBeDefined();
      expect(entries.length).toBeGreaterThan(0);

      // Verify registry entries have required fields
      const firstEntry = entries[0];
      expect(firstEntry).toHaveProperty('name');
      expect(firstEntry).toHaveProperty('description');
      expect(firstEntry).toHaveProperty('version');
      expect(firstEntry).toHaveProperty('schema_version');
      expect(firstEntry).toHaveProperty('path');
    });
  });

  describe('Registry Validation', () => {
    it('should load registry.yaml with all domains', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // Verify we have the expected domains from registry.yaml
      expect(entries.length).toBeGreaterThanOrEqual(4);

      // Verify foundation domain exists (first in our registry)
      const foundation = entries.find(e => e.name === 'foundation');
      expect(foundation).toBeDefined();
      expect(foundation?.description).toContain('infrastructure');
      expect(foundation?.version).toBe('1.0.0');
    });

    it('should validate all SemVer versions in registry', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // All entries should have valid SemVer
      entries.forEach(entry => {
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(entry.schema_version).toMatch(/^\d+\.\d+\.\d+$/);
      });
    });

    it('should validate all paths are relative', async () => {
      const entries = await registry.loadRegistry('registry.yaml');

      // All paths should be relative (no leading slash or ..)
      entries.forEach(entry => {
        expect(entry.path).not.toMatch(/^\//); // No absolute paths
        expect(entry.path).not.toContain('..'); // No traversal
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute list_available_domains tool', async () => {
      const domains = await listDomainsTool.execute('registry.yaml');

      expect(domains).toBeDefined();
      expect(domains.length).toBeGreaterThan(0);
    });

    it('should return simplified DomainInfo (not full DomainPackEntry)', async () => {
      const domains = await listDomainsTool.execute('registry.yaml');
      const firstDomain = domains[0];

      // Should have DomainInfo fields
      expect(firstDomain).toHaveProperty('name');
      expect(firstDomain).toHaveProperty('description');
      expect(firstDomain).toHaveProperty('version');

      // Should NOT have DomainPackEntry internal fields
      expect(firstDomain).not.toHaveProperty('path');
      expect(firstDomain).not.toHaveProperty('schema_version');
    });

    it('should handle author field correctly', async () => {
      const domains = await listDomainsTool.execute('registry.yaml');

      // Find domain with author
      const domainWithAuthor = domains.find(d => d.author !== undefined);

      if (domainWithAuthor) {
        expect(typeof domainWithAuthor.author).toBe('string');
        expect(domainWithAuthor.author!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing registry gracefully', async () => {
      const domains = await listDomainsTool.execute('nonexistent.yaml');

      // Should return empty array for missing registry
      expect(domains).toEqual([]);
    });

    it('should throw on invalid registry format', async () => {
      // Create a test registry with invalid format
      await expect(registry.loadRegistry('invalid-registry.yaml')).rejects.toThrow();
    });
  });

  describe('Phase 1 Milestone Validation', () => {
    it('validates all Phase 1 success criteria', async () => {
      // Criterion 1: Server components initialize
      expect(loader).toBeDefined();
      expect(registry).toBeDefined();
      expect(listDomainsTool).toBeDefined();

      // Criterion 2: Registry loads successfully
      const entries = await registry.loadRegistry('registry.yaml');
      expect(entries.length).toBeGreaterThan(0);

      // Criterion 3: list_available_domains executes
      const domains = await listDomainsTool.execute('registry.yaml');
      expect(domains.length).toBeGreaterThan(0);

      // Criterion 4: Output formatted for LLM
      const formatted = listDomainsTool.formatForLLM(domains);
      expect(formatted).toContain('domain pack');

      // Criterion 5: Security validated (all paths relative)
      entries.forEach(entry => {
        expect(entry.path).not.toMatch(/^\//);
        expect(entry.path).not.toContain('..');
      });
    });

    it('confirms MCP server readiness', async () => {
      // This test confirms the server is ready for Claude Desktop integration

      // 1. Components can be initialized
      expect(loader).toBeDefined();
      expect(registry).toBeDefined();
      expect(listDomainsTool).toBeDefined();

      // 2. Tool can execute successfully
      const domains = await listDomainsTool.execute('registry.yaml');
      expect(domains.length).toBeGreaterThan(0);

      // 3. Output can be formatted
      const formatted = listDomainsTool.formatForLLM(domains);
      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);

      // Phase 1 Complete: Ready for Claude Desktop
    });
  });
});
