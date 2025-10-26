/**
 * Registry Parser
 *
 * Securely loads and validates registry.yaml files containing domain pack metadata.
 * Uses SecureYAMLLoader for safe file loading and validates SemVer compliance.
 *
 * @module registry/registry-parser
 */

import { SecureYAMLLoader } from '../loaders/yaml-loader';
import { DomainPackEntry, Registry, ValidationResult } from '../types/registry';
import { JSONSchema } from '../types/schemas';
import { isValidSemVer, areVersionsCompatible } from './semver-validator';

/**
 * JSON Schema for registry.yaml structure
 */
const REGISTRY_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    domains: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          version: { type: 'string', minLength: 1 },
          author: { type: 'string' },
          path: { type: 'string', minLength: 1 },
          schema_version: { type: 'string', minLength: 1 },
        },
        required: ['name', 'description', 'version', 'path', 'schema_version'],
        additionalProperties: false,
      },
    },
  },
  required: ['domains'],
  additionalProperties: false,
};

/**
 * RegistryParser
 *
 * Loads and validates domain pack registry files
 */
export class RegistryParser {
  private loader: SecureYAMLLoader;

  constructor(loader: SecureYAMLLoader) {
    this.loader = loader;
  }

  /**
   * Load and parse a registry.yaml file
   *
   * @param registryPath - Path to registry.yaml file (relative to loader's baseDir)
   * @returns Array of validated domain pack entries
   * @throws Error if file cannot be loaded or validation fails
   */
  async loadRegistry(registryPath: string): Promise<DomainPackEntry[]> {
    // Load with schema validation
    const registry = await this.loader.load<Registry>(registryPath, REGISTRY_SCHEMA);

    // Validate each entry
    const validatedEntries: DomainPackEntry[] = [];
    const errors: string[] = [];

    for (let i = 0; i < registry.domains.length; i++) {
      const entry = registry.domains[i];
      const result = this.validateEntry(entry);

      if (result.valid && result.entry) {
        validatedEntries.push(result.entry);
      } else {
        errors.push(`Entry ${i} (${entry.name || 'unknown'}): ${result.errors.join(', ')}`);
      }
    }

    // If any entries failed validation, throw error with all details
    if (errors.length > 0) {
      throw new Error(`Registry validation failed:\n${errors.join('\n')}`);
    }

    return validatedEntries;
  }

  /**
   * Validate a single domain pack entry
   *
   * @param entry - Domain pack entry to validate
   * @returns Validation result with errors if invalid
   */
  validateEntry(entry: DomainPackEntry): ValidationResult {
    const errors: string[] = [];

    // Validate required fields (schema ensures they exist, but check content)
    if (!entry.name || entry.name.trim().length === 0) {
      errors.push('name is required and cannot be empty');
    }

    if (!entry.description || entry.description.trim().length === 0) {
      errors.push('description is required and cannot be empty');
    }

    if (!entry.path || entry.path.trim().length === 0) {
      errors.push('path is required and cannot be empty');
    }

    if (!entry.schema_version || entry.schema_version.trim().length === 0) {
      errors.push('schema_version is required and cannot be empty');
    }

    // Validate SemVer format for version
    if (!isValidSemVer(entry.version)) {
      errors.push(
        `version "${entry.version}" is not valid SemVer (expected format: X.Y.Z, e.g., 1.0.0)`
      );
    }

    // Validate SemVer format for schema_version
    if (!isValidSemVer(entry.schema_version)) {
      errors.push(
        `schema_version "${entry.schema_version}" is not valid SemVer (expected format: X.Y.Z, e.g., 1.0.0)`
      );
    }

    // Validate path doesn't contain traversal sequences
    if (entry.path && (entry.path.includes('..') || entry.path.startsWith('/'))) {
      errors.push('path cannot contain ".." or start with "/" (must be relative path)');
    }

    // Validate author if present
    if (entry.author !== undefined && entry.author.trim().length === 0) {
      errors.push('author cannot be empty if provided');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, errors: [], entry };
  }

  /**
   * Filter domain pack entries by schema version compatibility
   *
   * @param entries - Array of domain pack entries
   * @param targetVersion - Target schema version to filter by
   * @returns Entries compatible with the target schema version
   */
  filterBySchemaVersion(entries: DomainPackEntry[], targetVersion: string): DomainPackEntry[] {
    // Validate target version
    if (!isValidSemVer(targetVersion)) {
      throw new Error(
        `Invalid target schema version "${targetVersion}". Expected SemVer format (X.Y.Z)`
      );
    }

    return entries.filter(entry => {
      // Entry schema validation already ensures schema_version is valid SemVer
      return areVersionsCompatible(entry.schema_version, targetVersion);
    });
  }

  /**
   * Get entries by exact schema version
   *
   * @param entries - Array of domain pack entries
   * @param version - Exact schema version to match
   * @returns Entries with exact schema version match
   */
  getByExactSchemaVersion(entries: DomainPackEntry[], version: string): DomainPackEntry[] {
    if (!isValidSemVer(version)) {
      throw new Error(`Invalid schema version "${version}". Expected SemVer format (X.Y.Z)`);
    }

    return entries.filter(entry => entry.schema_version === version);
  }

  /**
   * Find a domain pack entry by name
   *
   * @param entries - Array of domain pack entries
   * @param name - Name of the domain pack to find
   * @returns The domain pack entry or undefined if not found
   */
  findByName(entries: DomainPackEntry[], name: string): DomainPackEntry | undefined {
    return entries.find(entry => entry.name === name);
  }
}
