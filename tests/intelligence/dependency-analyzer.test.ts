import { DependencyAnalyzer, DependencyGraph, DependencyNode } from '../../src/intelligence/dependency-analyzer';

describe('DependencyAnalyzer', () => {
  let analyzer: DependencyAnalyzer;

  beforeEach(() => {
    analyzer = new DependencyAnalyzer();
  });

  describe('analyze', () => {
    it('should build a dependency graph from mission objects', async () => {
      const missions = [
        {
          missionId: 'R4.3',
          context: 'Research mission',
          filePath: 'missions/R4.3.yaml'
        },
        {
          missionId: 'B4.3',
          context: 'Build mission based on R4.3',
          domainFields: {
            researchFoundation: [
              { finding: 'Use DAGs', sourceMission: 'R4.3' }
            ]
          },
          filePath: 'missions/B4.3.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.graph.nodes.size).toBe(2);
      expect(result.graph.nodes.has('R4.3')).toBe(true);
      expect(result.graph.nodes.has('B4.3')).toBe(true);
      expect(result.graph.edges.get('B4.3')?.has('R4.3')).toBe(true);
    });

    it('should detect no cycles in a valid DAG', async () => {
      const missions = [
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          context: 'Depends on A',
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          context: 'Depends on B',
          filePath: 'missions/C.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.hasCycles).toBe(false);
      expect(result.executionOrder).toBeDefined();
      expect(result.executionOrder?.length).toBe(3);
    });

    it('should detect cycles in a circular dependency', async () => {
      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['C']
            }
          },
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/C.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.hasCycles).toBe(true);
      expect(result.cycles).toBeDefined();
      expect(result.cycles!.length).toBeGreaterThan(0);
    });

    it('should compute execution order using topological sort', async () => {
      const missions = [
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/C.yaml'
        },
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.executionOrder).toBeDefined();
      const order = result.executionOrder!;

      // A should come before B
      expect(order.indexOf('A')).toBeLessThan(order.indexOf('B'));
      // B should come before C
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('C'));
    });

    it('should find critical path', async () => {
      const missions = [
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/C.yaml'
        },
        {
          missionId: 'D',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/D.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath!.length).toBeGreaterThan(0);
      // Critical path should be A -> B -> C (longest path)
      expect(result.criticalPath).toContain('A');
      expect(result.criticalPath).toContain('C');
    });
  });

  describe('extractExplicitDependencies', () => {
    it('should extract dependencies from researchFoundation', async () => {
      const missions = [
        {
          missionId: 'R4.3',
          filePath: 'missions/R4.3.yaml'
        },
        {
          missionId: 'B4.3',
          domainFields: {
            researchFoundation: [
              { finding: 'Finding 1', sourceMission: '<R4.3_Intelligent_Mission_Sequencing>' }
            ]
          },
          filePath: 'missions/B4.3.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);
      const b43Node = result.graph.nodes.get('B4.3');

      expect(b43Node).toBeDefined();
      expect(b43Node!.dependencies).toContain('R4.3');
    });

    it('should extract dependencies from handoffContext', async () => {
      const missions = [
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);
      const bNode = result.graph.nodes.get('B');

      expect(bNode).toBeDefined();
      expect(bNode!.dependencies).toContain('A');
    });

    it('should extract mission references from context text', async () => {
      const missions = [
        {
          missionId: 'R4.3',
          filePath: 'missions/R4.3.yaml'
        },
        {
          missionId: 'B4.3',
          context: 'This mission implements findings from R4.3 research',
          filePath: 'missions/B4.3.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);
      const b43Node = result.graph.nodes.get('B4.3');

      expect(b43Node).toBeDefined();
      expect(b43Node!.dependencies).toContain('R4.3');
    });
  });

  describe('detectCycles', () => {
    it('should detect a simple cycle', async () => {
      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.hasCycles).toBe(true);
      expect(result.cycles).toBeDefined();
      expect(result.cycles!.length).toBe(1);
    });

    it('should detect a complex cycle', async () => {
      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['C']
            }
          },
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['D']
            }
          },
          filePath: 'missions/C.yaml'
        },
        {
          missionId: 'D',
          domainFields: {
            handoffContext: {
              dependencies: ['B']
            }
          },
          filePath: 'missions/D.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.hasCycles).toBe(true);
      expect(result.cycles).toBeDefined();
      const cycle = result.cycles![0];
      expect(cycle).toContain('B');
      expect(cycle).toContain('C');
      expect(cycle).toContain('D');
    });

    it('should handle self-referencing cycle', async () => {
      const missions = [
        {
          missionId: 'A',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/A.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.hasCycles).toBe(true);
    });
  });

  describe('topologicalSort', () => {
    it('should produce valid topological ordering', async () => {
      const missions = [
        {
          missionId: 'D',
          domainFields: {
            handoffContext: {
              dependencies: ['B', 'C']
            }
          },
          filePath: 'missions/D.yaml'
        },
        {
          missionId: 'B',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          domainFields: {
            handoffContext: {
              dependencies: ['A']
            }
          },
          filePath: 'missions/C.yaml'
        },
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.executionOrder).toBeDefined();
      const order = result.executionOrder!;

      // A must be first
      expect(order[0]).toBe('A');
      // D must be last
      expect(order[order.length - 1]).toBe('D');
      // B and C must come after A but before D
      expect(order.indexOf('B')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    });

    it('should handle missions with no dependencies', async () => {
      const missions = [
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        },
        {
          missionId: 'B',
          filePath: 'missions/B.yaml'
        },
        {
          missionId: 'C',
          filePath: 'missions/C.yaml'
        }
      ];

      const result = await analyzer.analyze(missions);

      expect(result.executionOrder).toBeDefined();
      expect(result.executionOrder!.length).toBe(3);
    });
  });

  describe('getGraph', () => {
    it('should return the current dependency graph', async () => {
      const missions = [
        {
          missionId: 'A',
          filePath: 'missions/A.yaml'
        }
      ];

      await analyzer.analyze(missions);
      const graph = analyzer.getGraph();

      expect(graph).toBeDefined();
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
      expect(graph.nodes.size).toBe(1);
    });
  });
});
