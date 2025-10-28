import { describe, it, expect, jest } from '@jest/globals';

describe('SplitMissionTool coverage helpers', () => {
  it('loadMissionFile wraps unknown read errors', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(async () => {
        try {
          jest.doMock('fs', () => ({
            promises: {
              readFile: jest.fn(async () => {
                throw 'disaster';
              }),
            },
          }));

          jest.doMock('../../src/utils/fs', () => ({
            ensureDir: jest.fn(),
            pathExists: jest.fn(async () => true),
            writeFileAtomic: jest.fn(),
          }));

          const { SplitMissionToolImpl } = require('../../src/tools/split-mission');
          const prototype = SplitMissionToolImpl.prototype;

          await expect(prototype.loadMissionFile.call({}, 'mission.yaml')).rejects.toThrow(
            'Failed to load mission file: Unknown error'
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });
});
