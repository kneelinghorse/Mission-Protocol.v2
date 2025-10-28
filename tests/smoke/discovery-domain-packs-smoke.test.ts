import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { resolveTemplatesDir } from '../utils/template-path';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { pathExists } from '../../src/utils/fs';

const DISCOVERY_PACKS = [
  'discovery.opportunity-scan',
  'discovery.problem-definition',
  'discovery.research-orchestrator',
  'discovery.go-no-go-synthesis',
] as const;

const SAMPLE_FILES: Record<(typeof DISCOVERY_PACKS)[number], string> = {
  'discovery.opportunity-scan': '01_opportunity-scan.sample.yaml',
  'discovery.problem-definition': '02_problem-definition.sample.yaml',
  'discovery.research-orchestrator': '03_research-orchestrator.sample.yaml',
  'discovery.go-no-go-synthesis': '04_go-no-go-synthesis.sample.yaml',
};

describe('Discovery Domain Packs Integration', () => {
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

  it('loads discovery packs and exposes manifest data', async () => {
    const entries = await registry.loadRegistry('registry.yaml');

    for (const packName of DISCOVERY_PACKS) {
      const pack = await packLoader.loadPack(packName, entries);

      expect(pack.manifest.name).toBe(packName);
      expect(pack.template).toBeDefined();
      expect(pack.schema).toBeDefined();
    }
  });

  it('parses workflow samples for each discovery pack', async () => {
    for (const packName of DISCOVERY_PACKS) {
      const samplePath = path.join(
        process.cwd(),
        'examples',
        'discovery-workflow',
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
