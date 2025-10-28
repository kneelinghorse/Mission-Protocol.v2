import path from 'path';
import { promises as fs } from 'fs';
import { safeFilePath, SafeFilePathOptions } from '../validation/common';
import { pathExists, writeFileAtomic } from './fs';

const WORKSPACE_ROOT_ENV_VARS = [
  'MISSION_PROTOCOL_WORKSPACE_ROOT',
  'MCP_WORKSPACE_ROOT',
  'WORKSPACE_ROOT',
] as const;

export function getWorkspaceRoot(): string {
  for (const envVar of WORKSPACE_ROOT_ENV_VARS) {
    const value = process.env[envVar];
    if (value && value.trim().length > 0) {
      return path.resolve(value);
    }
  }
  return process.cwd();
}

export interface ResolveWorkspacePathOptions extends SafeFilePathOptions {
  readonly allowRelative?: boolean;
}

export async function resolveWorkspacePath(
  inputPath: string,
  options: ResolveWorkspacePathOptions = {}
): Promise<string> {
  const workspaceRoot = options.baseDir ? path.resolve(options.baseDir) : getWorkspaceRoot();
  return safeFilePath(inputPath, {
    ...options,
    baseDir: workspaceRoot,
  });
}

export interface AtomicWorkspaceWriteOptions {
  readonly encoding?: BufferEncoding | null;
  readonly mode?: number;
  readonly flag?: string;
  readonly signal?: AbortSignal;
  readonly backupSuffix?: string;
  readonly allowedExtensions?: readonly string[];
  readonly allowRelative?: boolean;
  readonly baseDir?: string;
}

export async function writeFileAtomicWithBackup(
  targetPath: string,
  data: string | NodeJS.ArrayBufferView,
  options: AtomicWorkspaceWriteOptions = {}
): Promise<{ backupPath?: string }> {
  const { backupSuffix, allowedExtensions, allowRelative, baseDir, ...writeOptions } = options;
  const sanitizedTarget = await resolveWorkspacePath(targetPath, {
    allowRelative: allowRelative ?? true,
    allowedExtensions,
    baseDir,
  });

  const suffix = backupSuffix ?? '.backup';
  const backupPath = `${sanitizedTarget}${suffix}`;
  const originalExists = await pathExists(sanitizedTarget);
  let backupCreated = false;

  if (originalExists) {
    await fs.copyFile(sanitizedTarget, backupPath);
    backupCreated = true;
  }

  try {
    await writeFileAtomic(sanitizedTarget, data, writeOptions);
    return backupCreated ? { backupPath } : {};
  } catch (error) {
    if (backupCreated) {
      await fs.copyFile(backupPath, sanitizedTarget).catch(() => undefined);
    }
    throw error;
  }
}
