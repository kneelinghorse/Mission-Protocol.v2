import { describe, test, expect } from '@jest/globals';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { ListDomainsToolImpl } from '../../src/tools/list-domains';
import { resolveTemplatesDir } from '../utils/template-path';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ensureDir, ensureTempDir, pathExists } from '../../src/utils/fs';

describe('Phase 1 Integration', () => {
  test('loads registry and lists domains', async () => {
    // Prefer app templates; if missing, create minimal fixture
    let baseDir = await resolveTemplatesDir();
    if (!(await pathExists(path.join(baseDir, 'registry.yaml')))) {
      const tmp = await ensureTempDir('p1-fixtures-');
      baseDir = path.join(tmp, 'templates');
      await ensureDir(path.join(baseDir, 'packs', 'foundation'));
      await fs.writeFile(
        path.join(baseDir, 'registry.yaml'),
        `domains:\n  - name: foundation\n    description: Core baseline\n    version: 1.0.0\n    author: core-team\n    path: packs/foundation\n    schema_version: 1.0.0\n`
      );
      await fs.writeFile(
        path.join(baseDir, 'packs', 'foundation', 'pack.yaml'),
        `name: foundation\nversion: 1.0.0\ndisplayName: Foundation\ndescription: Core\nauthor: core-team\nschema: schema.json\n`
      );
      await fs.writeFile(
        path.join(baseDir, 'packs', 'foundation', 'schema.json'),
        `{"$schema":"http://json-schema.org/draft-07/schema#","type":"object"}`
      );
      await fs.writeFile(
        path.join(baseDir, 'packs', 'foundation', 'template.yaml'),
        `governanceChecklist: []\n`
      );
    }
    const loader = new SecureYAMLLoader({ baseDir });
    const registry = new RegistryParser(loader);
    const tool = new ListDomainsToolImpl(registry);

    const domains = await tool.execute('registry.yaml');
    expect(domains.length).toBeGreaterThan(0);
    expect(domains[0].name).toBe('foundation');
  });
});
