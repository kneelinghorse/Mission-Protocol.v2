import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { WorkerManifestLoader } from '../../src/intelligence/worker-manifest-loader';

const writeManifest = async (dir: string, content: string): Promise<string> => {
  const manifestDir = path.join(dir, 'cmos', 'workers');
  await fs.mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, 'manifest.yaml');
  await fs.writeFile(manifestPath, content, 'utf-8');
  return manifestPath;
};

const createTempRoot = async (): Promise<string> =>
  fs.mkdtemp(path.join(os.tmpdir(), 'worker-manifest-loader-'));

const cleanupTempRoot = async (dir: string | undefined): Promise<void> => {
  if (!dir) {
    return;
  }
  await fs.rm(dir, { recursive: true, force: true });
};

describe('WorkerManifestLoader', () => {
  let tempRoot: string | undefined;

  afterEach(async () => {
    await cleanupTempRoot(tempRoot);
    tempRoot = undefined;
  });

  it('loads a valid worker manifest with sanitized fields', async () => {
    tempRoot = await createTempRoot();
    await writeManifest(
      tempRoot,
      [
        'manifest_version: "1.0.0"',
        'pattern_support:',
        '  mutually_exclusive: true',
        '  allowed_patterns:',
        '    - delegation',
        '    - boomerang',
        '  fallback_pattern: none',
        'workers:',
        '  - workerId: "research.web-search"',
        '    name: " Web Research Worker "',
        '    description: "Conducts focused web research"',
        '    template_path: "cmos/workers/research.web-search.yaml"',
        '    capabilities:',
        '      - web_search',
        '      - source_validation',
        '    patterns:',
        '      supports:',
        '        - delegation',
        '    constraints:',
        '      required_tools:',
        '        - web_fetch',
        '      max_concurrent: 2',
        '      timeout_seconds: 300',
        '      token_budget: 12000',
        '    telemetry:',
        '      emits:',
        '        - worker_dispatch',
        '        - worker_complete',
      ].join('\n')
    );

    const loader = new WorkerManifestLoader();
    const result = await loader.load(tempRoot);

    expect(result.loaded).toBe(true);
    expect(result.manifest?.version).toBe('1.0.0');
    expect(result.manifest?.patternSupport.allowedPatterns).toEqual([
      'delegation',
      'boomerang',
    ]);
    expect(result.manifest?.workers).toHaveLength(1);
    const [worker] = result.manifest?.workers ?? [];
    expect(worker.workerId).toBe('research.web-search');
    expect(worker.name).toBe('Web Research Worker');
    expect(worker.capabilities).toEqual(['web_search', 'source_validation']);
    expect(worker.constraints.maxConcurrent).toBe(2);
    expect(worker.constraints.timeoutSeconds).toBe(300);
    expect(worker.telemetry?.emits).toEqual(['worker_dispatch', 'worker_complete']);
    expect(result.validations).toEqual([]);
  });

  it('rejects manifest with duplicate worker IDs and invalid paths', async () => {
    tempRoot = await createTempRoot();
    await writeManifest(
      tempRoot,
      [
        'manifest_version: "1.0.0"',
        'pattern_support:',
        '  mutually_exclusive: false',
        '  allowed_patterns:',
        '    - delegation',
        'workers:',
        '  - workerId: "duplicate"',
        '    name: "First"',
        '    template_path: "cmos/workers/first.yaml"',
        '    capabilities: [analysis]',
        '    patterns:',
        '      supports: [delegation]',
        '    constraints:',
        '      required_tools: []',
        '      max_concurrent: 1',
        '  - workerId: "duplicate"',
        '    name: "Second"',
        '    template_path: "../escape.yaml"',
        '    capabilities: [analysis]',
        '    patterns:',
        '      supports: [delegation]',
        '    constraints:',
        '      required_tools: []',
        '      max_concurrent: 0',
      ].join('\n')
    );

    const loader = new WorkerManifestLoader();
    const result = await loader.load(tempRoot);

    expect(result.loaded).toBe(false);
    const errorCodes = result.validations.filter((v) => v.level === 'error').map((v) => v.code);
    expect(errorCodes).toEqual(
      expect.arrayContaining([
        'WORKER_ID_DUPLICATE',
        'WORKER_TEMPLATE_PATH_INVALID',
        'WORKER_MAX_CONCURRENT_INVALID',
      ])
    );
    expect(result.manifest).toBeUndefined();
  });

  it('reports missing manifest with a structured error', async () => {
    tempRoot = await createTempRoot();
    const loader = new WorkerManifestLoader();

    const result = await loader.load(tempRoot);

    expect(result.loaded).toBe(false);
    expect(result.validations).toHaveLength(1);
    expect(result.validations[0].code).toBe('WORKER_MANIFEST_NOT_FOUND');
  });
});
