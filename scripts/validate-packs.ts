import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';

type RegistryEntry = {
  name: string;
  description: string;
  path: string;
  schema_version?: string;
};

type RegistryFile = {
  domains: RegistryEntry[];
};

type WorkflowConfig = {
  name: string;
  packs: readonly string[];
  sampleDir: string;
  sampleFiles: Record<string, string>;
};

const WORKFLOWS: WorkflowConfig[] = [
  {
    name: 'discovery',
    packs: [
      'discovery.opportunity-scan',
      'discovery.problem-definition',
      'discovery.research-orchestrator',
      'discovery.go-no-go-synthesis',
    ],
    sampleDir: path.join('examples', 'discovery-workflow'),
    sampleFiles: {
      'discovery.opportunity-scan': '01_opportunity-scan.sample.yaml',
      'discovery.problem-definition': '02_problem-definition.sample.yaml',
      'discovery.research-orchestrator': '03_research-orchestrator.sample.yaml',
      'discovery.go-no-go-synthesis': '04_go-no-go-synthesis.sample.yaml',
    },
  },
  {
    name: 'engineering',
    packs: [
      'engineering.tdd',
      'engineering.adr',
      'process.design-review',
      'process.code-review',
      'engineering.bug-fix',
    ],
    sampleDir: path.join('examples', 'engineering-workflow'),
    sampleFiles: {
      'engineering.tdd': '01_technical-design.sample.yaml',
      'engineering.adr': '02_architecture-decision.sample.yaml',
      'process.design-review': '03_design-review.sample.yaml',
      'process.code-review': '04_code-review.sample.yaml',
      'engineering.bug-fix': '05_bug-fix.sample.yaml',
    },
  },
  {
    name: 'product',
    packs: [
      'product.competitive-analysis',
      'product.dashboard-blueprint',
      'product.prd',
    ],
    sampleDir: path.join('examples', 'product-workflow'),
    sampleFiles: {
      'product.competitive-analysis': '01_competitive-analysis.sample.yaml',
      'product.dashboard-blueprint': '02_dashboard-blueprint.sample.yaml',
      'product.prd': '03_product-requirements.sample.yaml',
    },
  },
];

async function readYaml<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return YAML.parse(content) as T;
}

async function main(): Promise<void> {
  const repoRoot = process.cwd();
  const templatesDir = path.join(repoRoot, 'templates');
  const registryPath = path.join(templatesDir, 'registry.yaml');
  const errors: string[] = [];
  const notices: string[] = [];

  try {
    await fs.access(registryPath);
  } catch {
    throw new Error(`Missing registry file at ${registryPath}`);
  }

  const registry = await readYaml<RegistryFile>(registryPath);
  const entriesByName = new Map(registry.domains.map((entry) => [entry.name, entry]));

  for (const workflow of WORKFLOWS) {
    const samplesDir = path.join(repoRoot, workflow.sampleDir);

    for (const packName of workflow.packs) {
      const entry = entriesByName.get(packName);
      if (!entry) {
        errors.push(`Registry is missing ${workflow.name} pack entry for "${packName}".`);
        continue;
      }

      const packDir = path.join(templatesDir, entry.path);
      const manifestPath = path.join(packDir, 'pack.yaml');
      const schemaPath = path.join(packDir, 'schema.json');
      const templatePath = path.join(packDir, 'template.yaml');

      try {
        await fs.access(manifestPath);
      } catch {
        errors.push(`Missing manifest for ${packName} at ${manifestPath}.`);
        continue;
      }

      const manifest = await readYaml<{ name: string; description?: string }>(manifestPath);
      if (manifest.name !== packName) {
        errors.push(
          `Manifest name mismatch for ${packName}: registry="${packName}", manifest="${manifest.name}".`
        );
      }

      const registryDescription = entry.description?.trim() ?? '';
      const manifestDescription = manifest.description?.trim() ?? '';
      if (registryDescription && manifestDescription && registryDescription !== manifestDescription) {
        errors.push(
          `Description mismatch for ${packName}: registry="${registryDescription}", manifest="${manifestDescription}".`
        );
      } else if (!registryDescription || !manifestDescription) {
        notices.push(`Consider adding descriptions for ${packName} in both registry and manifest.`);
      }

      for (const artifactPath of [schemaPath, templatePath]) {
        try {
          await fs.access(artifactPath);
        } catch {
          errors.push(`Missing artifact for ${packName} at ${artifactPath}.`);
        }
      }

      const sampleFile = workflow.sampleFiles[packName];
      const samplePath = path.join(samplesDir, sampleFile);
      try {
        const sample = await readYaml<{ domain?: string; domainFields?: Record<string, unknown> }>(
          samplePath
        );
        if (sample.domain !== packName) {
          errors.push(
            `Sample \"${sampleFile}\" domain mismatch: expected \"${packName}\" but found \"${sample.domain}\".`
          );
        }
        if (!sample.domainFields || Object.keys(sample.domainFields).length === 0) {
          errors.push(`Sample \"${sampleFile}\" does not include populated domainFields.`);
        }
      } catch (error) {
        errors.push(`Failed to parse sample \"${sampleFile}\": ${(error as Error).message}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    throw new Error('Domain pack validation failed.');
  }

  for (const notice of notices) {
    console.warn(`NOTICE: ${notice}`);
  }

  console.log('All workflow domain pack validations passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
