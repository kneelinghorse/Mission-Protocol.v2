/**
 * Domain Pack Type Definitions
 *
 * Defines interfaces for domain pack manifests, schemas, and loaded packs.
 *
 * @module domains/types
 */

import { JSONSchema } from '../types/schemas';

/**
 * Domain Pack Manifest (pack.yaml)
 * Metadata and configuration for a domain-specific pack
 */
export interface DomainPackManifest {
  /** Globally unique identifier for the pack */
  name: string;

  /** SemVer version (X.Y.Z format) */
  version: string;

  /** Human-readable display name */
  displayName: string;

  /** Description of the pack's purpose */
  description: string;

  /** Optional author information */
  author?: string;

  /** Relative path to the domain schema file */
  schema: string;

  /** Optional pack dependencies */
  dependencies?: Array<{
    name: string;
    version: string;
  }>;
}

/**
 * Loaded Domain Pack
 * Complete pack with manifest, schema, and template data
 */
export interface DomainPack {
  /** Pack manifest metadata */
  manifest: DomainPackManifest;

  /** JSON Schema for domain fields validation */
  schema: JSONSchema;

  /** Domain-specific template fields (the domainFields structure) */
  template: Record<string, unknown>;
}

/**
 * Domain Pack Validation Result
 */
export interface DomainPackValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Array of validation error messages (empty if valid) */
  errors: string[];

  /** The validated pack (if valid) */
  pack?: DomainPack;
}

/**
 * Domain Pack Loader Options
 */
export interface DomainPackLoaderOptions {
  /** Maximum schema file size in bytes (default: 1MB) */
  maxSchemaSize?: number;

  /** Maximum template file size in bytes (default: 1MB) */
  maxTemplateSize?: number;
}
