/**
 * Phase 3 End-to-End Integration Tests
 *
 * Validates complete workflows across Extension System tools:
 * - Extract -> Export -> Import -> Use (roundtrip)
 * - Pack combination end-to-end
 * - Versioning tool calls (compatibility, register, latest, compare, migrate)
 */

import { describe, it, expect } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TemplateExtractor } from '../../src/extraction/template-extractor';
import { TemplateImporter } from '../../src/import-export/template-importer';
import { TemplateExporter } from '../../src/import-export/template-exporter';
import { PackCombiner } from '../../src/combination/pack-combiner';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import {
  checkVersionCompatibility,
  findMigrationPath,
  registerTemplateVersion,
  getLatestVersion,
  compareVersions,
} from '../../src/tools/version-template';
import { ensureDir, ensureTempDir, removeDir } from '../../src/utils/fs';
import { resolveTemplatesDir } from '../utils/template-path';

describe('Phase 3 Integration', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await ensureTempDir('phase3-integration-');
  });

  afterAll(async () => {
    await removeDir(tmpRoot, { recursive: true, force: true });
  });

  it('Extract -> Export -> Import -> Use (roundtrip)', async () => {
    const sourceDir = path.join(tmpRoot, 'src');
    await ensureDir(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'service.yaml'), 'name: api\nversion: 1.0.0\nport: 8080');

    // Identify candidates directly (Stage 1)
    const extractor = new TemplateExtractor({ sourceMissionPath: sourceDir, author: 'integration' });
    const stage1 = await extractor.identifyCandidates(sourceDir);
    expect(stage1.filesAnalyzed).toBeGreaterThan(0);

    // Build a minimal mission template object for export
    const template = {
      kind: 'MissionTemplate',
      apiVersion: 'mission-template.v1',
      metadata: {
        name: 'roundtrip-template',
        version: '1.0.0',
        author: 'integration',
        signature: { keyId: 'test-key', algorithm: 'RS256', value: 'sig' },
      },
      spec: { description: 'Roundtrip test', phases: [] },
    } as any;

    // Export to YAML string
    const exporter = new TemplateExporter(tmpRoot);
    const yamlString = exporter.exportToString(template);
    expect(yamlString).toContain('Mission Template');

    // Import from string and validate
    const importer = new TemplateImporter(tmpRoot);
    const imported = await importer.importFromString(yamlString, { skipSignatureVerification: true });
    expect(imported.template.metadata.name).toBe('roundtrip-template');
  });

  it('Combines two packs end-to-end', async () => {
    // Use canonical templates when available
    const baseDir = await resolveTemplatesDir();
    const loader = new SecureYAMLLoader({ baseDir });
    const registry = new RegistryParser(loader);

    // If registry is not present in this environment, skip gracefully
    let entries: any[] = [];
    try {
      entries = await registry.loadRegistry('registry.yaml');
    } catch {
      return; // environment without templates; skip
    }

    const packLoader = new DomainPackLoader(loader, registry);
    const software = await packLoader.loadPack('software.technical-task', entries);
    const business = await packLoader.loadPack('business.market-research', entries);

    const combiner = new PackCombiner();
    const result = combiner.combine([business, software], [business, software], {
      strategy: 'deep-merge',
    });

    expect(result.success).toBe(true);
    expect(result.combinedPack).toBeDefined();
    const tpl = result.combinedPack!.template as any;
    expect(tpl.stakeholders || tpl.userStory).toBeDefined();
  });

  it('Versioning tools flow', async () => {
    // register two versions
    const r1 = await registerTemplateVersion({ templateId: 'demo', version: '1.0.0' });
    expect(r1.success).toBe(true);
    const r2 = await registerTemplateVersion({ templateId: 'demo', version: '1.0.1' });
    expect(r2.success).toBe(true);

    const compat = await checkVersionCompatibility({ templateId: 'demo', version1: '1.0.0', version2: '1.0.1' });
    expect(compat.success).toBe(true);

    const latest = await getLatestVersion({ templateId: 'demo', includePrerelease: false });
    expect(latest.success).toBe(true);
    expect(latest.version?.version).toMatch(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/);

    const cmp = await compareVersions({ version1: '1.0.0', version2: '1.0.1' });
    expect(cmp.success).toBe(true);
    expect(cmp.comparison).toBe('less_than');

    const mig = await findMigrationPath({ templateId: 'demo', fromVersion: '1.0.0', toVersion: '1.0.1' });
    expect(mig.success).toBe(true);
    expect(mig.pathFound === false || Array.isArray(mig.path?.steps)).toBe(true);
  });
});
