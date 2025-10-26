/**
 * Additional Token Optimizer Coverage Tests
 */

import { describe, test, expect } from '@jest/globals';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { TokenOptimizer } from '../../src/intelligence/token-optimizer';

describe('TokenOptimizer extra', () => {
  test('optimizeFile reads file and returns result', async () => {
    const optimizer = new TokenOptimizer();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opt-file-'));
    const filePath = path.join(tmpDir, 'mission.yaml');
    const content = 'objective: Minimal mission for optimizeFile test';
    await fs.writeFile(filePath, content, 'utf-8');

    const result = await optimizer.optimizeFile(filePath, { model: 'gpt', level: 'balanced' });
    expect(result.original).toBe(content);
    expect(result.optimized.length).toBeGreaterThan(0);
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test('optimizeBatch processes multiple missions and returns map', async () => {
    const optimizer = new TokenOptimizer();
    const missions = [
      { id: 'a', content: 'objective: A' },
      { id: 'b', content: 'objective: B' },
    ];
    const map = await optimizer.optimizeBatch(missions, { model: 'claude', level: 'balanced' });
    expect(map.size).toBe(2);
    expect(map.get('a')!.model).toBe('claude');
  });

  test('warns when reduction is outside 20-30% target', async () => {
    const optimizer = new TokenOptimizer();
    // Short content + templating likely yields small or negative reduction
    const content = 'objective: x';
    const result = await optimizer.optimize(content, { model: 'gemini', level: 'aggressive' });
    // We assert that either warnings exist or reduction is within target
    if (result.stats.reductionPercentage < 20 || result.stats.reductionPercentage > 30) {
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toMatch(/Compression achieved/);
    }
  });
});

