import * as yaml from 'js-yaml';
import { promises as fs } from 'fs';
import {
  DependencyAnalyzer,
  DependencyAnalysisResult,
  MissionInput,
  MissionRecord,
  MissionDomainFields,
  isMissionRecord,
} from './dependency-analyzer';
import {
  MissionHistoryAnalyzer,
  MissionTransitionEdge,
} from './mission-history';

export interface EnhancedDependencyAnalysisResult extends DependencyAnalysisResult {
  historyDependencies: MissionTransitionEdge[];
}

/**
 * EnhancedDependencyAnalyzer
 *
 * Extends the baseline dependency analyzer by injecting implicit dependencies
 * discovered from execution history. This allows mission planning to account
 * for historical sequencing patterns and explicit next-hint recommendations.
 */
export class EnhancedDependencyAnalyzer {
  constructor(
    private readonly historyAnalyzer: MissionHistoryAnalyzer = new MissionHistoryAnalyzer(),
    private readonly dependencyAnalyzer: DependencyAnalyzer = new DependencyAnalyzer()
  ) {}

  async analyze(missions: MissionInput[]): Promise<EnhancedDependencyAnalysisResult> {
    const missionRecords = await this.loadMissionRecords(missions);
    const missionMap = new Map<string, MissionRecord>();
    for (const record of missionRecords) {
      missionMap.set(record.missionId, record);
    }

    const historyTransitions = await this.historyAnalyzer.deriveTransitions();
    const relevantTransitions = historyTransitions.filter(
      (edge) => missionMap.has(edge.from) && missionMap.has(edge.to)
    );

    const historyDependencyMap = new Map<string, Set<string>>();
    for (const edge of relevantTransitions) {
      if (!historyDependencyMap.has(edge.from)) {
        historyDependencyMap.set(edge.from, new Set());
      }
      historyDependencyMap.get(edge.from)!.add(edge.to);
    }

    const augmentedMissions = missionRecords.map((record) => {
      const historyDeps = historyDependencyMap.get(record.missionId);
      if (!historyDeps || historyDeps.size === 0) {
        return record;
      }

      const existingDomainFields = { ...(record.domainFields ?? {}) } as MissionDomainFields;
      const existingHandoff = { ...(existingDomainFields.handoffContext ?? {}) };
      const existingDeps = new Set(
        Array.isArray(existingHandoff.dependencies) ? existingHandoff.dependencies : []
      );

      let added = false;
      for (const dep of historyDeps) {
        if (!existingDeps.has(dep)) {
          existingDeps.add(dep);
          added = true;
        }
      }

      if (!added) {
        return record;
      }

      const augmentedRecord: MissionRecord = {
        ...record,
        domainFields: {
          ...existingDomainFields,
          handoffContext: {
            ...existingHandoff,
            dependencies: Array.from(existingDeps),
          },
        },
      };

      return augmentedRecord;
    });

    const result = await this.dependencyAnalyzer.analyze(augmentedMissions);

    // Annotate implicit dependencies for downstream consumers
    for (const [missionId, deps] of historyDependencyMap.entries()) {
      const node = result.graph.nodes.get(missionId);
      if (!node) {
        continue;
      }
      const implicit = new Set(node.implicitDependencies ?? []);
      for (const dep of deps) {
        implicit.add(dep);
      }
      node.implicitDependencies = Array.from(implicit);
    }

    return {
      ...result,
      historyDependencies: relevantTransitions,
    };
  }

  private async loadMissionRecords(inputs: MissionInput[]): Promise<MissionRecord[]> {
    const records: MissionRecord[] = [];

    for (const mission of inputs) {
      if (typeof mission === 'string') {
        const filePath = mission;
        const content = await fs.readFile(filePath, 'utf-8');
        const parsed = yaml.load(content);

        if (!isMissionRecord(parsed)) {
          throw new Error(`Invalid mission data encountered at ${filePath}`);
        }

        records.push({ ...parsed, filePath });
        continue;
      }

      records.push({ ...mission });
    }

    return records;
  }
}

