/**
 * Tests for List Domains Tool
 *
 * Validates the ListDomainsToolImpl class functionality:
 * - Loading domains from registry
 * - Converting to DomainInfo format
 * - LLM-optimized formatting
 * - Error handling
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { ListDomainsToolImpl } from '../../src/tools/list-domains';
import { DomainInfo } from '../../src/types/tools';
import { ensureDir } from '../../src/utils/fs';

describe('ListDomainsToolImpl', () => {
  const testDataDir = path.join(__dirname, '../test-data/tools');
  let loader: SecureYAMLLoader;
  let parser: RegistryParser;
  let tool: ListDomainsToolImpl;

  beforeAll(async () => {
    await ensureDir(testDataDir);
  });

  beforeEach(() => {
    loader = new SecureYAMLLoader({ baseDir: testDataDir });
    parser = new RegistryParser(loader);
    tool = new ListDomainsToolImpl(parser);
  });

  afterEach(async () => {
    // Clean up test files
    const files = await fs.readdir(testDataDir);
    await Promise.all(files.map(file => fs.unlink(path.join(testDataDir, file))));
  });

  describe('execute', () => {
    it('should return empty array when registry file does not exist', async () => {
      const result = await tool.execute('nonexistent.yaml');
      expect(result).toEqual([]);
    });

    it('should return single domain from registry', async () => {
      const registryContent = `
domains:
  - name: foundation
    description: Core infrastructure
    version: 1.0.0
    author: Test Author
    path: domains/foundation
    schema_version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'single.yaml'), registryContent);

      const result = await tool.execute('single.yaml');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'foundation',
        description: 'Core infrastructure',
        version: '1.0.0',
        author: 'Test Author',
      });
    });

    it('should return multiple domains from registry', async () => {
      const registryContent = `
domains:
  - name: foundation
    description: Core infrastructure
    version: 1.0.0
    path: domains/foundation
    schema_version: 1.0.0
  - name: web-dev
    description: Web development
    version: 2.0.0
    author: Web Team
    path: domains/web
    schema_version: 1.0.0
  - name: data
    description: Data processing
    version: 1.5.0
    path: domains/data
    schema_version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'multiple.yaml'), registryContent);

      const result = await tool.execute('multiple.yaml');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('foundation');
      expect(result[1].name).toBe('web-dev');
      expect(result[2].name).toBe('data');
    });

    it('should exclude author when not provided', async () => {
      const registryContent = `
domains:
  - name: foundation
    description: Core infrastructure
    version: 1.0.0
    path: domains/foundation
    schema_version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'no-author.yaml'), registryContent);

      const result = await tool.execute('no-author.yaml');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'foundation',
        description: 'Core infrastructure',
        version: '1.0.0',
      });
      expect(result[0]).not.toHaveProperty('author');
    });

    it('should throw error for invalid registry', async () => {
      const registryContent = `
domains:
  - name: invalid
    description: Missing required fields
    version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'invalid.yaml'), registryContent);

      await expect(tool.execute('invalid.yaml')).rejects.toThrow();
    });

    it('should throw error for corrupted YAML', async () => {
      const registryContent = `
domains:
  - name: test
    description: "Unclosed quote
    version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'corrupted.yaml'), registryContent);

      await expect(tool.execute('corrupted.yaml')).rejects.toThrow();
    });

    it('should use default registry path when not provided', async () => {
      const registryContent = `
domains:
  - name: foundation
    description: Core infrastructure
    version: 1.0.0
    path: domains/foundation
    schema_version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'registry.yaml'), registryContent);

      const result = await tool.execute(); // No path argument

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('foundation');
    });
  });

  describe('formatForLLM', () => {
    it('should format empty array with helpful message', async () => {
      const domains: DomainInfo[] = [];
      const result = tool.formatForLLM(domains);

      expect(result).toBe('No domain packs are currently available in the registry.');
    });

    it('should format single domain correctly', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'foundation',
          description: 'Core infrastructure',
          version: '1.0.0',
          author: 'Test Author',
        },
      ];

      const result = tool.formatForLLM(domains);

      expect(result).toContain('Found 1 domain pack:');
      expect(result).toContain('**foundation** (v1.0.0)');
      expect(result).toContain('Core infrastructure');
      expect(result).toContain('Author: Test Author');
    });

    it('should format multiple domains correctly', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'foundation',
          description: 'Core infrastructure',
          version: '1.0.0',
        },
        {
          name: 'web-dev',
          description: 'Web development',
          version: '2.0.0',
          author: 'Web Team',
        },
      ];

      const result = tool.formatForLLM(domains);

      expect(result).toContain('Found 2 domain packs:');
      expect(result).toContain('1. **foundation** (v1.0.0)');
      expect(result).toContain('2. **web-dev** (v2.0.0)');
      expect(result).toContain('Core infrastructure');
      expect(result).toContain('Web development');
      expect(result).toContain('Author: Web Team');
    });

    it('should not include author line when author is missing', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'foundation',
          description: 'Core infrastructure',
          version: '1.0.0',
        },
      ];

      const result = tool.formatForLLM(domains);

      expect(result).not.toContain('Author:');
    });

    it('should separate domains with blank lines', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'foundation',
          description: 'Core',
          version: '1.0.0',
        },
        {
          name: 'web',
          description: 'Web',
          version: '2.0.0',
        },
      ];

      const result = tool.formatForLLM(domains);
      const lines = result.split('\n');

      // Should have blank lines between entries
      expect(result).toContain('\n\n');
    });

    it('should use proper markdown formatting', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'test',
          description: 'Test domain',
          version: '1.0.0',
        },
      ];

      const result = tool.formatForLLM(domains);

      // Check for bold markdown
      expect(result).toContain('**test**');
      // Check for version format
      expect(result).toContain('(v1.0.0)');
    });

    it('should handle special characters in descriptions', async () => {
      const domains: DomainInfo[] = [
        {
          name: 'test',
          description: 'Test with "quotes" and <tags>',
          version: '1.0.0',
        },
      ];

      const result = tool.formatForLLM(domains);

      expect(result).toContain('Test with "quotes" and <tags>');
    });
  });

  describe('integration tests', () => {
    it('should handle full workflow from registry to formatted output', async () => {
      const registryContent = `
domains:
  - name: foundation
    description: Core infrastructure and MCP server development
    version: 1.0.0
    author: Mission Protocol Team
    path: domains/foundation
    schema_version: 1.0.0
  - name: web-development
    description: Full-stack web application development
    version: 1.2.3
    author: Mission Protocol Team
    path: domains/web-development
    schema_version: 1.0.0
`;
      await fs.writeFile(path.join(testDataDir, 'full.yaml'), registryContent);

      const domains = await tool.execute('full.yaml');
      const formatted = tool.formatForLLM(domains);

      expect(domains).toHaveLength(2);
      expect(formatted).toContain('Found 2 domain packs:');
      expect(formatted).toContain('**foundation** (v1.0.0)');
      expect(formatted).toContain('**web-development** (v1.2.3)');
    });
  });

  describe('error handling', () => {
    it('should handle registry with no domains array', async () => {
      const registryContent = `
not_domains:
  - name: test
`;
      await fs.writeFile(path.join(testDataDir, 'no-array.yaml'), registryContent);

      await expect(tool.execute('no-array.yaml')).rejects.toThrow();
    });

    it('should handle empty domains array', async () => {
      const registryContent = `
domains: []
`;
      await fs.writeFile(path.join(testDataDir, 'empty.yaml'), registryContent);

      const result = await tool.execute('empty.yaml');
      expect(result).toEqual([]);
    });
  });
});

describe('listDomainsToolDefinition', () => {
  it('should export valid MCP tool definition', async () => {
    const {
      getAvailableDomainsToolDefinition,
      listAvailableDomainsToolDefinitionDeprecated,
    } = require('../../src/tools/list-domains');

    expect(getAvailableDomainsToolDefinition).toBeDefined();
    expect(getAvailableDomainsToolDefinition.name).toBe('get_available_domains');
    expect(getAvailableDomainsToolDefinition.description).toContain('domain-specific mission types');
    expect(getAvailableDomainsToolDefinition.inputSchema).toBeDefined();
    expect(getAvailableDomainsToolDefinition.inputSchema.type).toBe('object');
    expect(getAvailableDomainsToolDefinition.inputSchema.properties).toEqual({});

    expect(listAvailableDomainsToolDefinitionDeprecated).toBeDefined();
    expect(listAvailableDomainsToolDefinitionDeprecated.name).toBe('list_available_domains');
    expect(listAvailableDomainsToolDefinitionDeprecated.description).toContain('[DEPRECATED]');
  });
});
