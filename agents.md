# Mission Protocol Agent Playbook

## Project Overview
- **Project Name**: Mission Protocol v2
- **Primary Stack**: TypeScript + Node.js (CommonJS runtime)
- **Purpose**: Deliver Model Context Protocol tooling with CMOS-aligned mission planning and execution workflows.
- **Key Paths**:
  - `src/` – MCP server implementation
  - `cmos/` – Context, missions, and research artifacts
  - `tests/` – Jest suites covering tools, intelligence, and security layers

## Build & Development Commands
```bash
# Install dependencies
npm install

# Type check + compile
npm run build

# Primary test suite
npx jest --runInBand

# Lint + formatting
npm run lint && npm run format:check
```

## Coding Standards & Style
- Favor pure functions with explicit inputs/outputs; avoid hidden state.
- Keep modules under 400 lines; split helpers into `src/utils/` when cross-cutting.
- Use descriptive mission summaries in `SESSIONS.jsonl`; keep them single-line.
- When adding TypeScript types, prefer readonly properties for immutable configs.

## Security & Quality Guardrails
- File writes must stay within the mission workspace; use `workspace-io` helpers.
- Append-only policies for `SESSIONS.jsonl` and mission notes; never delete history.
- Block on unreadable `agents.md` or corrupt `PROJECT_CONTEXT.json`; warn for missing sections.
- Tests are required for all new loaders or mission intelligence utilities.

## Architecture Patterns
- Mission backlog is the source of truth (`cmos/missions/backlog.yaml`).
- `PROJECT_CONTEXT.json` mirrors CMOS working memory; update after every session.
- Intelligence tooling (tokenizers, analyzers) resides in `src/intelligence/` with focused Jest coverage.
- Mission outputs surface through artifacts under `artifacts/` for downstream automation.

## AI Agent Specific Instructions
- Read this playbook plus `PROJECT_CONTEXT.json` before selecting missions.
- Promote the first available mission (In Progress → Current → Queued) and log start/completion events.
- Use `agents-md-loader` utilities when integrating memory guidance into tools.
- Escalate blockers with `needs:[]` hints and avoid reordering backlog items without notes.

## Pattern Configuration
- `boomerang.enabled`: true
- `boomerang.retention_days`: 7
- `boomerang.cleanup_cadence`: "daily"
- `boomerang.fallback_threshold`: 2

## Telemetry & Validation
- Record loader metrics (bytes, duration, validation codes) when wiring telemetry hooks.
- Respect 60-second cache TTL for agents.md loads unless force refreshing.
- Track `agents_md_loaded` and `agents_md_version` in `PROJECT_CONTEXT.json` after each run.
- Surface warnings but continue execution when sections are missing or empty.

---

**Last Updated**: 2025-11-04
**Version**: 1.0.1
**Maintained by**: Mission Protocol Team
