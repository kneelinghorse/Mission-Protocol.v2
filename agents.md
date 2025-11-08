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

## Integration Modes & CMOS Configuration

- **Standalone (default)** – Ship `agentic_state.json`, `SESSIONS.jsonl`, and `PROJECT_CONTEXT.json` in the repo root. No `cmos/` assets required. Run `npm run build && npm run test:performance` and `./cmos/cli.py db show current` before publishing starter templates.
- **CMOS-Integrated (optional)** – When a `cmos/` directory and `cmos/db/cmos.sqlite` are present, the `CmosDetector` advertises the integration to `AgenticController`. Detection caches for 60 seconds; call `controller.getCmosDetection({ forceRefresh: true })` to re-check after filesystem changes.

| Option | Description | Default |
| --- | --- | --- |
| `cmos.enabled` | Toggles optional CMOS features without deleting `cmos/`. | `true` |
| `cmos.projectRoot` | Root folder scanned for `cmos/`. | `process.cwd()` |
| `cmos.detectionOptions.cacheTtlMs` | TTL for detector cache. Use `0` in tests that rename `cmos/`. | `60_000` |
| `cmos.sync.enabled` | Runs CMOS sync automation (contexts + sessions) when the DB is present. | `false` |
| `cmos.sync.triggers` | Lifecycle hooks that fire sync (`mission_start`, `mission_complete`). | `['mission_start','mission_complete']` |
| `cmos.sync.includeSessionEvents` | Pushes `SESSIONS.jsonl` entries into SQLite after each lifecycle event. | `true` |
| `cmos.sync.includeContexts` | Adds PROJECT/MASTER context mirrors to each sync pass. | `false` |

**Controller wiring example**:
```ts
const controller = new AgenticController({
  statePath: resolve('agentic_state.json'),
  sessionsPath: resolve('SESSIONS.jsonl'),
  cmos: {
    enabled: process.env.CMOS_ENABLED !== 'false',
    projectRoot: process.cwd(),
    detectionOptions: { cacheTtlMs: 60_000 },
    sync: {
      enabled: process.env.CMOS_SYNC === '1',
      triggers: ['mission_start', 'mission_complete'],
      includeSessionEvents: true,
      includeContexts: false,
    },
  },
});
```

**Validation Runbooks**:
- *With CMOS*: run `npm run build`, `npm run test:performance`, and `./cmos/cli.py db show current`.
- *Without CMOS*: temporarily rename `cmos/` (e.g., `mv cmos cmos.hidden`), run `npm run test:performance`, then restore the directory and re-check DB health.

Reference `docs/CMOS_Migration_Guide.md` for the complete migration checklist and troubleshooting tips.

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

## CMOS Sync Configuration
- `cmos.sync.enabled`: false (opt-in). When true, the Agentic Controller runs CMOS sync after mission `start`/`complete` events while keeping failures non-blocking.
- `cmos.sync.direction`: `bidirectional` unless telemetry or compliance requires forcing `files_to_db`/`db_to_files`.
- `cmos.sync.frequency`: defaults to `manual`; switch to `interval` to throttle high-volume automation.
- `cmos.sync.triggers`: `["mission_start", "mission_complete"]` by default; use `per_mission` overrides when sync must only follow completions.
- `cmos.sync.includeSessionEvents`: true to push `SESSIONS.jsonl` entries into SQLite after every lifecycle event.
- `cmos.sync.includeContexts`: false unless you specifically need context mirrors refreshed on each sync (can be toggled per mission family).

## Telemetry & Validation
- Record loader metrics (bytes, duration, validation codes) when wiring telemetry hooks.
- Respect 60-second cache TTL for agents.md loads unless force refreshing.
- Track `agents_md_loaded` and `agents_md_version` in `PROJECT_CONTEXT.json` after each run.
- Surface warnings but continue execution when sections are missing or empty.

---

**Last Updated**: 2025-11-04
**Version**: 1.0.1
**Maintained by**: Mission Protocol Team
