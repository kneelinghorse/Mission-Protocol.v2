/**
 * Additional coverage tests for CreateMissionToolImpl
 *
 * Targets rarely hit error branches to satisfy global coverage thresholds.
 */

import * as path from 'path';
import { promises as fs } from 'fs';
import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../../src/loaders/yaml-loader';
import { RegistryParser } from '../../src/registry/registry-parser';
import { DomainPackLoader } from '../../src/domains/domain-pack-loader';
import { MissionMerger } from '../../src/merge/deep-merge';
import { CreateMissionToolImpl } from '../../src/tools/create-mission';
import * as schema from '../../src/schemas/generic-mission';
import { ensureDir, pathExists } from '../../src/utils/fs';

describe('CreateMissionToolImpl - coverage branches', () => {
  const testDataDir = path.join(__dirname, '../test-data/create-mission-cov');
  let loader: SecureYAMLLoader;
  let parser: RegistryParser;
  let packLoader: DomainPackLoader;
  let merger: MissionMerger;
  let tool: CreateMissionToolImpl;

  beforeAll(async () => {
    if (!(await pathExists(testDataDir))) {
      await ensureDir(testDataDir);
    }
  });

  beforeEach(async () => {
    loader = new SecureYAMLLoader({ baseDir: testDataDir });
    parser = new RegistryParser(loader);
    packLoader = new DomainPackLoader(loader, parser);
    merger = new MissionMerger();
    tool = new CreateMissionToolImpl(packLoader, merger, parser, loader);

    // Minimal valid generic template
    const genericTemplate = `
schemaType: "Mission"
schemaVersion: "2.0"
missionId: "placeholder"
objective: "placeholder"
context:
  background: ""
  dependencies: []
  constraints: []
successCriteria:
  - "placeholder"
deliverables:
  - "placeholder"
domainFields: {}
`;
    await fs.writeFile(path.join(testDataDir, 'generic_mission.yaml'), genericTemplate);
  });

  afterEach(async () => {
    if (!(await pathExists(testDataDir))) {
      return;
    }

    const entries = await fs.readdir(testDataDir);
    await Promise.all(
      entries.map(async (entry) => {
        const p = path.join(testDataDir, entry);
        const stat = await fs.stat(p);
        if (stat.isDirectory()) {
          await fs.rm(p, { recursive: true, force: true });
        } else {
          await fs.unlink(p);
        }
      })
    );
  });

  it('throws unknown-error variant when generic template load throws non-Error', async () => {
    const spy = jest.spyOn(loader as any, 'load').mockRejectedValue('boom');

    await expect(tool.execute({ objective: 'x' }, [])).rejects.toThrow(/unknown error/i);
    spy.mockRestore();
  });

  it('throws unknown-error variant when domain pack load throws non-Error', async () => {
    // registry just needs to exist; actual loading is mocked
    const spyPack = jest.spyOn(packLoader as any, 'loadPack').mockRejectedValue('nope');

    await expect(tool.execute({ objective: 'x', domain: 'anything' }, [])).rejects.toThrow(
      /unknown error/i
    );
    spyPack.mockRestore();
  });

  it('validateMission throws structure error when type guard fails', async () => {
    // Bypass internal template loading to avoid early type guard
    const fakeTemplate = {
      schemaType: 'Mission',
      schemaVersion: '2.0',
      missionId: 'placeholder',
      objective: 'placeholder',
      context: { background: '', dependencies: [], constraints: [] },
      successCriteria: ['x'],
      deliverables: ['y'],
      domainFields: {},
    } as any;
    const tmplSpy = jest.spyOn(tool as any, 'loadGenericTemplate').mockReturnValue(fakeTemplate);

    const guardSpy = jest.spyOn(schema, 'isGenericMission').mockReturnValue(false as any);

    await expect(tool.execute({ objective: 'x' }, [])).rejects.toThrow(
      /does not match GenericMission structure/i
    );

    guardSpy.mockRestore();
    tmplSpy.mockRestore();
  });
});
