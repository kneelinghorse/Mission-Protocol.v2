import { describe, it, expect } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exportTemplate, createTemplateFromMission } from '../../src/tools/export-template';
import { TemplateExporter } from '../../src/import-export/template-exporter';
import { ensureTempDir, pathExists, removeDir } from '../../src/utils/fs';

const metadata = {
  name: 'smoke-template',
  version: '1.0.0',
  author: 'coverage-suite',
  signature: {
    keyId: 'internal-key',
    algorithm: 'PGP-SHA256',
    value: 'ZmFrZS1zaWduYXR1cmU=',
  },
};

describe('get_template_export MCP tool', () => {
  it('exports a mission template to YAML with preview', async () => {
    const baseDir = await ensureTempDir('export-template-');
    const outputPath = 'smoke-template.yaml';
    const template = createTemplateFromMission(
      {
        objective: 'Verify get_template_export success path',
        context: 'Smoke testing harness',
      },
      metadata
    );

    try {
      const result = await exportTemplate({
        template,
        outputPath,
        baseDir,
        format: 'yaml',
      });

      const fullPath = path.join(baseDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(fullPath);
      expect(result.preview).toContain('smoke-template');
      expect(await pathExists(fullPath)).toBe(true);
    } finally {
      await removeDir(baseDir);
    }
  });

  it('exports a mission template to JSON when requested', async () => {
    const baseDir = await ensureTempDir('export-template-json-');
    const outputPath = 'smoke-template.json';
    const template = createTemplateFromMission(
      {
        objective: 'Verify JSON export path',
        context: 'Smoke testing harness',
      },
      metadata
    );

    try {
      const result = await exportTemplate({
        template,
        outputPath,
        baseDir,
        format: 'json',
        pretty: false,
      });

      const fullPath = path.join(baseDir, outputPath);
      const content = await fs.readFile(fullPath, 'utf-8');

      expect(result.success).toBe(true);
      expect(() => JSON.parse(content)).not.toThrow();
    } finally {
      await removeDir(baseDir);
    }
  });

  it('fails when template metadata is missing', async () => {
    const result = await exportTemplate({
      // @ts-expect-error intentional invalid template for coverage
      template: { apiVersion: 'mission-template.v1' },
      outputPath: 'ignored.yaml',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Template must have kind');
  });

  it('respects includeComments=false for YAML exports', async () => {
    const baseDir = await ensureTempDir('export-template-no-comments-');
    const outputPath = 'no-comments.yaml';
    const template = createTemplateFromMission(
      {
        objective: 'Coverage for includeComments=false',
        context: 'Test harness',
      },
      metadata
    );

    try {
      const result = await exportTemplate({
        template,
        outputPath,
        baseDir,
        includeComments: false,
      });

      expect(result.success).toBe(true);
      expect(result.preview).not.toContain('# Mission Template');
    } finally {
      await removeDir(baseDir);
    }
  });

  it('surfaces validation error when exporter fails', async () => {
    const baseDir = await ensureTempDir('export-template-fail-');
    const outputPath = 'fail.yaml';
    const template = createTemplateFromMission(
      {
        objective: 'Force exporter failure branch',
        context: 'Test harness',
      },
      metadata
    );

    const exportSpy = jest.spyOn(TemplateExporter.prototype, 'export').mockResolvedValue(false);

    try {
      const result = await exportTemplate({
        template,
        outputPath,
        baseDir,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Export operation failed');
    } finally {
      exportSpy.mockRestore();
      await removeDir(baseDir);
    }
  });
});
