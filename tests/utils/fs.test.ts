import { promises as fs } from 'fs';
import * as path from 'path';
import { pathExists, ensureTempDir, removeDir, writeFileAtomic, removeFile, runWithConcurrency } from '../../src/utils/fs';

describe('utils/fs pathExists', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await ensureTempDir('fs-utils-test-');
  });

  afterAll(async () => {
    await removeDir(tempDir, { recursive: true, force: true });
  });

  it('returns true for existing file', async () => {
    const filePath = path.join(tempDir, 'exists.txt');
    await fs.writeFile(filePath, 'hello');

    await expect(pathExists(filePath)).resolves.toBe(true);
  });

  it('returns false for missing path (ENOENT)', async () => {
    const missingPath = path.join(tempDir, 'missing.txt');
    await expect(pathExists(missingPath)).resolves.toBe(false);
  });

  it('returns false when parent is not a directory (ENOTDIR)', async () => {
    const filePath = path.join(tempDir, 'afile.txt');
    await fs.writeFile(filePath, 'content');
    const childPath = path.join(filePath, 'child.txt');

    await expect(pathExists(childPath)).resolves.toBe(false);
  });

  it('rethrows unexpected access errors', async () => {
    const error = new Error('permission denied') as NodeJS.ErrnoException;
    error.code = 'EACCES';

    const accessSpy = jest.spyOn(fs, 'access').mockRejectedValue(error);

    await expect(pathExists('/protected/path')).rejects.toThrow('permission denied');

    accessSpy.mockRestore();
  });

  it('writeFileAtomic persists data', async () => {
    const targetDir = path.join(tempDir, 'atomic');
    await fs.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, 'data.txt');

    await writeFileAtomic(targetFile, 'test-data');

    const content = await fs.readFile(targetFile, 'utf-8');
    expect(content).toBe('test-data');
  });

  it('writeFileAtomic falls back on EXDEV', async () => {
    const targetDir = path.join(tempDir, 'atomic-exdev');
    await fs.mkdir(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, 'data.txt');

    const exdevError = new Error('cross-device') as NodeJS.ErrnoException;
    exdevError.code = 'EXDEV';

    const renameSpy = jest.spyOn(fs, 'rename').mockRejectedValue(exdevError);
    const copySpy = jest.spyOn(fs, 'copyFile').mockResolvedValue(undefined);
    const unlinkSpy = jest.spyOn(fs, 'unlink').mockResolvedValue(undefined);

    await writeFileAtomic(targetFile, 'fallback-data');

    expect(copySpy).toHaveBeenCalled();

    renameSpy.mockRestore();
    copySpy.mockRestore();
    unlinkSpy.mockRestore();
  });

  it('removeFile ignores missing file', async () => {
    await expect(removeFile(path.join(tempDir, 'missing.txt'))).resolves.toBeUndefined();
  });

  it('removeFile deletes existing file', async () => {
    const filePath = path.join(tempDir, 'remove-me.txt');
    await fs.writeFile(filePath, 'to-remove');

    await removeFile(filePath);

    await expect(pathExists(filePath)).resolves.toBe(false);
  });

  it('runWithConcurrency executes tasks with limit', async () => {
    const tasks = [
      async () => 1,
      async () => 2,
      async () => 3,
    ];

    const results = await runWithConcurrency(tasks, 2);

    expect(results).toEqual([1, 2, 3]);
  });

  it('runWithConcurrency throws when limit is invalid', async () => {
    await expect(runWithConcurrency([async () => 1], 0)).rejects.toThrow('limit');
  });
});
