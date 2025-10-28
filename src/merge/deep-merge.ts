/**
 * Deep Merge Logic for Mission Template Composition
 *
 * Deterministic algorithm that merges generic mission templates with
 * domain-specific fields. Ensures same inputs always produce same output.
 *
 * Merge Rules:
 * 1. Dictionaries: recursive merge, domain overrides generic
 * 2. Lists: concatenate (generic first, then domain)
 * 3. Scalars: domain value replaces generic value
 * 4. Null handling: domain null removes generic field
 *
 * @version 1.0
 */

/**
 * Merge strategy options for handling different data types
 */
export type MergeStrategy = 'append' | 'override' | 'unique';

/**
 * Configuration options for the merge algorithm
 */
export interface MergeOptions {
  /** Strategy for merging arrays/lists (default: 'concat') */
  arrayStrategy?: 'concat' | 'replace';

  /** Strategy for list merging (default: 'append') */
  listStrategy?: MergeStrategy;
}

/**
 * Default merge options
 */
const DEFAULT_OPTIONS: Required<MergeOptions> = {
  arrayStrategy: 'concat',
  listStrategy: 'append',
};

/**
 * MissionMerger class - Deterministic deep merge for template composition
 *
 * @example
 * ```typescript
 * const merger = new MissionMerger();
 * const generic = { objective: "Build feature", domainFields: {} };
 * const domain = { domainFields: { techStack: "TypeScript" } };
 * const result = merger.merge(generic, domain);
 * ```
 */
export class MissionMerger {
  /**
   * Merge base object with extension object, creating a new merged object
   *
   * @param base - The base object (generic template)
   * @param extension - The extension object (domain-specific fields)
   * @param options - Optional merge configuration
   * @returns New merged object (does not mutate inputs)
   */
  merge<T>(base: T, extension: unknown, options?: MergeOptions): T {
    const mergeOpts = { ...DEFAULT_OPTIONS, ...options };

    // Handle null/undefined cases
    if (base === null || base === undefined) {
      return extension as T;
    }
    if (extension === null || extension === undefined) {
      return base;
    }

    // Handle arrays
    if (Array.isArray(base) && Array.isArray(extension)) {
      return this.mergeLists(base, extension, mergeOpts) as T;
    }

    // Handle objects
    if (this.isObject(base) && this.isObject(extension)) {
      return this.mergeObjects(base, extension, mergeOpts) as T;
    }

    // Scalars: extension replaces base
    return extension as T;
  }

  /**
   * Merge two objects recursively
   *
   * @param base - Base object
   * @param extension - Extension object
   * @param options - Merge options
   * @returns New merged object
   */
  private mergeObjects(base: object, extension: object, options: Required<MergeOptions>): object {
    const result: Record<string, unknown> = { ...base };

    for (const [key, extensionValue] of Object.entries(extension)) {
      const baseValue = (base as Record<string, unknown>)[key];

      // Skip undefined values (they don't override)
      if (extensionValue === undefined) {
        continue;
      }

      // Domain null removes field
      if (extensionValue === null) {
        delete result[key];
        continue;
      }

      // Merge the value
      result[key] = this.mergeValue(baseValue, extensionValue, options);
    }

    return result;
  }

  /**
   * Merge two arrays/lists
   *
   * @param base - Base array
   * @param extension - Extension array
   * @param options - Merge options
   * @returns New merged array
   */
  private mergeLists(
    base: unknown[],
    extension: unknown[],
    options: Required<MergeOptions>
  ): unknown[] {
    if (options.arrayStrategy === 'replace') {
      return [...extension];
    }

    // Default: concat (generic first, then domain)
    if (options.listStrategy === 'unique') {
      // Remove duplicates while preserving order
      const combined = [...base, ...extension];
      return Array.from(new Set(combined.map((item) => JSON.stringify(item)))).map((item) =>
        JSON.parse(item)
      );
    }

    // Default append strategy
    return [...base, ...extension];
  }

  /**
   * Merge individual values based on their types
   *
   * @param baseValue - Value from base object
   * @param extensionValue - Value from extension object
   * @param options - Merge options
   * @returns Merged value
   */
  private mergeValue(
    baseValue: unknown,
    extensionValue: unknown,
    options: Required<MergeOptions>
  ): unknown {
    // Extension null removes the field
    if (extensionValue === null) {
      return undefined;
    }

    // If base doesn't exist, use extension
    if (baseValue === undefined || baseValue === null) {
      return extensionValue;
    }

    // Arrays
    if (Array.isArray(baseValue) && Array.isArray(extensionValue)) {
      return this.mergeLists(baseValue, extensionValue, options);
    }

    // Objects
    if (this.isObject(baseValue) && this.isObject(extensionValue)) {
      return this.mergeObjects(baseValue, extensionValue, options);
    }

    // Scalars: extension wins
    return extensionValue;
  }

  /**
   * Type guard to check if a value is a plain object (not array, not null)
   *
   * @param value - Value to check
   * @returns True if value is a plain object
   */
  private isObject(value: unknown): value is object {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof RegExp)
    );
  }
}

/**
 * Convenience function for one-off merges
 *
 * @param base - Base object
 * @param extension - Extension object
 * @param options - Optional merge configuration
 * @returns New merged object
 */
export function deepMerge<T>(base: T, extension: unknown, options?: MergeOptions): T {
  const merger = new MissionMerger();
  return merger.merge(base, extension, options);
}
