/**
 * Registry Parser Tests
 *
 * Comprehensive test suite for registry loading and validation
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { RegistryParser } from '../../src/registry/registry-parser';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { DomainPackEntry } from '../../src/types/registry';
import { ensureDir, pathExists } from '../../src/utils/fs';

const TEST_DATA_DIR = path.join(__dirname, 'test-data');

describe('RegistryParser', () => {
  let parser: RegistryParser;
  let loader: SecureYAMLLoader;

  beforeEach(async () => {
    // Ensure test data directory exists
    if (!(await pathExists(TEST_DATA_DIR))) {
      await ensureDir(TEST_DATA_DIR);
    }

    loader = new SecureYAMLLoader({ baseDir: TEST_DATA_DIR });
    parser = new RegistryParser(loader);
  });

  describe('loadRegistry - valid registries', () => {
    test('should load a valid registry with single domain', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'valid-single.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test-domain
    description: Test domain pack
    version: 1.0.0
    path: domains/test
    schema_version: 1.0.0
      `.trim()
      );

      const entries = await parser.loadRegistry('valid-single.yaml');

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('test-domain');
      expect(entries[0].version).toBe('1.0.0');
      expect(entries[0].schema_version).toBe('1.0.0');
    });

    test('should load a valid registry with multiple domains', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'valid-multiple.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: domain-one
    description: First domain
    version: 1.0.0
    path: domains/one
    schema_version: 1.0.0
  - name: domain-two
    description: Second domain
    version: 2.0.0
    author: Test Author
    path: domains/two
    schema_version: 1.0.0
  - name: domain-three
    description: Third domain
    version: 0.5.0
    path: domains/three
    schema_version: 1.0.0
      `.trim()
      );

      const entries = await parser.loadRegistry('valid-multiple.yaml');

      expect(entries).toHaveLength(3);
      expect(entries[0].name).toBe('domain-one');
      expect(entries[1].name).toBe('domain-two');
      expect(entries[1].author).toBe('Test Author');
      expect(entries[2].name).toBe('domain-three');
    });

    test('should load registry with optional author field', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'valid-optional-author.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: with-author
    description: Has author
    version: 1.0.0
    author: John Doe
    path: domains/with-author
    schema_version: 1.0.0
  - name: without-author
    description: No author
    version: 1.0.0
    path: domains/without-author
    schema_version: 1.0.0
      `.trim()
      );

      const entries = await parser.loadRegistry('valid-optional-author.yaml');

      expect(entries).toHaveLength(2);
      expect(entries[0].author).toBe('John Doe');
      expect(entries[1].author).toBeUndefined();
    });
  });

  describe('loadRegistry - invalid registries', () => {
    test('should reject registry missing required name field', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-missing-name.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - description: Missing name
    version: 1.0.0
    path: domains/test
    schema_version: 1.0.0
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-missing-name.yaml')).rejects.toThrow(/name/);
    });

    test('should reject registry with invalid SemVer version', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-semver.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test
    description: Invalid version
    version: v1.2.0
    path: domains/test
    schema_version: 1.0.0
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-semver.yaml')).rejects.toThrow(
        /version.*not valid SemVer/
      );
    });

    test('should reject registry with invalid schema_version', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-schema-version.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test
    description: Invalid schema version
    version: 1.0.0
    path: domains/test
    schema_version: "1.2"
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-schema-version.yaml')).rejects.toThrow(
        /schema_version.*not valid SemVer/
      );
    });

    test('should reject registry with path traversal in path', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-path-traversal.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test
    description: Path traversal attempt
    version: 1.0.0
    path: ../../../etc/passwd
    schema_version: 1.0.0
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-path-traversal.yaml')).rejects.toThrow(
        /path.*\.\./
      );
    });

    test('should reject registry with absolute path', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-absolute-path.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test
    description: Absolute path
    version: 1.0.0
    path: /absolute/path
    schema_version: 1.0.0
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-absolute-path.yaml')).rejects.toThrow(
        /path.*start with/
      );
    });

    test('should reject registry with empty author string', async () => {
      const registryPath = path.join(TEST_DATA_DIR, 'invalid-empty-author.yaml');
      await fs.writeFile(
        registryPath,
        `
domains:
  - name: test
    description: Empty author
    version: 1.0.0
    author: ""
    path: domains/test
    schema_version: 1.0.0
      `.trim()
      );

      await expect(parser.loadRegistry('invalid-empty-author.yaml')).rejects.toThrow(
        /author.*empty/
      );
    });
  });

  describe('validateEntry', () => {
    test('should validate a correct entry', async () => {
      const entry: DomainPackEntry = {
        name: 'test',
        description: 'Test domain',
        version: '1.0.0',
        path: 'domains/test',
        schema_version: '1.0.0',
      };

      const result = parser.validateEntry(entry);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.entry).toEqual(entry);
    });

    test('should reject entry with empty name', async () => {
      const entry: DomainPackEntry = {
        name: '',
        description: 'Test',
        version: '1.0.0',
        path: 'domains/test',
        schema_version: '1.0.0',
      };

      const result = parser.validateEntry(entry);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required and cannot be empty');
    });

    test('should reject entry with invalid version format', async () => {
      const entry: DomainPackEntry = {
        name: 'test',
        description: 'Test',
        version: '1.0',
        path: 'domains/test',
        schema_version: '1.0.0',
      };

      const result = parser.validateEntry(entry);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    test('should collect multiple validation errors', async () => {
      const entry: DomainPackEntry = {
        name: '',
        description: '',
        version: 'invalid',
        path: '../evil',
        schema_version: 'bad',
      };

      const result = parser.validateEntry(entry);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('should flag empty path and schema_version fields explicitly', async () => {
      const entry: DomainPackEntry = {
        name: 'missing-fields',
        description: 'Example',
        version: '1.0.0',
        path: '',
        schema_version: '',
      };

      const result = parser.validateEntry(entry);

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'path is required and cannot be empty',
          'schema_version is required and cannot be empty',
        ])
      );
    });
  });

  describe('filterBySchemaVersion', () => {
    const entries: DomainPackEntry[] = [
      {
        name: 'v1-domain',
        description: 'Version 1',
        version: '1.0.0',
        path: 'domains/v1',
        schema_version: '1.0.0',
      },
      {
        name: 'v1-minor',
        description: 'Version 1.5',
        version: '1.0.0',
        path: 'domains/v1-minor',
        schema_version: '1.5.0',
      },
      {
        name: 'v2-domain',
        description: 'Version 2',
        version: '1.0.0',
        path: 'domains/v2',
        schema_version: '2.0.0',
      },
      {
        name: 'v0-domain',
        description: 'Version 0.1',
        version: '1.0.0',
        path: 'domains/v0',
        schema_version: '0.1.0',
      },
    ];

    test('should filter entries by compatible schema version', async () => {
      const filtered = parser.filterBySchemaVersion(entries, '1.0.0');

      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.name)).toContain('v1-domain');
      expect(filtered.map((e) => e.name)).toContain('v1-minor');
    });

    test('should handle version 2.x.x filtering', async () => {
      const filtered = parser.filterBySchemaVersion(entries, '2.0.0');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('v2-domain');
    });

    test('should handle 0.x.x versions strictly', async () => {
      const filtered = parser.filterBySchemaVersion(entries, '0.1.0');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('v0-domain');
    });

    test('should throw on invalid target version', async () => {
      expect(() => parser.filterBySchemaVersion(entries, 'invalid')).toThrow(/Invalid target/);
    });
  });

  describe('getByExactSchemaVersion', () => {
    const entries: DomainPackEntry[] = [
      {
        name: 'exact-v1',
        description: 'Exactly 1.0.0',
        version: '1.0.0',
        path: 'domains/v1',
        schema_version: '1.0.0',
      },
      {
        name: 'exact-v1-5',
        description: 'Exactly 1.5.0',
        version: '1.0.0',
        path: 'domains/v1-5',
        schema_version: '1.5.0',
      },
    ];

    test('should return entries with exact schema version match', async () => {
      const result = parser.getByExactSchemaVersion(entries, '1.0.0');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('exact-v1');
    });

    test('should return empty array when no exact match', async () => {
      const result = parser.getByExactSchemaVersion(entries, '2.0.0');

      expect(result).toHaveLength(0);
    });

    test('should throw on invalid version', async () => {
      expect(() => parser.getByExactSchemaVersion(entries, 'bad')).toThrow(/Invalid/);
    });
  });

  describe('findByName', () => {
    const entries: DomainPackEntry[] = [
      {
        name: 'test-domain',
        description: 'Test',
        version: '1.0.0',
        path: 'domains/test',
        schema_version: '1.0.0',
      },
      {
        name: 'another-domain',
        description: 'Another',
        version: '1.0.0',
        path: 'domains/another',
        schema_version: '1.0.0',
      },
    ];

    test('should find entry by name', async () => {
      const result = parser.findByName(entries, 'test-domain');

      expect(result).toBeDefined();
      expect(result?.name).toBe('test-domain');
    });

    test('should return undefined when not found', async () => {
      const result = parser.findByName(entries, 'nonexistent');

      expect(result).toBeUndefined();
    });
  });
});
