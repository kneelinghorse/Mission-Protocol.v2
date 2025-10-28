import { DependencyAnalyzer } from '../../src/intelligence/dependency-analyzer';
import {
  EnhancedDependencyAnalyzer,
  EnhancedDependencyAnalysisResult,
} from '../../src/intelligence/enhanced-dependency-analyzer';
import {
  MissionHistoryAnalyzer,
  MissionTransitionEdge,
  MissionHistoryHighlight,
} from '../../src/intelligence/mission-history';
import { ContextPropagatorV2 } from '../../src/intelligence/context-propagator-v2';

class StubMissionHistoryAnalyzer extends MissionHistoryAnalyzer {
  constructor(
    private readonly transitions: MissionTransitionEdge[] = [],
    private readonly highlights: MissionHistoryHighlight[] = []
  ) {
    super({ sessionsPath: '' });
  }

  async deriveTransitions(): Promise<MissionTransitionEdge[]> {
    return this.transitions;
  }

  async collectHighlights(
    missionIds: Iterable<string>,
    limitPerMission = 1
  ): Promise<MissionHistoryHighlight[]> {
    const requested = new Set(missionIds);
    if (requested.size === 0) {
      return [];
    }

    const grouped = new Map<string, MissionHistoryHighlight[]>();
    for (const highlight of this.highlights) {
      if (!requested.has(highlight.missionId)) {
        continue;
      }
      if (!grouped.has(highlight.missionId)) {
        grouped.set(highlight.missionId, []);
      }
      grouped.get(highlight.missionId)!.push(highlight);
    }

    const pruned: MissionHistoryHighlight[] = [];
    for (const items of grouped.values()) {
      pruned.push(...items.slice(0, limitPerMission));
    }

    return pruned;
  }
}

describe('EnhancedDependencyAnalyzer', () => {
  it('injects implicit dependencies derived from history', async () => {
    const history = new StubMissionHistoryAnalyzer([
      {
        from: 'B2',
        to: 'B1',
        confidence: 0.75,
        reason: 'next_hint:B1 completed -> move to B2',
        source: 'next_hint',
        ts: '2025-10-01T00:00:00Z',
      },
    ]);

    const analyzer = new EnhancedDependencyAnalyzer(history, new DependencyAnalyzer());
    const result = (await analyzer.analyze([
      {
        missionId: 'B1',
        filePath: 'missions/B1.yaml',
      },
      {
        missionId: 'B2',
        filePath: 'missions/B2.yaml',
      },
    ])) as EnhancedDependencyAnalysisResult;

    const node = result.graph.nodes.get('B2');
    expect(node).toBeDefined();
    expect(node?.dependencies).toContain('B1');
    expect(node?.implicitDependencies).toContain('B1');
    expect(result.historyDependencies).toHaveLength(1);
  });

  it('ignores history transitions that do not match provided missions', async () => {
    const history = new StubMissionHistoryAnalyzer([
      {
        from: 'B3',
        to: 'B1',
        confidence: 0.5,
        reason: 'sequence:B1->B3',
        source: 'sequence',
        ts: '2025-10-01T01:00:00Z',
      },
    ]);

    const analyzer = new EnhancedDependencyAnalyzer(history, new DependencyAnalyzer());
    const result = await analyzer.analyze([
      {
        missionId: 'B1',
        filePath: 'missions/B1.yaml',
      },
      {
        missionId: 'B2',
        filePath: 'missions/B2.yaml',
      },
    ]);

    const node = result.graph.nodes.get('B2');
    expect(node?.dependencies || []).not.toContain('B1');
    expect(result.historyDependencies).toHaveLength(0);
  });

  it('records implicit dependencies even when already present explicitly', async () => {
    const history = new StubMissionHistoryAnalyzer([
      {
        from: 'B2',
        to: 'B1',
        confidence: 0.6,
        reason: 'next_hint:B2 promotes follow-up work on B1',
        source: 'next_hint',
        ts: '2025-10-01T02:00:00Z',
      },
    ]);

    const analyzer = new EnhancedDependencyAnalyzer(history, new DependencyAnalyzer());
    const result = await analyzer.analyze([
      {
        missionId: 'B1',
        filePath: 'missions/B1.yaml',
      },
      {
        missionId: 'B2',
        domainFields: {
          handoffContext: {
            dependencies: ['B1'],
          },
        },
        filePath: 'missions/B2.yaml',
      },
    ]);

    const node = result.graph.nodes.get('B2');
    expect(node?.dependencies).toContain('B1');
    expect(node?.implicitDependencies).toContain('B1');
  });
});

describe('ContextPropagatorV2', () => {
  it('enriches summary with relevant mission history highlights', async () => {
    const history = new StubMissionHistoryAnalyzer([], [
      {
        missionId: 'B1',
        ts: '2025-10-01T01:01:00Z',
        summary: 'Completed B1 with architecture decisions captured.',
        agent: 'gpt-5-codex',
      },
    ]);

    const propagator = new ContextPropagatorV2({ maxContextTokens: 2048 }, history);

    const result = await propagator.propagateContext(
      'Mission B2 objective text',
      [],
      'B2',
      {
        relatedMissionIds: ['B1'],
      }
    );

    expect(result.historyHighlights).toHaveLength(1);
    expect(result.historyHighlights[0].missionId).toBe('B1');
  });

  it('can disable history enrichment when requested', async () => {
    const history = new StubMissionHistoryAnalyzer([], [
      {
        missionId: 'B1',
        ts: '2025-10-01T01:01:00Z',
        summary: 'Completed B1.',
        agent: 'gpt-5-codex',
      },
    ]);

    const propagator = new ContextPropagatorV2({ maxContextTokens: 2048 }, history);
    const result = await propagator.propagateContext('Mission B2', [], 'B2', {
      relatedMissionIds: ['B1'],
      includeHistory: false,
    });

    expect(result.historyHighlights).toHaveLength(0);
  });

  it('skips history lookup when no related missions supplied', async () => {
    const history = new StubMissionHistoryAnalyzer([], [
      {
        missionId: 'B1',
        ts: '2025-10-01T01:01:00Z',
        summary: 'Completed B1.',
        agent: 'gpt-5-codex',
      },
    ]);

    const propagator = new ContextPropagatorV2({ maxContextTokens: 2048 }, history);
    const result = await propagator.propagateContext('Mission B2', [], 'B2');

    expect(result.historyHighlights).toHaveLength(0);
  });
});
