/**
 * Dependency Resolver with Circular Dependency Detection
 *
 * Resolves dependencies between domain packs and performs topological sorting
 * to determine the correct load order. Detects and reports circular dependencies.
 *
 * Algorithm:
 * 1. Build dependency graph from pack manifests
 * 2. Detect circular dependencies using DFS
 * 3. Perform topological sort for load order
 * 4. Return ordered list of packs to load
 *
 * @module combination/dependency-resolver
 */

import { DomainPack } from '../domains/types';
import {
  DependencyNode,
  ResolvedDependencies,
  CircularDependencyError,
  DependencyNotFoundError,
} from './types';

/**
 * DependencyResolver
 *
 * Resolves pack dependencies and determines load order
 */
export class DependencyResolver {
  /**
   * Resolve dependencies for a set of packs
   *
   * @param packs - Array of domain packs to resolve
   * @param availablePacks - All available packs (for dependency lookup)
   * @returns Resolved dependencies with load order
   */
  resolve(
    packs: DomainPack[],
    availablePacks: DomainPack[]
  ): ResolvedDependencies {
    const errors: string[] = [];
    const graph = new Map<string, DependencyNode>();

    // Step 1: Build dependency graph
    try {
      this.buildGraph(packs, availablePacks, graph);
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      }
      return {
        loadOrder: [],
        graph,
        circularDependencies: [],
        success: false,
        errors,
      };
    }

    // Step 2: Detect circular dependencies
    const circularDeps = this.detectCircularDependencies(graph);
    if (circularDeps.length > 0) {
      const cycles = circularDeps.map(cycle => cycle.join(' -> ')).join('; ');
      errors.push(`Circular dependencies detected: ${cycles}`);
      return {
        loadOrder: [],
        graph,
        circularDependencies: circularDeps,
        success: false,
        errors,
      };
    }

    // Step 3: Perform topological sort
    try {
      const loadOrder = this.topologicalSort(graph);
      return {
        loadOrder,
        graph,
        circularDependencies: [],
        success: true,
        errors: [],
      };
    } catch (error) {
      if (error instanceof Error) {
        errors.push(error.message);
      }
      return {
        loadOrder: [],
        graph,
        circularDependencies: [],
        success: false,
        errors,
      };
    }
  }

  /**
   * Build dependency graph from pack manifests
   */
  private buildGraph(
    packs: DomainPack[],
    availablePacks: DomainPack[],
    graph: Map<string, DependencyNode>
  ): void {
    // Create a map of available packs by name for quick lookup
    const packMap = new Map<string, DomainPack>();
    for (const pack of availablePacks) {
      packMap.set(pack.manifest.name, pack);
    }

    // Also add requested packs to the map
    for (const pack of packs) {
      packMap.set(pack.manifest.name, pack);
    }

    // Process each requested pack
    const toProcess = [...packs];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const pack = toProcess.shift()!;
      const packName = pack.manifest.name;

      // Skip if already processed
      if (processed.has(packName)) {
        continue;
      }

      // Create dependency node
      const node: DependencyNode = {
        name: packName,
        version: pack.manifest.version,
        dependencies: pack.manifest.dependencies || [],
        resolved: false,
      };

      graph.set(packName, node);
      processed.add(packName);

      // Add dependencies to processing queue
      if (pack.manifest.dependencies) {
        for (const dep of pack.manifest.dependencies) {
          if (!processed.has(dep.name)) {
            const depPack = packMap.get(dep.name);
            if (!depPack) {
              throw new DependencyNotFoundError(
                `Dependency "${dep.name}" not found in available packs`,
                dep.name
              );
            }
            toProcess.push(depPack);
          }
        }
      }
    }

    // Mark all nodes as resolved (dependencies exist)
    for (const node of graph.values()) {
      node.resolved = true;
    }
  }

  /**
   * Detect circular dependencies using DFS
   *
   * @param graph - Dependency graph
   * @returns Array of circular dependency cycles
   */
  private detectCircularDependencies(
    graph: Map<string, DependencyNode>
  ): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const currentPath: string[] = [];

    const dfs = (nodeName: string): void => {
      if (recursionStack.has(nodeName)) {
        // Found a cycle
        const cycleStart = currentPath.indexOf(nodeName);
        const cycle = [...currentPath.slice(cycleStart), nodeName];
        cycles.push(cycle);
        return;
      }

      if (visited.has(nodeName)) {
        return;
      }

      visited.add(nodeName);
      recursionStack.add(nodeName);
      currentPath.push(nodeName);

      const node = graph.get(nodeName);
      if (node) {
        for (const dep of node.dependencies) {
          dfs(dep.name);
        }
      }

      currentPath.pop();
      recursionStack.delete(nodeName);
    };

    // Run DFS from each unvisited node
    for (const nodeName of graph.keys()) {
      if (!visited.has(nodeName)) {
        dfs(nodeName);
      }
    }

    return cycles;
  }

  /**
   * Perform topological sort using Kahn's algorithm
   *
   * @param graph - Dependency graph
   * @returns Ordered list of pack names
   */
  private topologicalSort(graph: Map<string, DependencyNode>): string[] {
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // Initialize in-degree and adjacency list
    for (const [name, node] of graph.entries()) {
      if (!inDegree.has(name)) {
        inDegree.set(name, 0);
      }
      if (!adjList.has(name)) {
        adjList.set(name, []);
      }

      for (const dep of node.dependencies) {
        // Add edge from dependency to dependent
        if (!adjList.has(dep.name)) {
          adjList.set(dep.name, []);
        }
        adjList.get(dep.name)!.push(name);

        // Increment in-degree of dependent
        inDegree.set(name, (inDegree.get(name) || 0) + 1);
      }
    }

    // Find all nodes with in-degree 0 (no dependencies)
    const queue: string[] = [];
    for (const [name, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    // Process nodes in topological order
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      // Reduce in-degree of dependent nodes
      const dependents = adjList.get(node) || [];
      for (const dependent of dependents) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check if all nodes were processed
    if (result.length !== graph.size) {
      throw new Error('Topological sort failed: graph contains cycles');
    }

    return result;
  }

  /**
   * Validate that all dependencies are satisfied
   *
   * @param pack - Pack to validate
   * @param availablePacks - Available packs
   * @returns Validation result
   */
  validateDependencies(
    pack: DomainPack,
    availablePacks: DomainPack[]
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pack.manifest.dependencies) {
      return { valid: true, errors: [] };
    }

    const availablePackMap = new Map(
      availablePacks.map(p => [p.manifest.name, p])
    );

    for (const dep of pack.manifest.dependencies) {
      const availablePack = availablePackMap.get(dep.name);

      if (!availablePack) {
        errors.push(`Dependency "${dep.name}" not found`);
        continue;
      }

      // Simple version check (exact match for now)
      // Could be extended to support SemVer ranges
      if (availablePack.manifest.version !== dep.version) {
        errors.push(
          `Dependency "${dep.name}" version mismatch: ` +
          `required ${dep.version}, found ${availablePack.manifest.version}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get all transitive dependencies for a pack
   *
   * @param packName - Name of the pack
   * @param availablePacks - All available packs
   * @returns Array of all dependencies (direct and transitive)
   */
  getTransitiveDependencies(
    packName: string,
    availablePacks: DomainPack[]
  ): string[] {
    const packMap = new Map(availablePacks.map(p => [p.manifest.name, p]));
    const pack = packMap.get(packName);

    if (!pack) {
      throw new DependencyNotFoundError(
        `Pack "${packName}" not found`,
        packName
      );
    }

    const dependencies = new Set<string>();
    const toProcess = [pack];
    const processed = new Set<string>();

    while (toProcess.length > 0) {
      const currentPack = toProcess.shift()!;
      const currentName = currentPack.manifest.name;

      if (processed.has(currentName)) {
        continue;
      }

      processed.add(currentName);

      if (currentPack.manifest.dependencies) {
        for (const dep of currentPack.manifest.dependencies) {
          dependencies.add(dep.name);

          const depPack = packMap.get(dep.name);
          if (depPack && !processed.has(dep.name)) {
            toProcess.push(depPack);
          }
        }
      }
    }

    return Array.from(dependencies);
  }
}
