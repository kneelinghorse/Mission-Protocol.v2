import { describe, expect, test } from '@jest/globals';
import type {
  DomainPackEntry,
  Registry,
  ValidationResult,
  SemVerComponents,
} from '../../src/types/registry';

const ensureEntry = (entry: DomainPackEntry): DomainPackEntry => entry;
const ensureRegistry = (registry: Registry): Registry => registry;
const ensureValidationResult = (result: ValidationResult): ValidationResult => result;
const ensureSemVer = (components: SemVerComponents): SemVerComponents => components;

describe('types/registry', () => {
  test('represents a domain pack entry with required metadata', () => {
    const entry = ensureEntry({
      name: 'ai-risk-assessment',
      description: 'Assess risks before deploying AI systems',
      version: '1.0.0',
      path: './domains/ai-risk',
      schema_version: '2024.01',
    });

    expect(entry.name).toBe('ai-risk-assessment');
    expect(entry.description).toContain('risks');
    expect(entry.schema_version).toBe('2024.01');
  });

  test('guards registry shape containing domain entries', () => {
    const registry = ensureRegistry({
      domains: [
        {
          name: 'mission-analysis',
          description: 'Analyze mission data',
          version: '0.2.0',
          path: './domains/mission-analysis',
          schema_version: '2023.09',
        },
      ],
    });

    expect(registry.domains).toHaveLength(1);
    expect(registry.domains[0].path).toBe('./domains/mission-analysis');
  });

  test('captures validation results with errors when invalid', () => {
    const validation = ensureValidationResult({
      valid: false,
      errors: ['path missing', 'invalid schema version'],
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('path missing');
  });

  test('exposes parsed semantic version components', () => {
    const semver = ensureSemVer({
      major: 1,
      minor: 4,
      patch: 2,
      raw: '1.4.2',
    });

    expect(semver.major).toBe(1);
    expect(semver.raw).toBe('1.4.2');
  });
});
