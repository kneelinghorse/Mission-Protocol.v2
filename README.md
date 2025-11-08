# Mission Protocol v2

Mission Protocol v2 is an end-to-end mission automation toolkit. It helps teams author structured work plans, keep guidance synchronized, delegate tasks across sub-agents, and tap into quality, dependency, and telemetry intelligence from one place. Everything is exposed through a Node.js CLI and an MCP server so you can drive the same workflows from command line scripts or desktop AI clients.

## Feature Highlights

### Author Once, Reuse Everywhere
- Curated domain packs provide ready-to-run mission templates covering discovery, product, engineering, research, and quality workflows.
- `create_mission` scaffolds new missions with intent/context/execution blocks, deliverables, and guardrails already in place.
- Template extraction, import/export, and pack combination commands let you promote proven missions into reusable assets or compose new packs safely.

### Intelligence on Tap
- Quality scoring benchmarks clarity, completeness, and AI readiness, returning targeted fixes for the next iteration.
- Dependency analysis maps mission relationships, surfaces blockers early, and infers sequencing so schedules stay realistic.
- Token optimization and mission splitting adapt large plans to tight context windows without losing critical detail.

### Agentic Execution & Memory
- The `agents-md-loader` keeps project guidance current by parsing `agents.md`, enforcing required sections, and updating working memory automatically.
- `agentic-controller` orchestrates RSIP improvement loops, worker-manifest-driven delegation, and boomerang workflows with checkpointing and fallbacks.
- Telemetry streams capture loader validations, mission events, and delegation decisions so complex automation runs stay observable.

### Governance & Observability Built In
- Mission outcome analytics produce JSON artifacts summarizing throughput, blockers, and completion notes for dashboards or CI.
- Context propagators maintain alignment as missions split or move between agents.
- Token validation helpers report model-specific usage and warn whenever heuristic paths are used.

## Architecture Overview

Mission Protocol now ships with a **standalone default mode** and an **optional CMOS-integrated mode**:

- **Standalone** – Uses root-level `agentic_state.json`, `SESSIONS.jsonl`, and `PROJECT_CONTEXT.json`, requires no CMOS assets, and is the mode you ship to downstream consumers.
- **CMOS-Integrated** – Automatically detected when a `cmos/` directory (and `cmos/db/cmos.sqlite`) exists. Enables backlog management, sync automation, and telemetry streaming with the same AgenticController instance.

The `CmosDetector` caches detection results for 60 seconds and exposes `forceRefresh` hooks so tests can toggle modes without restarting the process. The `cmos.sync` automation wiring is opt-in and supports per-mission triggers (`mission_start`, `mission_complete`) plus telemetry source overrides.

See **docs/CMOS_Migration_Guide.md** for the migration checklist, validation matrix (with and without `cmos/`), and troubleshooting steps.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the TypeScript source:
   ```bash
   npm run build
   ```
3. Explore the CLI:
   ```bash
   npx mission-protocol --help
   ```
4. Create a mission from a domain pack:
   ```bash
   npx mission-protocol create_mission \
     --domain foundation \
     --output missions/examples/foundation-kickoff.yaml
   ```
5. Analyze and refine the mission you just generated:
   ```bash
   npx mission-protocol get_dependency_analysis --mission missions/examples/foundation-kickoff.yaml
   npx mission-protocol get_mission_quality_score --mission missions/examples/foundation-kickoff.yaml
   ```

## Core Capabilities

### Mission Design & Templates

- Ship with a catalog of domain packs and tools to author your own.
- `get_available_domains` – Browse domain packs spanning discovery, product, engineering, research, and quality workflows.
- `create_mission` – Generate structured missions from templates with built-in guardrails and suggested deliverables.
- `get_template_extraction`, `create_template_import`, `get_template_export` – Turn successful missions into reusable templates, share them across projects, and serialize them safely.

### Intelligence & Analysis

- Run automated checks to keep plans actionable.
- `get_mission_quality_score` – Evaluate clarity, completeness, and AI readiness with actionable recommendations.
- `get_dependency_analysis` – Visualize dependencies, detect cycles, and infer sequencing.
- `create_mission_splits`, `get_split_suggestions` – Break down complex missions while respecting context and guardrails.
- `update_token_optimization` – Reduce mission size for constrained context windows without losing fidelity.

### Agentic Operations

- Bring project guidance and automation together.
- `agents-md-loader` – Parse project playbooks, enforce required sections, and patch working memory automatically.
- `agentic-controller` – Coordinate sub-mission delegation, RSIP loops, boomerang workflows, and telemetry streams.
- `worker-manifest-loader` – Validate worker manifests, guard delegation paths, and surface actionable diagnostics.

### Governance & Observability

- Keep stakeholders informed and automation transparent.
- `mission-outcome-analytics` – Produce mission outcome reports for downstream tooling.
- `context-propagator` series – Maintain consistent context across mission splits and delegated work.
- `telemetry` helpers – Emit structured metrics for loaders, workflows, and quality gates.

## Documentation

- **[Author Onboarding Guide](docs/Author_Onboarding_Guide.md)** – Walkthrough for new mission authors with catalog overview and workflows.
- **[Agentic Migration Playbook](docs/Agentic_Migration_Playbook.md)** – Upgrade guide for adopting the agent memory and delegation stack.
- **[Intelligence Layer Guide](docs/Intelligence_Layer_Guide.md)** – Deep dive into scoring, splitting, optimization, and dependency tooling.
- **[Extension System Guide](docs/Extension_System_Guide.md)** – Template versioning, migration APIs, and extension best practices.
- **[Extension Patterns Cookbook](docs/Extension_Patterns_Cookbook.md)** – Recipes for assembling advanced mission workflows.
- **[Domain Pack Authoring](docs/domain-pack-authoring.md)** – Standards for creating and publishing new packs.
- **[API References](docs/API_Documentation.md, docs/API_Documentation_Phase4.md)** – Full CLI and MCP tool specifications.
- **[Token Validation Setup](docs/Token_Validation_Setup.md)** – Credential, validation, and CI guidance for token counting services.
- **[CMOS Migration Guide](docs/CMOS_Migration_Guide.md)** – Step-by-step plan for upgrading existing repositories to the optional CMOS architecture and validating both modes.

## Integrating with MCP Clients

Configure Claude Desktop (`claude_desktop_config.json`) to expose the Mission Protocol server:

```json
{
  "mcpServers": {
    "mission-protocol": {
      "command": "node",
      "args": ["/path/to/mission-protocol/dist/index.js"]
    }
  }
}
```

Example prompts once connected:

```
Analyze dependencies for missions/current.yaml
Optimize missions/product-launch/*.yaml for token usage
Score the quality of missions/onboarding.yaml
```

## Workspace Tips

- Keep `agents.md` current so loaders can refresh working memory with versioned guidance.
- Store generated artifacts under `artifacts/` for downstream automation (e.g., mission outcomes, quality metrics).
- Use `npm run lint`, `npm run format`, or other package scripts when you need local validation or formatting support.

Mission Protocol v2 gives teams a single place to plan missions, apply intelligence, and operate with agentic guardrails—whether through the CLI, MCP integrations, or custom automation.
