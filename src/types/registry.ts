/**
 * Registry Type Definitions
 *
 * Defines the structure for domain pack registry entries and validation results.
 *
 * @module types/registry
 */

/**
 * Domain Pack Entry
 * Represents a single domain pack in the registry
 */
export interface DomainPackEntry {
  /** Unique name of the domain pack */
  name: string;

  /** Description of the domain pack's purpose */
  description: string;

  /** SemVer version (X.Y.Z format) */
  version: string;

  /** Optional author information */
  author?: string;

  /** Relative path to the domain pack directory */
  path: string;

  /** Schema version for compatibility checking */
  schema_version: string;
}

/**
 * Registry Structure
 * Contains array of domain pack entries
 */
export interface Registry {
  domains: DomainPackEntry[];
}

/**
 * Validation Result
 * Result of validating a domain pack entry
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;

  /** Array of validation error messages (empty if valid) */
  errors: string[];

  /** The entry that was validated (if valid) */
  entry?: DomainPackEntry;
}

/**
 * SemVer Components
 * Parsed semantic version
 */
export interface SemVerComponents {
  major: number;
  minor: number;
  patch: number;
  raw: string;
}
