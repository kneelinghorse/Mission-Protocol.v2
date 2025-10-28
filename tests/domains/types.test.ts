import { describe, expect, test } from '@jest/globals';
import type {
  DomainPackManifest,
  DomainPack,
  DomainPackValidationResult,
  DomainPackLoaderOptions,
} from '../../src/domains/types';

const ensureManifest = (manifest: DomainPackManifest): DomainPackManifest => manifest;
const ensurePack = (pack: DomainPack): DomainPack => pack;
const ensureValidation = (
  validation: DomainPackValidationResult
): DomainPackValidationResult => validation;
const ensureLoaderOptions = (options: DomainPackLoaderOptions): DomainPackLoaderOptions => options;

describe('domains/types', () => {
  test('describes pack manifests with optional dependency list', () => {
    const manifest = ensureManifest({
      name: 'cloud-migration',
      version: '1.0.0',
      displayName: 'Cloud Migration',
      description: 'Move workloads to cloud',
      schema: './schema/cloud.json',
      dependencies: [
        { name: 'network-baseline', version: '1.0.0' },
        { name: 'security-controls', version: '^2.0.0' },
      ],
    });

    expect(manifest.dependencies).toHaveLength(2);
  });

  test('provides domain pack with manifest, schema, and template', () => {
    const pack = ensurePack({
      manifest: ensureManifest({
        name: 'ai-governance',
        version: '0.3.0',
        displayName: 'AI Governance',
        description: 'Ensure responsible AI rollout',
        schema: './schema/ai-governance.json',
      }),
      schema: {
        type: 'object',
        properties: {
          guardrails: { type: 'array' },
        },
      },
      template: { guardrails: ['human oversight'] },
    });

    expect(pack.template.guardrails).toContain('human oversight');
  });

  test('wraps validation result metadata', () => {
    const validation = ensureValidation({
      valid: true,
      errors: [],
    });

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  test('exposes loader options with sensible defaults', () => {
    const options = ensureLoaderOptions({
      maxSchemaSize: 256_000,
      maxTemplateSize: 512_000,
    });

    expect(options.maxSchemaSize).toBe(256_000);
    expect(options.maxTemplateSize).toBe(512_000);
  });
});
