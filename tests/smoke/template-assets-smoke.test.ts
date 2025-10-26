/**
 * Template Assets Smoke Test
 *
 * Quick guardrail to ensure the restored template store remains available.
 * Exercises both DomainPackLoader and create_mission to surface missing assets early.
 */

import * as path from 'path';
import * as YAML from 'yaml';
import { resolveTemplatesDir } from '../utils/template-path';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { MissionMerger } from '../../src/merge/deep-merge';
import { CreateMissionToolImpl } from '../../src/tools/create-mission';
import { GenericMission, isGenericMission } from '../../src/schemas/generic-mission';
import { pathExists } from '../../src/utils/fs';

describe('Template Assets Smoke Test', () => {
  let templatesDir: string;
  let loader: SecureYAMLLoader;
  let registry: RegistryParser;
  let packLoader: DomainPackLoader;
  let createMissionTool: CreateMissionToolImpl;

  beforeAll(async () => {
    templatesDir = await resolveTemplatesDir();

    const registryPath = path.join(templatesDir, 'registry.yaml');
    const genericTemplatePath = path.join(templatesDir, 'generic_mission.yaml');

    if (!(await pathExists(registryPath))) {
      throw new Error(`Registry not found at ${registryPath}. Restore template assets before running smoke tests.`);
    }

    if (!(await pathExists(genericTemplatePath))) {
      throw new Error(
        `Generic mission template missing at ${genericTemplatePath}. Restore generic_mission.yaml to unblock mission creation.`
      );
    }

    loader = new SecureYAMLLoader({ baseDir: templatesDir });
    registry = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, registry);
    createMissionTool = new CreateMissionToolImpl(packLoader, new MissionMerger(), registry, loader);
  });

  it('loads the canonical software domain pack', async () => {
    const entries = await registry.loadRegistry('registry.yaml');
    const pack = await packLoader.loadPack('software.technical-task', entries);

    expect(pack.manifest.name).toBe('software.technical-task');
    expect(pack.schema).toBeDefined();
    expect(pack.template).toBeDefined();
  });

  it('creates a mission using the restored templates', async () => {
    const entries = await registry.loadRegistry('registry.yaml');
    const missionYaml = await createMissionTool.execute(
      {
        objective: 'Template smoke mission',
        domain: 'software.technical-task',
        successCriteria: ['Smoke workflow validated'],
      },
      entries
    );

    const mission = YAML.parse(missionYaml) as GenericMission;

    expect(isGenericMission(mission)).toBe(true);
    expect(mission.objective).toBe('Template smoke mission');
    expect(mission.domainFields).toHaveProperty('userStory');
    expect(mission.successCriteria).toContain('Smoke workflow validated');
  });
});
