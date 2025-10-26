/**
 * MCP Intelligence Tools Smoke Tests
 *
 * Validates that intelligence tools are discoverable via list_tools
 * and callable end-to-end with token usage metadata.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import {
  buildMissionProtocolContext,
  executeMissionProtocolTool,
  getToolDefinitions,
  MissionProtocolContext,
} from '../../src/index';
import { ensureTempDir, removeDir } from '../../src/utils/fs';

const SAMPLE_MISSION = `
missionId: "SMOKE-INTEL-001"
objective: "Conduct a comprehensive modernization of the mission control pipeline, including observability upgrades, automated rollback, sandbox refresh tooling, and AI mission authoring workflows."

context: |
  The current pipeline spans six repositories with bespoke scripts. We need to consolidate deployment logic,
  add progressive delivery support, and introduce automated telemetry to detect regressions.
  The effort must consider compliance checkpoints, localization blockers, and GPU-heavy inference steps.

successCriteria:
  - "Unified deployment orchestrator supports blue/green and canary strategies."
  - "Observability dashboards cover latency, throughput, error budgets, and token utilization."
  - "Sandbox refresh tooling delivers one-click tenant resets with audit trails."
  - "AI mission authoring workflow enables collaborative drafting with guardrails."
  - "Regression suite achieves 95% coverage across data, API, and UI layers."

deliverables:
  - "ops/orchestrator/ - orchestration service with rollout strategies"
  - "observability/dashboards/ - Grafana dashboards for SLOs"
  - "sandbox/refresh-tool/ - CLI + docs for sandbox resets"
  - "ai/authoring-workflow/ - templates + integration tests"
  - "runbooks/ - incident response and rollback guides"
`;

describe('MCP Intelligence Tools - Smoke Coverage', () => {
  let context: MissionProtocolContext;
  let tempDir: string;
  let missionFile: string;

  beforeAll(async () => {
    context = await buildMissionProtocolContext({ defaultModel: 'gpt' });

    tempDir = await ensureTempDir('mission-protocol-intel-');
    missionFile = path.join(tempDir, 'mission.yaml');
    await fs.writeFile(missionFile, SAMPLE_MISSION, 'utf-8');
  });

  afterAll(async () => {
    await removeDir(tempDir, { recursive: true, force: true });
  });

  it('list_tools exposes optimize_tokens, split_mission, and suggest_splits', () => {
    const toolNames = getToolDefinitions().map(tool => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining(['optimize_tokens', 'split_mission', 'suggest_splits'])
    );
  });

  it('optimize_tokens executes with token usage metadata', async () => {
    const result = await executeMissionProtocolTool(
      'optimize_tokens',
      {
        missionFile,
        targetModel: 'gpt',
        compressionLevel: 'conservative',
        dryRun: true,
      },
      context
    );

    const tokenUsage = (result.structuredContent as any)?.tokenUsage;

    expect(result.content?.[0]?.text).toContain('Token optimization completed');
    expect(tokenUsage).toBeDefined();
    expect(tokenUsage.model).toBe('gpt');
    expect(tokenUsage.original.count).toBeGreaterThan(0);
    expect(tokenUsage.optimized.count).toBeGreaterThan(0);
  });

  it('split_mission provides complexity summary with token usage', async () => {
    const result = await executeMissionProtocolTool(
      'split_mission',
      {
        missionFile,
        outputDir: tempDir,
        preserveStructure: true,
      },
      context
    );

    const tokenUsage = (result.structuredContent as any)?.tokenUsage;

    expect(result.content?.[0]?.text).toContain('Token Usage');
    expect(tokenUsage).toBeDefined();
    expect(tokenUsage.model).toBe('gpt');
    expect(tokenUsage.totalTokens).toBeGreaterThan(0);
  });

  it('suggest_splits returns recommendations with token usage insight', async () => {
    const result = await executeMissionProtocolTool(
      'suggest_splits',
      {
        missionFile,
        detailed: true,
      },
      context
    );

    const tokenUsage = (result.structuredContent as any)?.tokenUsage;

    expect(result.content?.[0]?.text).toContain('Token Usage');
    expect(tokenUsage).toBeDefined();
    expect(tokenUsage.model).toBe('gpt');
    expect(tokenUsage.totalTokens).toBeGreaterThan(0);
  });

  it('list_available_domains enumerates registry packs', async () => {
    const result = await executeMissionProtocolTool('list_available_domains', undefined, context);

    expect(result.content?.[0]?.text).toContain('domain pack');
    expect(Array.isArray((result.structuredContent as any)?.domains)).toBe(true);
  });

  it('create_mission generates YAML mission with token objective', async () => {
    const result = await executeMissionProtocolTool(
      'create_mission',
      { objective: 'Calibrate mission protocol smoke coverage' },
      context
    );

    expect(result.content?.[0]?.text).toContain('Calibrate mission protocol smoke coverage');
    expect((result.structuredContent as any)?.mission).toContain('objective');
  });

  it('combine_packs merges a single foundation pack', async () => {
    const result = await executeMissionProtocolTool(
      'combine_packs',
      { packNames: ['foundation'], format: 'yaml' },
      context
    );

    expect(result.structuredContent?.success).toBe(true);
    expect((result.structuredContent as any)?.combinedPack).toContain('Combined: Foundation');
  });

  it('combine_packs surfaces errors for unknown pack', async () => {
    const result = await executeMissionProtocolTool(
      'combine_packs',
      { packNames: ['non-existent-pack'] },
      context
    );

    expect(result.structuredContent?.success).toBe(false);
    expect((result.structuredContent as any)?.errors?.[0]).toContain('non-existent-pack');
  });


  it('list_available_domains exposes registry packs', async () => {
    const result = await executeMissionProtocolTool('list_available_domains', undefined, context);
    const text = result.content?.[0]?.text ?? '';

    expect(text).toContain('domain pack');
    expect(result.structuredContent).toBeDefined();
  });

  it('create_mission synthesizes a mission YAML', async () => {
    const result = await executeMissionProtocolTool(
      'create_mission',
      {
        objective: 'Build a resilient smoke-test mission',
        domain: 'foundation',
      },
      context
    );

    const text = result.content?.[0]?.text ?? '';
    expect(text).toContain('Build a resilient smoke-test mission');
    expect(text).toContain('missionId');
  });

  it('combine_packs merges a single pack successfully', async () => {
    const result = await executeMissionProtocolTool(
      'combine_packs',
      {
        packNames: ['foundation'],
        format: 'yaml',
      },
      context
    );

    const text = result.content?.[0]?.text ?? '';
    expect(text).toContain('Successfully combined');
    expect((result.structuredContent as any)?.success).toBe(true);
  });

  it('combine_packs reports an error for unknown packs', async () => {
    const result = await executeMissionProtocolTool(
      'combine_packs',
      {
        packNames: ['nonexistent-pack'],
      },
      context
    );

    expect((result.structuredContent as any)?.success).toBe(false);
    expect(result.content?.[0]?.text).toContain('failed');
  });
});
