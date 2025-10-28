import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fsp } from 'fs';
import path from 'path';
import os from 'os';
import {
  pathExists,
  writeFileAtomic,
  removeFile,
  runWithConcurrency,
  ensureDir,
  ensureTempDir,
  removeDir,
  chmod,
} from '../../src/utils/fs';

describe('utils/fs helpers', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'utils-fs-test-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fsp.rm(tempDir, { recursive: true, force: true });
  });

  test('pathExists handles present and missing paths', async () => {
    const existing = path.join(tempDir, 'file.txt');
    await fsp.writeFile(existing, 'hello');

    expect(await pathExists(existing)).toBe(true);
    expect(await pathExists(path.join(tempDir, 'missing.txt'))).toBe(false);
  });

  test('pathExists rethrows unexpected errors', async () => {
    const accessSpy = jest
      .spyOn(fsp, 'access')
      .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    await expect(pathExists('dummy.txt')).rejects.toThrow('permission denied');
    accessSpy.mockRestore();
  });

  test('pathExists treats message-based ENOENT as missing', async () => {
    const accessSpy = jest
      .spyOn(fsp, 'access')
      .mockRejectedValueOnce(new Error('ENOENT: file or directory not found'));

    await expect(pathExists('/missing/by/message')).resolves.toBe(false);
    accessSpy.mockRestore();
  });

  test('pathExists treats ENOTDIR conditions as missing targets', async () => {
    const accessSpy = jest
      .spyOn(fsp, 'access')
      .mockRejectedValueOnce(
        Object.assign(new Error('ENOTDIR: not a directory'), { code: 'ENOTDIR' })
      );

    await expect(pathExists('/bad/directory')).resolves.toBe(false);
    accessSpy.mockRestore();
  });

  test('writeFileAtomic writes file and handles EXDEV fallback', async () => {
    const target = path.join(tempDir, 'atomic.txt');

    const renameSpy = jest.spyOn(fsp, 'rename').mockImplementationOnce(async () => {
      const err: NodeJS.ErrnoException = Object.assign(new Error('Cross-device'), {
        code: 'EXDEV',
      });
      throw err;
    });

    await writeFileAtomic(target, 'content');
    const saved = await fsp.readFile(target, 'utf8');
    expect(saved).toBe('content');
    expect(renameSpy).toHaveBeenCalled();
  });

  test('writeFileAtomic cleans up and rethrows on failure', async () => {
    const target = path.join(tempDir, 'failure.txt');
    const renameSpy = jest.spyOn(fsp, 'rename').mockImplementationOnce(async () => {
      const err: NodeJS.ErrnoException = Object.assign(new Error('rename failed'), {
        code: 'EACCES',
      });
      throw err;
    });
    jest.spyOn(fsp, 'unlink').mockImplementationOnce(async () => {
      throw new Error('cleanup failed');
    });

    await expect(writeFileAtomic(target, 'data')).rejects.toThrow('rename failed');
    expect(renameSpy).toHaveBeenCalled();
  });

  test('removeFile ignores ENOENT errors and rethrows others', async () => {
    const missing = path.join(tempDir, 'absent.txt');
    await expect(removeFile(missing)).resolves.toBeUndefined();

    const unlinkSpy = jest
      .spyOn(fsp, 'unlink')
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EBUSY' }));
    await expect(removeFile(path.join(tempDir, 'locked.txt'))).rejects.toThrow('busy');
    unlinkSpy.mockRestore();
  });

  test('runWithConcurrency enforces limit and executes tasks', async () => {
    const order: number[] = [];
    const tasks = Array.from({ length: 4 }, (_, index) => async () => {
      order.push(index);
      return index * 2;
    });

    const results = await runWithConcurrency(tasks, 2);
    expect(results).toEqual([0, 2, 4, 6]);
    expect(order).toHaveLength(4);

    await expect(runWithConcurrency(tasks, 0)).rejects.toThrow('greater than zero');
  });

  test('directory helpers create, cleanup, and adjust permissions', async () => {
    const nestedDir = path.join(tempDir, 'nested');
    await ensureDir(nestedDir);
    expect(await pathExists(nestedDir)).toBe(true);

    const scratch = await ensureTempDir('utils-fs-scratch-');
    const scratchFile = path.join(scratch, 'mode.txt');
    await fsp.writeFile(scratchFile, 'mode');
    await expect(chmod(scratchFile, 0o644)).resolves.toBeUndefined();

    await removeDir(nestedDir, { recursive: true, force: true });
    await removeDir(scratch, { recursive: true, force: true });

    expect(await pathExists(nestedDir)).toBe(false);
    expect(await pathExists(scratch)).toBe(false);
  });
});
