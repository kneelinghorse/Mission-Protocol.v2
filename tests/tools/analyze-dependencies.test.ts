import { analyzeDependencies, formatAnalysisResult, AnalyzeDependenciesArgs } from '../../src/tools/analyze-dependencies';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ErrorHandler } from '../../src/errors/handler';
import { MissionProtocolError } from '../../src/errors/mission-error';

describe('analyzeDependencies', () => {
  const testDir = path.join(__dirname, '../fixtures/test-missions');

  beforeAll(async () => {
    // Create test directory and mission files
    await fs.mkdir(testDir, { recursive: true });

    const missions = [
      {
        missionId: 'R4.3',
        objective: 'Research mission for dependency analysis',
        context: 'This is a research mission',
        filePath: path.join(testDir, 'R4.3.yaml')
      },
      {
        missionId: 'B4.3',
        objective: 'Build dependency detection system',
        context: 'This mission implements findings from R4.3',
        domainFields: {
          researchFoundation: [
            { finding: 'Use DAGs', sourceMission: 'R4.3' }
          ]
        },
        filePath: path.join(testDir, 'B4.3.yaml')
      },
      {
        missionId: 'B4.4',
        objective: 'Build quality scoring',
        context: 'This mission depends on B4.3',
        domainFields: {
          handoffContext: {
            dependencies: ['B4.3']
          }
        },
        filePath: path.join(testDir, 'B4.4.yaml')
      }
    ];

    for (const mission of missions) {
      const { filePath, ...missionData } = mission;
      await fs.writeFile(filePath, yaml.dump(missionData));
    }

    // Additional mission using .yml extension to exercise alternate branch
    const altMissionPath = path.join(testDir, 'R4.5.yml');
    await fs.writeFile(
      altMissionPath,
      yaml.dump({
        missionId: 'R4.5',
        objective: 'YML extension coverage',
        context: 'Covers .yml discovery branch',
      })
    );
  });

  afterAll(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('analyzeDependencies', () => {
    it('should analyze dependencies in a mission directory', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      expect(result.totalMissions).toBe(4);
      expect(result.isValid).toBe(true);
      expect(result.isDAG).toBe(true);
      expect(result.hasCycles).toBe(false);
      expect(result.executionOrder).toBeDefined();
      expect(result.executionOrder!.length).toBe(4);
    });

    it('should return error for non-existent directory', async () => {
      const result = await analyzeDependencies({
        missionDirectory: '/nonexistent/path'
      });

      expect(result.totalMissions).toBe(0);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('does not exist');
    });

    it('should return error for directory with no missions', async () => {
      const emptyDir = path.join(__dirname, '../fixtures/empty-dir');
      await fs.mkdir(emptyDir, { recursive: true });

      const result = await analyzeDependencies({
        missionDirectory: emptyDir
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('No mission files found');

      await fs.rm(emptyDir, { recursive: true, force: true });
    });

    it('should compute correct execution order', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      expect(result.executionOrder).toBeDefined();
      const order = result.executionOrder!;

      // R4.3 should come before B4.3
      expect(order.indexOf('R4.3')).toBeLessThan(order.indexOf('B4.3'));
      // B4.3 should come before B4.4
      expect(order.indexOf('B4.3')).toBeLessThan(order.indexOf('B4.4'));
    });

    it('should compute critical path', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath!.length).toBeGreaterThan(0);
      // Critical path should include R4.3 -> B4.3 -> B4.4
      expect(result.criticalPath).toContain('R4.3');
      expect(result.criticalPath).toContain('B4.4');
    });

    it('should complete analysis within performance threshold', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      // Should complete in less than 5 seconds (5000ms)
      expect(result.performanceMs).toBeLessThan(5000);
    });
  });

  describe('inferred dependencies', () => {
    it('should infer dependencies when requested', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir,
        includeInferred: true
      });

      expect(result.inferredDependencies).toBeDefined();
    });

    it('should filter inferred dependencies by confidence', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir,
        includeInferred: true,
        minConfidence: 0.8
      });

      if (result.inferredDependencies && result.inferredDependencies.length > 0) {
        for (const dep of result.inferredDependencies) {
          expect(dep.confidence).toBeGreaterThanOrEqual(0.8);
        }
      }
    });

    it('should not include inferred dependencies by default', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      expect(result.inferredDependencies).toBeUndefined();
    });
  });

  describe('cycle detection', () => {
    const cyclicDir = path.join(__dirname, '../fixtures/cyclic-missions');

    beforeAll(async () => {
      await fs.mkdir(cyclicDir, { recursive: true });

      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          }
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['C']
            }
          }
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          }
        }
      ];

      for (const mission of missions) {
        const filePath = path.join(cyclicDir, `${mission.missionId}.yaml`);
        await fs.writeFile(filePath, yaml.dump(mission));
      }
    });

    afterAll(async () => {
      await fs.rm(cyclicDir, { recursive: true, force: true });
    });

    it('should detect circular dependencies', async () => {
      const result = await analyzeDependencies({
        missionDirectory: cyclicDir
      });

      expect(result.hasCycles).toBe(true);
      expect(result.isDAG).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.cycles).toBeDefined();
      expect(result.cycles!.length).toBeGreaterThan(0);
    });

    it('should not compute execution order for cyclic graphs', async () => {
      const result = await analyzeDependencies({
        missionDirectory: cyclicDir
      });

      expect(result.executionOrder).toBeUndefined();
    });
  });

  describe('formatAnalysisResult', () => {
    it('should format valid result with execution order', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain('Total Missions: 4');
      expect(formatted).toContain('Valid: Yes');
      expect(formatted).toContain('Is DAG: Yes');
      expect(formatted).toContain('Execution Order:');
    });

    it('should format result with cycles', async () => {
      // Create a fresh cyclic directory for this test
      const cyclicDirForFormat = path.join(__dirname, '../fixtures/cyclic-missions-format');
      await fs.mkdir(cyclicDirForFormat, { recursive: true });

      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          }
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          }
        }
      ];

      for (const mission of missions) {
        const filePath = path.join(cyclicDirForFormat, `${mission.missionId}.yaml`);
        await fs.writeFile(filePath, yaml.dump(mission));
      }

      const result = await analyzeDependencies({
        missionDirectory: cyclicDirForFormat
      });

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain('Has Cycles: Yes');
      expect(formatted).toContain('Circular Dependencies Detected:');

      // Clean up
      await fs.rm(cyclicDirForFormat, { recursive: true, force: true });
    });

    it('should format result with errors', async () => {
      const result = await analyzeDependencies({
        missionDirectory: '/nonexistent'
      });

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain('Errors:');
      expect(formatted).toContain('does not exist');
    });

    it('should format result with inferred dependencies', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir,
        includeInferred: true
      });

      const formatted = formatAnalysisResult(result);

      if (result.inferredDependencies && result.inferredDependencies.length > 0) {
        expect(formatted).toContain('Inferred Dependencies:');
      }
    });

    it('should include performance metrics', async () => {
      const result = await analyzeDependencies({
        missionDirectory: testDir
      });

      const formatted = formatAnalysisResult(result);

      expect(formatted).toContain('Analysis Time:');
      expect(formatted).toContain('ms');
    });
  });

  describe('edge cases', () => {
    it('should handle empty mission files', async () => {
      const emptyMissionDir = path.join(__dirname, '../fixtures/empty-missions');
      await fs.mkdir(emptyMissionDir, { recursive: true });
      await fs.writeFile(path.join(emptyMissionDir, 'empty.yaml'), '');

      const result = await analyzeDependencies({
        missionDirectory: emptyMissionDir
      });

      // Should handle gracefully - empty YAML is parsed as null
      expect(result.errors.length).toBe(0);

      await fs.rm(emptyMissionDir, { recursive: true, force: true });
    });

    it('should handle missions with missing missionId', async () => {
      const invalidDir = path.join(__dirname, '../fixtures/invalid-missions');
      await fs.mkdir(invalidDir, { recursive: true });

      await fs.writeFile(
        path.join(invalidDir, 'invalid.yaml'),
        yaml.dump({ objective: 'No mission ID' })
      );

      const result = await analyzeDependencies({
        missionDirectory: invalidDir
      });

      // Should handle gracefully
      expect(result).toBeDefined();

      await fs.rm(invalidDir, { recursive: true, force: true });
    });

    it('captures loader warnings when mission file cannot be read', async () => {
      const warningDir = path.join(__dirname, '../fixtures/warning-missions');
      await fs.mkdir(warningDir, { recursive: true });

      const readableMission = path.join(warningDir, 'valid.yaml');
      const unreadableMission = path.join(warningDir, 'broken.yaml');

      await fs.writeFile(readableMission, yaml.dump({ missionId: 'A', objective: 'Valid' }));
      await fs.writeFile(unreadableMission, yaml.dump({ missionId: 'B', objective: 'Broken' }));

      const originalReadFile = fs.readFile.bind(fs);
      const readSpy = jest.spyOn(fs, 'readFile').mockImplementation(async (target, encoding) => {
        if (typeof target === 'string' && target.endsWith('broken.yaml')) {
          throw new Error('simulated read failure');
        }
        return originalReadFile(target as any, encoding as any);
      });

      const handleSpy = jest.spyOn(ErrorHandler, 'handle');

      try {
        const result = await analyzeDependencies({ missionDirectory: warningDir });
        expect(handleSpy).toHaveBeenCalledWith(
          expect.any(Error),
          'tools.get_dependency_analysis.load_mission_file',
          expect.objectContaining({
            module: 'tools/analyze-dependencies',
            data: expect.objectContaining({ filePath: expect.stringContaining('broken.yaml') }),
          }),
          expect.objectContaining({ severity: 'warning' })
        );
        expect(result.totalMissions).toBeGreaterThanOrEqual(1);
      } finally {
        readSpy.mockRestore();
        handleSpy.mockRestore();
        await fs.rm(warningDir, { recursive: true, force: true });
      }
    });

    it('wraps unexpected failures via ErrorHandler with correlation id', async () => {
      const failureDir = path.join(__dirname, '../fixtures/failure-missions');
      await fs.mkdir(failureDir, { recursive: true });

      const readdirSpy = jest.spyOn(fs, 'readdir').mockRejectedValue(new Error('readdir boom'));

      const missionError = new MissionProtocolError({
        code: 'INTERNAL_UNEXPECTED',
        category: 'internal',
        message: 'wrapped error',
        context: { module: 'tools/analyze-dependencies' },
      });

      const handleSpy = jest.spyOn(ErrorHandler, 'handle').mockReturnValue(missionError);
      const publicSpy = jest.spyOn(ErrorHandler, 'toPublicError').mockReturnValue({
        code: missionError.code,
        category: missionError.category,
        message: 'Dependency analysis failed',
        correlationId: 'cid-789',
        retryable: false,
      });

      try {
        const result = await analyzeDependencies({ missionDirectory: failureDir });
        expect(handleSpy).toHaveBeenCalledWith(
          expect.any(Error),
          'tools.get_dependency_analysis.execute',
          expect.objectContaining({
            module: 'tools/analyze-dependencies',
            data: expect.objectContaining({ missionDirectory: failureDir }),
          }),
          expect.objectContaining({ userMessage: 'Dependency analysis failed.' })
        );
        expect(result.errors[0]).toContain('correlationId=cid-789');
        expect(result.totalMissions).toBe(0);
      } finally {
        readdirSpy.mockRestore();
        handleSpy.mockRestore();
        publicSpy.mockRestore();
        await fs.rm(failureDir, { recursive: true, force: true });
      }
    });
  });

  describe('formatAnalysisResult warnings', () => {
    it('renders warnings section when warnings present', () => {
      const summary = formatAnalysisResult({
        totalMissions: 1,
        isValid: true,
        isDAG: true,
        hasCycles: false,
        errors: [],
        warnings: ['Mission order differs from dependencies'],
        performanceMs: 42,
        executionOrder: ['M1'],
        criticalPath: [],
        inferredDependencies: [],
      });

      expect(summary).toContain('Warnings:');
      expect(summary).toContain('Mission order differs from dependencies');
    });
  });
});
