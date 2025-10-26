# Mission Protocol v2

An AI-powered mission planning and execution system with intelligent optimization, quality scoring, and dependency analysis.

## Project Status

**Sprint 1 - Template Recovery: In Progress** ✅

- **Tests**: 742/742 passing with 94%+ overall coverage (statements: 94.29%, branches: 85.09%, functions: 95.86%, lines: 94.51%). Phase 2 integration tests fully operational.
- **Runtime assets**: Templates successfully restored with `registry.yaml`, `generic_mission.yaml`, and 5 domain packs. Mission authoring flows are operational.
- **MCP surface**: Phase 4 tools (`optimize_tokens`, `split_mission`, `suggest_splits`) are registered with the MCP server and covered by smoke tests, returning structured token usage telemetry.
- **Token intelligence**: Hybrid asynchronous token counting (GPT tokenizer, Claude tokenizer via Transformers.js, Gemini heuristic) powers tool responses; Gemini paths emit warnings when heuristic estimations are used.
- **Documentation**: README, Phase 4 report, and backlog updated (B1.3) to reflect the restored template store and green integration tests.

## Quick Start

Mission Protocol v2 provides MCP tools for autonomous mission management:

### Phase 4: Intelligence Layer (Current)
- **`score_quality`** - Assess mission quality across Clarity, Completeness, AI-Readiness
- **`optimize_tokens`** - Reduce token usage 20-30% while preserving semantics
- **`analyze_dependencies`** - Detect and visualize mission dependencies
- **`split_mission`** / **`suggest_splits`** - Automatically split complex missions

### Phase 3: Extension System
- **`extract_template`** - Convert missions into reusable templates
- **`import_template`** / **`export_template`** - Share templates across projects
- **`combine_packs`** - Merge domain packs with dependency resolution
- **Versioning tools** - Template version management and migrations

### Phase 1-2: Foundation
- **`list_available_domains`** - Browse domain packs (5 packs available: foundation, software.technical-task, business.market-research, build.implementation, build.technical-research)
- **`create_mission`** - Generate missions from domain templates (operational with restored templates)

## Documentation

### User Guides
- **[Intelligence Layer Guide](docs/Intelligence_Layer_Guide.md)** - Phase 4 tools with workflows and examples
- **[Extension System Guide](docs/Extension_System_Guide.md)** - Phase 3 template management
- **[Extension Patterns Cookbook](docs/Extension_Patterns_Cookbook.md)** - Common patterns and recipes

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
3. Execute the Jest suite (all 742 tests should pass)
   ```bash
   npm test
   ```

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
