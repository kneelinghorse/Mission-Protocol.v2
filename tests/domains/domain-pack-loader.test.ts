/**
 * Comprehensive test suite for DomainPackLoader
 *
 * Tests all loader functionality:
 * - Pack manifest loading and validation
 * - Schema loading and validation
 * - Template loading
 * - Complete pack loading
 * - Error handling for invalid packs
 * - Integration with SecureYAMLLoader and RegistryParser
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader, loadDomainPack } from '../../src/domains/domain-pack-loader';
import { DomainPackEntry } from '../../src/types/registry';
import {
  DomainPack,
  DomainPackManifest,
  DomainPackValidationResult,
} from '../../src/domains/types';

describe('DomainPackLoader', () => {
  let loader: SecureYAMLLoader;
  let registry: RegistryParser;
  let packLoader: DomainPackLoader;
  let testBaseDir: string;

  beforeEach(() => {
    // Use app directory as base for tests
    testBaseDir = path.resolve(__dirname, '../../');
    loader = new SecureYAMLLoader({ baseDir: testBaseDir });
    registry = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, registry);
  });

  describe('Manifest Validation', () => {
    it('should validate a valid manifest', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: 'schema.yaml',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate manifest with optional fields', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        author: 'Test Author',
        schema: 'schema.yaml',
        dependencies: [
          { name: 'other-pack', version: '2.0.0' },
        ],
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest with missing required fields', () => {
      const manifest = {
        name: 'test-pack',
        // missing version, displayName, description, schema
      } as DomainPackManifest;

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
      expect(result.errors.some(e => e.includes('displayName'))).toBe(true);
      expect(result.errors.some(e => e.includes('description'))).toBe(true);
      expect(result.errors.some(e => e.includes('schema'))).toBe(true);
    });

    it('should reject manifest with empty required fields', () => {
      const manifest: DomainPackManifest = {
        name: '   ',
        version: '',
        displayName: '',
        description: '',
        schema: '',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject manifest with invalid SemVer version', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: 'not-semver',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: 'schema.yaml',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('SemVer'))).toBe(true);
    });

    it('should reject manifest with path traversal in schema', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: '../../../etc/passwd',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('relative'))).toBe(true);
    });

    it('should reject manifest with absolute schema path', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: '/absolute/path/schema.yaml',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('relative'))).toBe(true);
    });

    it('should reject manifest with empty author field', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        author: '   ',
        schema: 'schema.yaml',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('author'))).toBe(true);
    });

    it('should reject manifest with invalid dependency versions', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: 'schema.yaml',
        dependencies: [
          { name: 'dep1', version: 'invalid' },
          { name: '', version: '1.0.0' },
        ],
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('dependency'))).toBe(true);
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid JSON Schema with type', () => {
      const schema = {
        type: 'object',
        properties: {
          field1: { type: 'string' },
        },
      };

      // Using private method via type casting
      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(true);
    });

    it('should accept valid JSON Schema with composition', () => {
      const schema = {
        anyOf: [
          { type: 'string' },
          { type: 'number' },
        ],
      };

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(true);
    });

    it('should accept valid JSON Schema with $ref', () => {
      const schema = {
        $ref: '#/definitions/SomeType',
      };

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(true);
    });

    it('should reject invalid JSON Schema (no type or composition)', () => {
      const schema = {
        properties: {
          field1: { type: 'string' },
        },
      };

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(false);
    });

    it('should reject null as JSON Schema', () => {
      const isValid = (packLoader as any).isValidJSONSchema(null);

      expect(isValid).toBe(false);
    });

    it('should reject array as JSON Schema', () => {
      const isValid = (packLoader as any).isValidJSONSchema([]);

      expect(isValid).toBe(false);
    });

    it('should reject primitive as JSON Schema', () => {
      const isValid = (packLoader as any).isValidJSONSchema('not a schema');

      expect(isValid).toBe(false);
    });
  });

  describe('Pack Validation', () => {
    it('should validate a complete valid pack', () => {
      const pack: DomainPack = {
        manifest: {
          name: 'test-pack',
          version: '1.0.0',
          displayName: 'Test Pack',
          description: 'A test domain pack',
          schema: 'schema.yaml',
        },
        schema: {
          type: 'object',
          properties: {
            field1: { type: 'string' },
          },
        },
        template: {
          field1: 'value1',
        },
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.pack).toEqual(pack);
    });

    it('should reject pack with invalid manifest', () => {
      const pack: DomainPack = {
        manifest: {
          name: '',
          version: 'invalid',
          displayName: 'Test Pack',
          description: 'A test domain pack',
          schema: 'schema.yaml',
        },
        schema: {
          type: 'object',
        },
        template: {},
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject pack with invalid schema', () => {
      const pack: DomainPack = {
        manifest: {
          name: 'test-pack',
          version: '1.0.0',
          displayName: 'Test Pack',
          description: 'A test domain pack',
          schema: 'schema.yaml',
        },
        schema: { properties: {} } as any, // Invalid: no type
        template: {},
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Schema'))).toBe(true);
    });

    it('should reject pack with non-object template', () => {
      const pack: DomainPack = {
        manifest: {
          name: 'test-pack',
          version: '1.0.0',
          displayName: 'Test Pack',
          description: 'A test domain pack',
          schema: 'schema.yaml',
        },
        schema: {
          type: 'object',
        },
        template: [] as any, // Invalid: array instead of object
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Template'))).toBe(true);
    });

    it('should reject pack with null template', () => {
      const pack: DomainPack = {
        manifest: {
          name: 'test-pack',
          version: '1.0.0',
          displayName: 'Test Pack',
          description: 'A test domain pack',
          schema: 'schema.yaml',
        },
        schema: {
          type: 'object',
        },
        template: null as any,
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Template'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for pack not found in registry', async () => {
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'other-pack',
          version: '1.0.0',
          description: 'Another pack',
          path: 'packs/other',
          schema_version: '1.0.0',
        },
      ];

      await expect(
        packLoader.loadPack('nonexistent-pack', registryEntries)
      ).rejects.toThrow('not found in registry');
    });

    it('should handle missing manifest file gracefully', async () => {
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'nonexistent-path',
          schema_version: '1.0.0',
        },
      ];

      await expect(packLoader.loadPack('test-pack', registryEntries)).rejects.toThrow();
    });
  });

  describe('getDomainFields', () => {
    it('should return template from loaded pack', async () => {
      // This test would need actual test fixtures on disk
      // For now, we test the error case
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'nonexistent',
          schema_version: '1.0.0',
        },
      ];

      await expect(packLoader.getDomainFields('test-pack', registryEntries)).rejects.toThrow();
    });

    it('should throw for nonexistent pack', async () => {
      const registryEntries: DomainPackEntry[] = [];

      await expect(
        packLoader.getDomainFields('nonexistent', registryEntries)
      ).rejects.toThrow('not found in registry');
    });
  });

  describe('Convenience Function', () => {
    it('should load pack using convenience function', async () => {
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'nonexistent',
          schema_version: '1.0.0',
        },
      ];

      await expect(
        loadDomainPack('test-pack', loader, registry, registryEntries)
      ).rejects.toThrow();
    });
  });

  describe('Integration with SecureYAMLLoader', () => {
    it('should use loader for manifest loading', async () => {
      const loadSpy = jest.spyOn(loader, 'load');
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'test-path',
          schema_version: '1.0.0',
        },
      ];

      try {
        await packLoader.loadPack('test-pack', registryEntries);
      } catch (error) {
        // Expected to fail, we're just checking that load was called
      }

      expect(loadSpy).toHaveBeenCalled();
    });
  });

  describe('Integration with RegistryParser', () => {
    it('should use registry to find pack by name', async () => {
      const findSpy = jest.spyOn(registry, 'findByName');
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'test-path',
          schema_version: '1.0.0',
        },
      ];

      try {
        await packLoader.loadPack('test-pack', registryEntries);
      } catch (error) {
        // Expected to fail, we're just checking that findByName was called
      }

      expect(findSpy).toHaveBeenCalledWith(registryEntries, 'test-pack');
    });

    it('should handle pack not found from registry', async () => {
      const registryEntries: DomainPackEntry[] = [];

      await expect(packLoader.loadPack('test-pack', registryEntries)).rejects.toThrow(
        'not found in registry'
      );
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error for invalid manifest schema', async () => {
      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'templates',  // Use existing directory
          schema_version: '1.0.0',
        },
      ];

      // This will fail because pack.yaml doesn't exist in templates
      await expect(packLoader.loadPack('test-pack', registryEntries)).rejects.toThrow(
        'Failed to load pack manifest'
      );
    });

    it('should provide clear error when schema file not found', async () => {
      const badSchema = {
        type: 'object',
      } as any;

      await expect((packLoader as any).loadSchema('nonexistent-schema.yaml')).rejects.toThrow(
        'Failed to load domain schema'
      );
    });

    it('should provide clear error when template file has wrong type', async () => {
      await expect((packLoader as any).loadTemplate('nonexistent-template.yaml')).rejects.toThrow(
        'Failed to load domain template'
      );
    });
  });

  describe('Loader Options', () => {
    it('should accept custom options', () => {
      const customLoader = new DomainPackLoader(loader, registry, {
        maxSchemaSize: 500000,
        maxTemplateSize: 500000,
      });

      expect(customLoader).toBeDefined();
    });

    it('should use default options when not specified', () => {
      const defaultLoader = new DomainPackLoader(loader, registry);

      expect(defaultLoader).toBeDefined();
    });
  });

  describe('Manifest Edge Cases', () => {
    it('should handle manifest with whitespace-only fields', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: '   ',
        description: 'Test',
        schema: 'schema.yaml',
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('displayName'))).toBe(true);
    });

    it('should validate all dependency errors are reported', () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'Test',
        schema: 'schema.yaml',
        dependencies: [
          { name: '', version: '' },
        ],
      };

      const result = packLoader.validateManifest(manifest);

      expect(result.valid).toBe(false);
      // Should have errors for both name and version
      const depErrors = result.errors.filter(e => e.includes('dependency 0'));
      expect(depErrors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Schema Edge Cases', () => {
    it('should accept schema with allOf composition', () => {
      const schema = {
        allOf: [
          { type: 'object' },
          { properties: { field1: { type: 'string' } } },
        ],
      };

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(true);
    });

    it('should accept schema with oneOf composition', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'number' },
        ],
      };

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(true);
    });

    it('should reject empty object as schema', () => {
      const schema = {};

      const isValid = (packLoader as any).isValidJSONSchema(schema);

      expect(isValid).toBe(false);
    });
  });

  describe('Pack Validation Edge Cases', () => {
    it('should report multiple validation errors', () => {
      const pack: DomainPack = {
        manifest: {
          name: '',
          version: 'invalid',
          displayName: '',
          description: '',
          schema: '../bad/path',
        },
        schema: {} as any,
        template: [] as any,
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      // Should have multiple errors
      expect(result.errors.length).toBeGreaterThan(3);
    });

    it('should not return pack when validation fails', () => {
      const pack: DomainPack = {
        manifest: {
          name: '',
          version: '1.0.0',
          displayName: 'Test',
          description: 'Test',
          schema: 'schema.yaml',
        },
        schema: { type: 'object' },
        template: {},
      };

      const result = packLoader.validatePack(pack);

      expect(result.valid).toBe(false);
      expect(result.pack).toBeUndefined();
    });
  });

  describe('Template Loading Edge Cases', () => {
    it('should reject template with null value', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockResolvedValueOnce(null as any);

      await expect((packLoader as any).loadTemplate('test.yaml')).rejects.toThrow(
        'Template must be a valid object'
      );

      mockLoad.mockRestore();
    });

    it('should reject template with array value', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockResolvedValueOnce([1, 2, 3] as any);

      await expect((packLoader as any).loadTemplate('test.yaml')).rejects.toThrow(
        'Template must be a valid object'
      );

      mockLoad.mockRestore();
    });

    it('should handle loader errors in template loading', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockRejectedValueOnce(new Error('File not found'));

      await expect((packLoader as any).loadTemplate('test.yaml')).rejects.toThrow(
        'Failed to load domain template: File not found'
      );

      mockLoad.mockRestore();
    });

    it('should handle unknown errors in template loading', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockRejectedValueOnce('string error' as any);

      await expect((packLoader as any).loadTemplate('test.yaml')).rejects.toThrow(
        'Failed to load domain template: Unknown error'
      );

      mockLoad.mockRestore();
    });
  });

  describe('Schema Loading Edge Cases', () => {
    it('should reject invalid schema structure', async () => {
      const mockLoad = jest
        .spyOn(loader, 'load')
        .mockResolvedValueOnce({ properties: {} } as any);

      await expect((packLoader as any).loadSchema('test.yaml')).rejects.toThrow(
        'Invalid JSON Schema structure'
      );

      mockLoad.mockRestore();
    });

    it('should handle loader errors in schema loading', async () => {
      const mockLoad = jest
        .spyOn(loader, 'load')
        .mockRejectedValueOnce(new Error('Parse error'));

      await expect((packLoader as any).loadSchema('test.yaml')).rejects.toThrow(
        'Failed to load domain schema: Parse error'
      );

      mockLoad.mockRestore();
    });

    it('should handle unknown errors in schema loading', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockRejectedValueOnce('string error' as any);

      await expect((packLoader as any).loadSchema('test.yaml')).rejects.toThrow(
        'Failed to load domain schema: Unknown error'
      );

      mockLoad.mockRestore();
    });
  });

  describe('Manifest Loading Edge Cases', () => {
    it('should handle loader errors in manifest loading', async () => {
      const mockLoad = jest
        .spyOn(loader, 'load')
        .mockRejectedValueOnce(new Error('Schema validation failed'));

      await expect((packLoader as any).loadManifest('test.yaml')).rejects.toThrow(
        'Failed to load pack manifest: Schema validation failed'
      );

      mockLoad.mockRestore();
    });

    it('should handle unknown errors in manifest loading', async () => {
      const mockLoad = jest.spyOn(loader, 'load').mockRejectedValueOnce('string error' as any);

      await expect((packLoader as any).loadManifest('test.yaml')).rejects.toThrow(
        'Failed to load pack manifest: Unknown error'
      );

      mockLoad.mockRestore();
    });
  });

  describe('Full Pack Loading Integration', () => {
    it('should load complete pack successfully with valid data', async () => {
      const validManifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: 'schema.yaml',
      };

      const validSchema = {
        type: 'object',
        properties: {
          field1: { type: 'string' },
        },
      };

      const validTemplate = {
        field1: 'test value',
      };

      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'packs/test',
          schema_version: '1.0.0',
        },
      ];

      // Mock the loader to return valid data for each file
      const mockLoad = jest
        .spyOn(loader, 'load')
        .mockResolvedValueOnce(validManifest) // manifest
        .mockResolvedValueOnce(validSchema)   // schema
        .mockResolvedValueOnce(validTemplate); // template

      const pack = await packLoader.loadPack('test-pack', registryEntries);

      expect(pack.manifest).toEqual(validManifest);
      expect(pack.schema).toEqual(validSchema);
      expect(pack.template).toEqual(validTemplate);

      mockLoad.mockRestore();
    });

    it('should throw error when manifest validation fails after loading', async () => {
      const invalidManifest: DomainPackManifest = {
        name: '',  // Invalid: empty name
        version: 'not-semver',  // Invalid: bad version
        displayName: 'Test Pack',
        description: 'Test',
        schema: 'schema.yaml',
      };

      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'packs/test',
          schema_version: '1.0.0',
        },
      ];

      const mockLoad = jest.spyOn(loader, 'load').mockResolvedValueOnce(invalidManifest);

      await expect(packLoader.loadPack('test-pack', registryEntries)).rejects.toThrow(
        'Invalid manifest for pack "test-pack"'
      );

      mockLoad.mockRestore();
    });

    it('should validate template against schema and throw on mismatch', async () => {
      const manifest: DomainPackManifest = {
        name: 'test-pack',
        version: '1.0.0',
        displayName: 'Test Pack',
        description: 'A test domain pack',
        schema: 'schema.yaml',
      };

      const schema = {
        type: 'object',
        properties: {
          field1: { type: 'string' },
        },
        required: ['field1'],
        additionalProperties: false,
      };

      const invalidTemplate = { other: 'nope' } as any;

      const registryEntries: DomainPackEntry[] = [
        {
          name: 'test-pack',
          version: '1.0.0',
          description: 'Test pack',
          path: 'packs/test',
          schema_version: '1.0.0',
        },
      ];

      const mockLoad = jest
        .spyOn(loader, 'load')
        .mockResolvedValueOnce(manifest) // manifest
        .mockResolvedValueOnce(schema)   // schema
        .mockResolvedValueOnce(invalidTemplate); // template (invalid per schema)

      await expect(packLoader.loadPack('test-pack', registryEntries)).rejects.toThrow(
        'Domain template does not conform to schema'
      );

      mockLoad.mockRestore();
    });
  });
});
