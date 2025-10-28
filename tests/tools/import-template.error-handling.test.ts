import { describe, expect, jest, test, beforeEach, afterEach } from '@jest/globals';

const mockTemplateImporter = () => {
  const importMock = jest
    .fn(async (..._args: any[]) => undefined)
    .mockName('TemplateImporter.import') as jest.Mock;
  const TemplateImporter = jest.fn().mockImplementation(() => ({
    import: importMock,
  }));
  return { TemplateImporter, importMock };
};

describe('create_template_import error handling (mocked)', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.dontMock('../../src/validation/middleware');
    jest.dontMock('../../src/validation/common');
    jest.dontMock('../../src/import-export/template-importer');
  });

  test('reports detailed validation messages when provided', async () => {
    jest.doMock('../../src/validation/middleware', () => ({
      validateAndSanitize: jest
        .fn(async () => {
          const { ValidationError } = require('../../src/validation/errors');
          throw new ValidationError('Validation failed', {
            data: { messages: ['Field A missing', 'Field B invalid'] },
          });
        })
        .mockName('validateAndSanitize'),
    }));

    jest.doMock('../../src/validation/common', () => ({
      safeFilePath: jest.fn(),
    }));

    const importerMock = mockTemplateImporter();
    jest.doMock('../../src/import-export/template-importer', () => importerMock);

    const { importTemplate } = await import('../../src/tools/import-template');
    const result = await importTemplate({ templatePath: 'invalid.yaml' });

    expect(result.success).toBe(false);
    expect(result.validationReport.errors).toEqual(['Field A missing', 'Field B invalid']);
    expect(result.message).toContain('Field A missing');
  });

  test('falls back to issue messages when data messages absent', async () => {
    jest.doMock('../../src/validation/middleware', () => ({
      validateAndSanitize: jest
        .fn(async () => {
          const { ValidationError } = require('../../src/validation/errors');
          throw new ValidationError('Validation failed', {
            issues: [
              {
                code: 'custom',
                message: 'custom issue message',
                path: ['templatePath'],
              },
            ] as any,
          });
        })
        .mockName('validateAndSanitize'),
    }));

    jest.doMock('../../src/validation/common', () => ({
      safeFilePath: jest.fn(),
    }));

    const importerMock = mockTemplateImporter();
    jest.doMock('../../src/import-export/template-importer', () => importerMock);

    const { importTemplate } = await import('../../src/tools/import-template');
    const result = await importTemplate({ templatePath: 'invalid.yaml' });

    expect(result.success).toBe(false);
    expect(result.validationReport.errors[0]).toContain('custom issue message');
    expect(result.message).toContain('custom issue message');
  });

  test('handles unexpected errors from importer', async () => {
    jest.doMock('../../src/validation/middleware', () => ({
      validateAndSanitize: jest
        .fn(async () => ({
          templatePath: 'valid.yaml',
          skipSignatureVerification: false,
        }))
        .mockName('validateAndSanitize'),
    }));

    jest.doMock('../../src/validation/common', () => ({
      safeFilePath: jest.fn(async (value: string) => value).mockName('safeFilePath'),
    }));

    const importerMock = mockTemplateImporter();
    importerMock.importMock.mockImplementation(async () => {
      throw new Error('Importer boom');
    });
    jest.doMock('../../src/import-export/template-importer', () => importerMock);

    const { importTemplate } = await import('../../src/tools/import-template');
    const result = await importTemplate({ templatePath: 'valid.yaml' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Importer boom');
    expect(result.validationReport.errors).toEqual(['Importer boom']);
  });
});
