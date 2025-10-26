import { promises as fs } from 'fs';
import path from 'path';
import {
  safeFilePath,
  missionId,
  domainName,
  yamlContent,
  jsonContent,
} from '../../src/validation/common';
import { SanitizationError, SchemaError } from '../../src/validation/errors';
import { ensureDir, ensureTempDir, removeDir } from '../../src/utils/fs';

describe('validation/common', () => {
  describe('safeFilePath', () => {
    it('sanitizes relative paths by normalizing segments', async () => {
      const result = await safeFilePath('./templates/../templates/sample.yaml', {
        allowRelative: true,
      });
      expect(result).toBe(path.normalize('templates/sample.yaml'));
    });

    it('rejects paths that escape the base directory', async () => {
      await expect(
        safeFilePath('../etc/passwd', { allowRelative: true, baseDir: '/srv/app' })
      ).rejects.toThrow(SanitizationError);
    });

    it('rejects paths exceeding max length', async () => {
      const longName = 'a'.repeat(20);
      await expect(
        safeFilePath(longName, { maxLength: 10 })
      ).rejects.toThrow(SanitizationError);
    });

    it('rejects parent directory traversals', async () => {
      await expect(safeFilePath('foo/../..')).rejects.toThrow(SanitizationError);
    });

    it('requires absolute path when allowRelative=false', async () => {
      await expect(
        safeFilePath('relative/path.yaml', { allowRelative: false })
      ).rejects.toThrow(SanitizationError);
    });

    it('enforces allowed extensions when provided', async () => {
      await expect(
        safeFilePath('templates/sample.txt', {
          allowRelative: true,
          allowedExtensions: ['.yaml', '.yml'],
        })
      ).rejects.toThrow(SanitizationError);
    });

    it('rejects paths that resolve outside the base directory via symlink', async () => {
      const tempRoot = await ensureTempDir('safe-path-');
      const baseDir = path.join(tempRoot, 'base');
      const outsideDir = path.join(tempRoot, 'outside');

      await ensureDir(baseDir);
      await ensureDir(outsideDir);

      const symlinkPath = path.join(baseDir, 'link');
      await fs.symlink(outsideDir, symlinkPath, 'dir');

      try {
        await expect(
          safeFilePath(path.join('link', 'payload.json'), {
            allowRelative: true,
            baseDir,
          })
        ).rejects.toThrow(SanitizationError);
      } finally {
        await removeDir(tempRoot, { recursive: true, force: true });
      }
    });

    it('allows symlinks when explicitly permitted', async () => {
      const tempRoot = await ensureTempDir('safe-path-allow-symlink-');
      const baseDir = path.join(tempRoot, 'base');
      const outsideDir = path.join(tempRoot, 'outside');

      await ensureDir(baseDir);
      await ensureDir(outsideDir);

      const symlinkPath = path.join(baseDir, 'link');
      await fs.symlink(outsideDir, symlinkPath, 'dir');

      try {
        const sanitized = await safeFilePath(path.join('link', 'payload.json'), {
          allowRelative: true,
          baseDir,
          allowSymbolicLinks: true,
        });

        expect(sanitized.endsWith(path.join('link', 'payload.json'))).toBe(true);
      } finally {
        await removeDir(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('missionId', () => {
    it('accepts valid mission identifiers', () => {
      expect(missionId('M02-security')).toBe('M02-security');
    });

    it('rejects malformed mission identifiers', () => {
      expect(() => missionId('mission-02')).toThrow();
    });
  });

  describe('domainName', () => {
    it('enforces lowercase kebab-case names', () => {
      expect(domainName('operations-core')).toBe('operations-core');
      expect(() => domainName('OperationsCore')).toThrow();
    });
  });

  describe('yamlContent', () => {
    it('parses YAML safely', () => {
      const result = yamlContent('foo: bar');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('throws SchemaError on invalid YAML', () => {
      expect(() => yamlContent('foo: [1, 2')).toThrow(SchemaError);
    });
  });

  describe('jsonContent', () => {
    it('parses JSON content', () => {
      const result = jsonContent('{"foo":"bar"}');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('throws SchemaError when JSON is malformed', () => {
      expect(() => jsonContent('{"foo":}')).toThrow(SchemaError);
    });
  });
});
