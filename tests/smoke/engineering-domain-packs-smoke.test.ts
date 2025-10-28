import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { resolveTemplatesDir } from '../utils/template-path';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { pathExists } from '../../src/utils/fs';

const ENGINEERING_PACKS = [
  'engineering.tdd',
  'engineering.adr',
  'process.design-review',
  'process.code-review',
  'engineering.bug-fix',
] as const;

const SAMPLE_FILES: Record<(typeof ENGINEERING_PACKS)[number], string> = {
  'engineering.tdd': '01_technical-design.sample.yaml',
  'engineering.adr': '02_architecture-decision.sample.yaml',
  'process.design-review': '03_design-review.sample.yaml',
  'process.code-review': '04_code-review.sample.yaml',
  'engineering.bug-fix': '05_bug-fix.sample.yaml',
};

describe('Engineering Domain Packs Integration', () => {
  let templatesDir: string;
  let loader: SecureYAMLLoader;
  let registry: RegistryParser;
  let packLoader: DomainPackLoader;

  beforeAll(async () => {
    templatesDir = await resolveTemplatesDir();
    const registryPath = path.join(templatesDir, 'registry.yaml');

    if (!(await pathExists(registryPath))) {
      throw new Error(`Registry not found at ${registryPath}.`);
    }

    loader = new SecureYAMLLoader({ baseDir: templatesDir });
    registry = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, registry);
  });

  it('loads engineering packs and exposes manifest data', async () => {
    const entries = await registry.loadRegistry('registry.yaml');

    for (const packName of ENGINEERING_PACKS) {
      const pack = await packLoader.loadPack(packName, entries);

      expect(pack.manifest.name).toBe(packName);
      expect(pack.template).toBeDefined();
      expect(pack.schema).toBeDefined();
    }
  });

  it('parses workflow samples for each engineering pack', async () => {
    for (const packName of ENGINEERING_PACKS) {
      const samplePath = path.join(
        process.cwd(),
        'examples',
        'engineering-workflow',
        SAMPLE_FILES[packName]
      );
      const content = await fs.readFile(samplePath, 'utf8');
      const mission = YAML.parse(content) as {
        domain?: string;
        domainFields?: Record<string, unknown>;
      };

      expect(mission.domain).toBe(packName);
      expect(mission.domainFields).toBeDefined();
      expect(Object.keys(mission.domainFields ?? {})).not.toHaveLength(0);
    }
  });
});
