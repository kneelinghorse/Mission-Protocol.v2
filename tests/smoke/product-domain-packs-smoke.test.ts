import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { resolveTemplatesDir } from '../utils/template-path';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { pathExists } from '../../src/utils/fs';

const PRODUCT_PACKS = [
  'product.competitive-analysis',
  'product.dashboard-blueprint',
  'product.prd',
] as const;

const SAMPLE_FILES: Record<(typeof PRODUCT_PACKS)[number], string> = {
  'product.competitive-analysis': '01_competitive-analysis.sample.yaml',
  'product.dashboard-blueprint': '02_dashboard-blueprint.sample.yaml',
  'product.prd': '03_product-requirements.sample.yaml',
};

describe('Product Domain Packs Integration', () => {
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

  it('loads product packs and exposes manifest data', async () => {
    const entries = await registry.loadRegistry('registry.yaml');

    for (const packName of PRODUCT_PACKS) {
      const pack = await packLoader.loadPack(packName, entries);

      expect(pack.manifest.name).toBe(packName);
      expect(pack.template).toBeDefined();
      expect(pack.schema).toBeDefined();
    }
  });

  it('parses workflow samples for each product pack', async () => {
    for (const packName of PRODUCT_PACKS) {
      const samplePath = path.join(
        process.cwd(),
        'examples',
        'product-workflow',
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
