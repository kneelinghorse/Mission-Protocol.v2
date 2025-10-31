/**
 * Domain Pack Loader and Validator
 *
 * Loads domain pack manifests, validates schemas, and returns domain-specific
 * fields ready for template merging.
 *
 * Security Features:
 * - Uses SecureYAMLLoader for safe file loading
 * - Validates pack manifests against schema
 * - Validates domain schemas are valid JSON Schema
 * - Integrates with RegistryParser for pack discovery
 *
 * @module domains/domain-pack-loader
 * @version 1.0
 */

import * as path from 'path';
import { SecureYAMLLoader } from '../loaders/yaml-loader';
import { RegistryParser } from '../registry/registry-parser';
import { DomainPackEntry } from '../types/registry';
import { JSONSchema } from '../types/schemas';
import { isValidSemVer } from '../registry/semver-validator';
import {
  DomainPack,
  DomainPackManifest,
  DomainPackValidationResult,
  DomainPackLoaderOptions,
} from './types';
import Ajv, { ValidateFunction } from 'ajv';
import { ErrorHandler } from '../errors/handler';
import { DomainError } from '../errors/domain-error';
import { MissionProtocolError } from '../errors/mission-error';

/**
 * JSON Schema for pack.yaml manifest validation
 */
const PACK_MANIFEST_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    version: { type: 'string', minLength: 1 },
    displayName: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    author: { type: 'string' },
    schema: { type: 'string', minLength: 1 },
    dependencies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          version: { type: 'string', minLength: 1 },
        },
        required: ['name', 'version'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'version', 'displayName', 'description', 'schema'],
  additionalProperties: false,
};

/**
 * DomainPackLoader
 *
 * Loads and validates domain packs from the filesystem
 */
export class DomainPackLoader {
  private loader: SecureYAMLLoader;
  private registry: RegistryParser;
  private options: Required<DomainPackLoaderOptions>;
  private ajv: Ajv;
  private schemaValidatorCache: Map<string, ValidateFunction<Record<string, unknown>>>;
  private packCache: Map<string, DomainPack>;
  private packLoadingPromises: Map<string, Promise<DomainPack>>;

  constructor(
    loader: SecureYAMLLoader,
    registry: RegistryParser,
    options?: DomainPackLoaderOptions
  ) {
    this.loader = loader;
    this.registry = registry;
    this.options = {
      maxSchemaSize: options?.maxSchemaSize ?? 1024 * 1024, // 1MB default
      maxTemplateSize: options?.maxTemplateSize ?? 1024 * 1024, // 1MB default
    };
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.schemaValidatorCache = new Map();
    this.packCache = new Map();
    this.packLoadingPromises = new Map();
  }

  /**
   * Load a domain pack by name from the registry
   *
   * Algorithm:
   * 1. Find pack in registry by name
   * 2. Load pack.yaml manifest from pack directory
   * 3. Validate manifest structure and SemVer
   * 4. Load and validate domain schema
   * 5. Load domain template (domainFields)
   * 6. Return complete DomainPack
   *
   * @param packName - Name of the domain pack to load
   * @param registryEntries - Array of registry entries to search
   * @returns Loaded and validated DomainPack
   * @throws Error if pack not found, invalid, or loading fails
   */
  async loadPack(packName: string, registryEntries: DomainPackEntry[]): Promise<DomainPack> {
    if (this.packCache.has(packName)) {
      return this.packCache.get(packName)!;
    }

    if (this.packLoadingPromises.has(packName)) {
      return this.packLoadingPromises.get(packName)!;
    }

    const loadPromise = (async () => {
      const pack = await this.loadPackFromDisk(packName, registryEntries);
      return this.freezePack(pack);
    })();
    this.packLoadingPromises.set(packName, loadPromise);

    try {
      const pack = await loadPromise;
      this.packCache.set(packName, pack);
      return pack;
    } finally {
      this.packLoadingPromises.delete(packName);
    }
  }

  private async loadPackFromDisk(
    packName: string,
    registryEntries: DomainPackEntry[]
  ): Promise<DomainPack> {
    const contextData = { packName };
    try {
      // Step 1: Find pack in registry
      const registryEntry = this.registry.findByName(registryEntries, packName);
      if (!registryEntry) {
        throw new DomainError(`Domain pack "${packName}" not found in registry`, {
          code: 'DOMAIN_NOT_FOUND',
          context: contextData,
        });
      }

      // Step 2: Load pack.yaml manifest
      const manifestPath = path.join(registryEntry.path, 'pack.yaml');
      const manifest = await this.loadManifest(manifestPath);

      // Step 3: Validate manifest
      const validationResult = this.validateManifest(manifest);
      if (!validationResult.valid) {
        throw new DomainError(`Invalid manifest for pack "${packName}"`, {
          code: 'DOMAIN_INVALID',
          context: {
            ...contextData,
            errors: validationResult.errors,
          },
        });
      }

      // Step 4: Load domain schema
      const schemaPath = path.join(registryEntry.path, manifest.schema);
      const schema = await this.loadSchema(schemaPath);

      // Step 5: Load domain template
      const templatePath = path.join(registryEntry.path, 'template.yaml');
      const template = await this.loadTemplate(templatePath);

      // Validate template against schema for safety before returning
      const templateValidation = this.validateTemplateAgainstSchema(template, schema, packName);
      if (!templateValidation.valid) {
        throw new DomainError('Domain template does not conform to schema', {
          code: 'DOMAIN_INVALID',
          context: {
            ...contextData,
            errors: templateValidation.errors,
          },
        });
      }

      // Step 6: Return complete pack
      return {
        manifest,
        schema,
        template,
      };
    } catch (error) {
      if (error instanceof DomainError || error instanceof MissionProtocolError) {
        throw error;
      }
      throw ErrorHandler.wrap(
        error,
        'domains.load_pack',
        {
          module: 'domains/domain-pack-loader',
          data: contextData,
        },
        {
          userMessage: `Failed to load domain pack "${packName}".`,
          fallbackMessage: `Failed to load domain pack "${packName}".`,
        }
      );
    }
  }

  /**
   * Load pack.yaml manifest file
   *
   * @param manifestPath - Relative path to pack.yaml
   * @returns Parsed manifest
   * @throws Error if manifest cannot be loaded or is invalid
   */
  private async loadManifest(manifestPath: string): Promise<DomainPackManifest> {
    try {
      const manifest = await this.loader.load<DomainPackManifest>(
        manifestPath,
        PACK_MANIFEST_SCHEMA
      );
      return manifest;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new DomainError(`Failed to load pack manifest: ${reason}`, {
        context: {
          module: 'domains/domain-pack-loader',
          manifestPath,
          operation: 'domains.load_manifest',
        },
        cause: error,
      });
    }
  }

  /**
   * Validate a domain pack manifest
   *
   * Validates:
   * - Required fields are non-empty
   * - SemVer format for version
   * - Schema path is relative (no traversal)
   * - Dependencies have valid SemVer versions
   *
   * @param manifest - Manifest to validate
   * @returns Validation result with errors if invalid
   */
  validateManifest(manifest: DomainPackManifest): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!manifest.name || manifest.name.trim().length === 0) {
      errors.push('name is required and cannot be empty');
    }

    if (!manifest.version || manifest.version.trim().length === 0) {
      errors.push('version is required and cannot be empty');
    } else if (!isValidSemVer(manifest.version)) {
      errors.push(`version "${manifest.version}" is not valid SemVer (expected format: X.Y.Z)`);
    }

    if (!manifest.displayName || manifest.displayName.trim().length === 0) {
      errors.push('displayName is required and cannot be empty');
    }

    if (!manifest.description || manifest.description.trim().length === 0) {
      errors.push('description is required and cannot be empty');
    }

    if (!manifest.schema || manifest.schema.trim().length === 0) {
      errors.push('schema is required and cannot be empty');
    } else {
      // Validate schema path is relative (no traversal)
      if (manifest.schema.includes('..') || path.isAbsolute(manifest.schema)) {
        errors.push('schema path must be relative and cannot contain ".."');
      }
    }

    // Validate author if present
    if (manifest.author !== undefined && manifest.author.trim().length === 0) {
      errors.push('author cannot be empty if provided');
    }

    // Validate dependencies if present
    if (manifest.dependencies) {
      manifest.dependencies.forEach((dep, index) => {
        if (!dep.name || dep.name.trim().length === 0) {
          errors.push(`dependency ${index}: name is required`);
        }
        if (!dep.version || dep.version.trim().length === 0) {
          errors.push(`dependency ${index}: version is required`);
        } else if (!isValidSemVer(dep.version)) {
          errors.push(`dependency ${index}: version "${dep.version}" is not valid SemVer`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Load and validate a domain schema file
   *
   * The schema must be a valid JSON Schema that defines the structure
   * of the domainFields object.
   *
   * @param schemaPath - Relative path to schema file
   * @returns Loaded JSON Schema
   * @throws Error if schema cannot be loaded or is invalid
   */
  async loadSchema(schemaPath: string): Promise<JSONSchema> {
    try {
      // Load schema file (can be YAML or JSON)
      const schema = await this.loader.load<JSONSchema>(schemaPath);

      // Validate it's a valid JSON Schema structure
      if (!this.isValidJSONSchema(schema)) {
        throw new DomainError('Invalid JSON Schema structure', {
          code: 'DOMAIN_INVALID',
          context: { schemaPath },
        });
      }

      return schema;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new DomainError(`Failed to load domain schema: ${reason}`, {
        context: {
          module: 'domains/domain-pack-loader',
          schemaPath,
          operation: 'domains.load_schema',
        },
        cause: error,
      });
    }
  }

  /**
   * Load domain template (domainFields structure)
   *
   * @param templatePath - Relative path to template.yaml
   * @returns Domain-specific fields object
   * @throws Error if template cannot be loaded
   */
  private async loadTemplate(templatePath: string): Promise<Record<string, unknown>> {
    try {
      const template = await this.loader.load<Record<string, unknown>>(templatePath);

      // Ensure template is an object
      if (typeof template !== 'object' || template === null || Array.isArray(template)) {
        throw new DomainError('Template must be a valid object', {
          code: 'DOMAIN_INVALID',
          context: { templatePath },
        });
      }

      return template;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new DomainError(`Failed to load domain template: ${reason}`, {
        context: {
          module: 'domains/domain-pack-loader',
          templatePath,
          operation: 'domains.load_template',
        },
        cause: error,
      });
    }
  }

  /**
   * Validate domain template object against its JSON Schema
   */
  private validateTemplateAgainstSchema(
    template: Record<string, unknown>,
    schema: JSONSchema,
    cacheKey: string
  ): { valid: boolean; errors: string[] } {
    try {
      const validate = this.getSchemaValidator(cacheKey, schema);
      const ok = validate(template);
      if (!ok) {
        const errs = (validate.errors || []).map((e) => this.ajv.errorsText([e]));
        return { valid: false, errors: errs };
      }
      return { valid: true, errors: [] };
    } catch (e) {
      return { valid: false, errors: [e instanceof Error ? e.message : 'Unknown schema error'] };
    }
  }

  /**
   * Validate a complete domain pack
   *
   * Validates:
   * - Manifest is valid
   * - Schema is valid JSON Schema
   * - Template matches schema (if schema validation is enabled)
   *
   * @param pack - Domain pack to validate
   * @returns Validation result
   */
  validatePack(pack: DomainPack): DomainPackValidationResult {
    const errors: string[] = [];

    // Validate manifest
    const manifestValidation = this.validateManifest(pack.manifest);
    if (!manifestValidation.valid) {
      errors.push(...manifestValidation.errors);
    }

    // Validate schema
    if (!this.isValidJSONSchema(pack.schema)) {
      errors.push('Invalid JSON Schema structure');
    }

    // Validate template is an object
    if (
      typeof pack.template !== 'object' ||
      pack.template === null ||
      Array.isArray(pack.template)
    ) {
      errors.push('Template must be a valid object');
    }

    // Could add template validation against schema here if needed
    // Validate template conforms to schema
    const schemaValidation = this.validateTemplateAgainstSchema(
      pack.template,
      pack.schema,
      pack.manifest.name
    );
    if (!schemaValidation.valid) {
      errors.push(...schemaValidation.errors.map((e) => `Template schema validation: ${e}`));
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [], pack };
  }

  /**
   * Get domain-specific fields from a loaded pack
   *
   * This is the main method for retrieving domainFields that will be
   * merged with the generic mission template.
   *
   * @param packName - Name of the pack
   * @param registryEntries - Registry entries to search
   * @returns Domain-specific fields ready for merging
   */
  async getDomainFields(
    packName: string,
    registryEntries: DomainPackEntry[]
  ): Promise<Record<string, unknown>> {
    const pack = await this.loadPack(packName, registryEntries);
    return pack.template;
  }

  /**
   * Basic JSON Schema structure validation
   *
   * Checks that the object has the minimum required properties
   * to be considered a JSON Schema.
   *
   * @param schema - Object to validate as JSON Schema
   * @returns True if valid JSON Schema structure
   */
  private isValidJSONSchema(schema: unknown): schema is JSONSchema {
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      return false;
    }

    // Must have at least a 'type' property or be a schema composition
    const candidate = schema as Record<string, unknown>;
    const hasType = 'type' in candidate;
    const hasComposition = 'anyOf' in candidate || 'allOf' in candidate || 'oneOf' in candidate;
    const hasRef = '$ref' in candidate;

    return hasType || hasComposition || hasRef;
  }

  private getSchemaValidator(
    cacheKey: string,
    schema: JSONSchema
  ): ValidateFunction<Record<string, unknown>> {
    const cached = this.schemaValidatorCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const validator = this.ajv.compile(schema) as ValidateFunction<Record<string, unknown>>;
    this.schemaValidatorCache.set(cacheKey, validator);
    return validator;
  }

  private freezePack(pack: DomainPack): DomainPack {
    const frozenPack = {
      manifest: this.deepFreeze({ ...pack.manifest }),
      schema: this.deepFreeze(pack.schema),
      template: this.deepFreeze(pack.template),
    } as DomainPack;
    return Object.freeze(frozenPack) as DomainPack;
  }

  private deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object') {
      if (Object.isFrozen(value)) {
        return value;
      }
      Object.freeze(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          this.deepFreeze(item);
        }
      } else {
        for (const item of Object.values(value as Record<string, unknown>)) {
          this.deepFreeze(item);
        }
      }
    }
    return value;
  }
}

/**
 * Convenience function for loading a domain pack
 *
 * @param packName - Name of the pack to load
 * @param loader - SecureYAMLLoader instance
 * @param registry - RegistryParser instance
 * @param registryEntries - Registry entries to search
 * @param options - Optional loader configuration
 * @returns Loaded DomainPack
 */
export async function loadDomainPack(
  packName: string,
  loader: SecureYAMLLoader,
  registry: RegistryParser,
  registryEntries: DomainPackEntry[],
  options?: DomainPackLoaderOptions
): Promise<DomainPack> {
  const packLoader = new DomainPackLoader(loader, registry, options);
  return packLoader.loadPack(packName, registryEntries);
}
