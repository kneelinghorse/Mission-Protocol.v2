import { describe, it, expect, jest } from '@jest/globals';
import { importTemplate } from '../../src/tools/import-template';
import { TemplateImporter } from '../../src/import-export/template-importer';

describe('create_template_import MCP tool', () => {
  it('rejects missing templatePath parameter', async () => {
    // @ts-expect-error intentionally omitting required parameter
    const result = await importTemplate({});

    expect(result.success).toBe(false);
    expect(result.message).toContain('Parameter "templatePath" is required');
  });

  it('rejects invalid trust level', async () => {
    const result = await importTemplate({
      templatePath: 'fake.yaml',
      // @ts-expect-error intentional invalid trust level for coverage
      trustLevel: 'invalid-level',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Invalid trustLevel');
  });

  it('rejects negative resource limits', async () => {
    const memoryResult = await importTemplate({
      templatePath: 'fake.yaml',
      maxResourceMemory: -1,
    });
    expect(memoryResult.success).toBe(false);
    expect(memoryResult.message).toContain('maxResourceMemory');

    const cpuResult = await importTemplate({
      templatePath: 'fake.yaml',
      maxResourceCpu: -2,
    });
    expect(cpuResult.success).toBe(false);
    expect(cpuResult.message).toContain('maxResourceCpu');
  });

  it('warns when signature verification is disabled', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await importTemplate({
      templatePath: 'fake.yaml',
      skipSignatureVerification: true,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Signature verification is DISABLED')
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to load template structure');

    warnSpy.mockRestore();
  });

  it('returns success when the importer resolves a template', async () => {
    const resolvedTemplate = {
      apiVersion: 'mission-template.v1',
      kind: 'MissionTemplate',
      metadata: {
        name: 'stub-template',
        version: '1.0.0',
        author: 'unit-test',
        signature: {
          keyId: 'test-key',
          algorithm: 'PGP-SHA256',
          value: 'c3R1Yi1zaWduYXR1cmU=',
        },
      },
      spec: { objective: 'Stub objective' },
      dependencies: [],
    };

    const dependencies = new Map<string, any>([
      [
        'core',
        {
          metadata: { name: 'core-template', version: '2.1.0', author: 'team' },
        },
      ],
    ]);

    const importSpy = jest.spyOn(TemplateImporter.prototype, 'import').mockResolvedValue({
      template: resolvedTemplate,
      validationReport: {
        valid: true,
        layers: [],
        errors: [],
        warnings: [],
        performanceMs: 12,
        template: resolvedTemplate,
      },
      resolvedDependencies: dependencies as Map<string, any>,
    });

    const result = await importTemplate({
      templatePath: 'stub.yaml',
      skipSignatureVerification: true,
    });

    expect(result.success).toBe(true);
    expect(result.template?.name).toBe('stub-template');
    expect(result.validationReport.valid).toBe(true);
    expect(result.dependencies?.core).toEqual({
      name: 'core-template',
      version: '2.1.0',
    });

    importSpy.mockRestore();
  });
});
