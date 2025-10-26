import * as path from 'path';
import { pathExists } from '../../src/utils/fs';

/**
 * Resolve the canonical templates directory regardless of Jest transpilation path.
 * Prefers the workspace templates directory and falls back to any baked-in copies.
 */
export async function resolveTemplatesDir(): Promise<string> {
  const candidates = [
    process.env.MISSION_PROTOCOL_TEMPLATE_DIR,
    path.resolve(process.cwd(), 'templates'),
    path.resolve(__dirname, '..', '..', 'templates'),
    path.resolve(__dirname, '..', '..', '..', 'templates'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const registryPath = path.join(candidate, 'registry.yaml');
    if (await pathExists(registryPath)) {
      return candidate;
    }
  }

  // Default to workspace templates even if missing to preserve prior fallback logic.
  return path.resolve(process.cwd(), 'templates');
}
