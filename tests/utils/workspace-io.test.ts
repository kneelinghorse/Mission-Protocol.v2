import { promises as fs } from 'fs';
import path from 'path';
import {
  ensureTempDir,
  removeDir,
  writeFileAtomic,
} from '../../src/utils/fs';
import { writeFileAtomicWithBackup } from '../../src/utils/workspace-io';
import * as fsUtils from '../../src/utils/fs';

describe('workspace-io', () => {
  let sandbox: string;
  let previousAllowlist: string | undefined;

  beforeEach(async () => {
    sandbox = await ensureTempDir('workspace-io-test-');
    previousAllowlist = process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST;
    process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST = sandbox;
  });

  afterEach(async () => {
    process.env.MISSION_PROTOCOL_WORKSPACE_ALLOWLIST = previousAllowlist;
    await removeDir(sandbox, { recursive: true, force: true });
  });

  it('creates a backup when overwriting existing files', async () => {
    const target = path.join(sandbox, 'mission.yaml');
    await writeFileAtomic(target, 'original');

    const result = await writeFileAtomicWithBackup('mission.yaml', 'updated', {
      baseDir: sandbox,
      allowRelative: true,
    });

    const content = await fs.readFile(target, 'utf-8');
    const backup = await fs.readFile(`${target}.backup`, 'utf-8');

    expect(content).toBe('updated');
    expect(backup).toBe('original');
    expect(result.backupPath).toBe(`${target}.backup`);
  });

  it('skips backup when file did not previously exist', async () => {
    const target = path.join(sandbox, 'new-mission.yaml');

    const result = await writeFileAtomicWithBackup('new-mission.yaml', 'first', {
      baseDir: sandbox,
      allowRelative: true,
    });

    const content = await fs.readFile(target, 'utf-8');
    const backupExists = await fs
      .stat(`${target}.backup`)
      .then(() => true)
      .catch(() => false);

    expect(content).toBe('first');
    expect(backupExists).toBe(false);
    expect(result.backupPath).toBeUndefined();
  });

  it('restores original content when atomic write fails', async () => {
    const target = path.join(sandbox, 'restore.yaml');
    await writeFileAtomic(target, 'stable');

    const spy = jest
      .spyOn(fsUtils, 'writeFileAtomic')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(
      writeFileAtomicWithBackup('restore.yaml', 'should-fail', {
        baseDir: sandbox,
        allowRelative: true,
      })
    ).rejects.toThrow('disk full');

    spy.mockRestore();

    const content = await fs.readFile(target, 'utf-8');
    const backup = await fs.readFile(`${target}.backup`, 'utf-8');

    expect(content).toBe('stable');
    expect(backup).toBe('stable');
  });
});
