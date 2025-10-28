# Mission Protocol v2

An AI-powered mission planning and execution system with intelligent optimization, quality scoring, and dependency analysis.

## Project Status

**Sprint 4 – Intelligence Platform Refinement: Completed**

- ✅ B4.1 token telemetry hardening (bootstrap preloads, health metrics, verbosity controls)
- ✅ B4.2 quality tooling baseline (ESLint/Prettier enforcement, tool snapshots, metrics pipeline)
- ✅ B4.3 discovery workflow packs with linked samples, smoke coverage, and registry validation
- ✅ B4.4 workspace security guardrails with centralised allowlists and hardened path validation
- ✅ B4.5 engineering + process workflow packs with cross-pack dependencies and smoke coverage
- ✅ B4.6 README & documentation refresh (docs aligned with telemetry and tooling updates)
- ✅ B4.7 product workflow integration (product workflow samples, smoke coverage, validation, docs)
- ⏭️ B5.1 mission outcome analytics promoted to Current for Sprint 5 kickoff

**Sprints 1–3 – Template Recovery → Mission Tooling Stabilisation (Completed)**

- Restored canonical templates and registry, re-enabled Phase 2 integration suites, refreshed baseline docs.
- Delivered hybrid offline token counting, MCP registration for intelligence tools, and telemetry validation pipeline.
- Hardened write-enabled tools, restored optimise/split contracts, and aligned dependency analyser + migration tests.

**Quality Snapshot**

- Tests: 803/803 Jest tests passing (unit, integration, discovery + engineering + product smoke suites).
- Coverage: ~94% statements / 85% branches / 96% functions / 95% lines on latest run.
- Metrics: `npm run metrics` writes complexity stats to `artifacts/quality-metrics/latest.json`.

## Quick Start

Mission Protocol v2 provides MCP tools for autonomous mission management:

### Phase 4: Intelligence Layer (Current)

- **`get_mission_quality_score`** (formerly `score_quality`) - Assess mission quality across Clarity, Completeness, AI-Readiness
- **`update_token_optimization`** (formerly `optimize_tokens`) - Reduce token usage 20-30% while preserving semantics
- **`get_dependency_analysis`** (formerly `analyze_dependencies`) - Detect and visualize mission dependencies
- **`create_mission_splits`** / **`get_split_suggestions`** (formerly `split_mission` / `suggest_splits`) - Automatically split complex missions

### Phase 3: Extension System

- **`get_template_extraction`** (alias `extract_template`) - Convert missions into reusable templates
- **`create_template_import`** / **`get_template_export`** (aliases `import_template` / `export_template`) - Share templates across projects
- **`create_combined_pack`** (alias `combine_packs`) - Merge domain packs with dependency resolution
- **Versioning tools** - Template version management and migrations

### Phase 1-2: Foundation

- **`get_available_domains`** (alias `list_available_domains`) - Browse domain packs (5 packs available: foundation, software.technical-task, business.market-research, build.implementation, build.technical-research)
- **`create_mission`** - Generate missions from domain templates (operational with restored templates)

## Documentation

### User Guides

- **[Intelligence Layer Guide](docs/Intelligence_Layer_Guide.md)** - Phase 4 tools with workflows and examples
- **[Extension System Guide](docs/Extension_System_Guide.md)** - Phase 3 template management
- **[Extension Patterns Cookbook](docs/Extension_Patterns_Cookbook.md)** - Common patterns and recipes
- **[Discovery Workflow](docs/discovery-workflow.md)** - Sprint 4 Phase 1 pack progression plus validation checks
- **[Engineering Workflow](docs/engineering-workflow.md)** - Sprint 4 Phase 2 engineering/process packs walkthrough
- **[Product Workflow](docs/product-workflow.md)** - Sprint 4 Phase 3 product packs with market-to-launch alignment
- **[Domain Pack Authoring](docs/domain-pack-authoring.md)** - Guidelines for building and publishing new packs
- **[API Naming Convention](docs/api-naming-convention.md)** - Canonical tool naming and alias policy

### API References

- **[Phase 4 API Documentation](docs/API_Documentation_Phase4.md)** - Intelligence Layer complete API
- **[Phase 3 API Documentation](docs/API_Documentation.md)** - Extension System complete API

### Project Planning

- **`cmos/Phase_4_Completion_Report.md`** – Intelligence Layer report with the February 2025 post-assessment update
- **`cmos/roadmap.md`** – Product roadmap and design principles
- **`cmos/research/`** – Research archives from prior phases
- **`docs/Token_Validation_Setup.md`** – API credential, validation, and CI guidance for token counting

## Installation & Usage

1. Install dependencies
   ```bash
   npm install
   ```
2. Run the TypeScript build
   ```bash
   npm run build
   ```
3. Execute the Jest suite (all 803 tests should pass)
   ```bash
   npm test
   ```

### Quality Tooling

- `npm run lint` / `npm run lint:fix` enforce the TypeScript/ESLint baseline introduced in Sprint 4.
- `npm run format:check` validates Prettier style; use `npm run format` to apply fixes.
- `npm run snapshots` verifies MCP tool definition contracts via Jest snapshots (R15 guardrail).
- `npm run metrics` captures lightweight complexity metrics at `artifacts/quality-metrics/latest.json` for CI artifacts.

### MCP Integration

Configure in Claude Desktop (`claude_desktop_config.json`):

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

Then use in Claude:

```
Can you score the quality of missions/current.yaml?
Can you optimize missions/sprint-04/*.yaml for tokens?
Can you analyze dependencies in missions/sprint-04?
```

#### Token Counting & Async Usage

- Intelligence tools return `structuredContent.tokenUsage` alongside human-readable summaries. Token counts and estimated costs are produced by the asynchronous TokenizerFactory introduced in Sprint 2.
- Always `await` the `tools/call` promise before reading `structuredContent`; the server lazily loads tokenizer models (e.g., Transformers.js for Claude) on first use.
- When the Gemini heuristic path is used, the server emits a `tokenUsage.heuristicWarning` field and logs a warning to `stderr` so clients can surface the risk of over-counting.
- Token usage metrics reflect the target model supplied in tool arguments (`targetModel` for `optimize_tokens`, implicit model for splitting tools). Adjust the model parameter if you need GPT vs. Claude baselines.

**Accuracy & Monitoring:**

- **GPT**: 100% accurate using `gpt-tokenizer` (reference implementation, no API required)
- **Claude**: Uses unofficial `Xenova/claude-tokenizer` from Transformers.js. May drift up to 50% from official Anthropic API. Weekly CI validation monitors drift.
- **Gemini**: Heuristic-based (1.5x safety margin) until official JS tokenizer becomes available. May overestimate by up to 100%.
- All tokenizers emit telemetry warnings when using unofficial or heuristic methods. See `docs/Token_Validation_Setup.md` for validation instructions.

## Project Structure

```
mission-protocol-v2/
├── cmos/                         # Roadmap, reports, and research notes
├── docs/                         # User guides and API documentation
├── dist/                         # Compiled Node entry point (`npm run build`)
├── src/
│   ├── intelligence/             # Phase 4: token optimization, splitting, dependency analysis
│   ├── quality/                  # Phase 4: quality scoring system
│   ├── extraction/               # Phase 3: template extraction
│   ├── import-export/            # Phase 3: template sharing
│   ├── combination/              # Phase 3: pack combination
│   ├── versioning/               # Phase 3: version management
│   ├── domains/                  # Phase 1-2: domain pack loading
│   ├── tools/                    # MCP tool implementations
│   └── index.ts                  # MCP server entry point
├── tests/                        # Jest suites
├── templates/                    # Domain packs, registry, and generic mission template (restored in Sprint 1)
├── package.json
└── tsconfig.json
```
