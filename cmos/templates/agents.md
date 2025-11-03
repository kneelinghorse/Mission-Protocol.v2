# CMOS Agent Guidance Template

Use this template to describe how AI agents should collaborate on your project.
Keep instructions concise, actionable, and update the version whenever guidance changes.

## Project Overview
- **Project Name**: <project-name>
- **Primary Stack**: <languages / frameworks>
- **Purpose**: <short description>
- **Key Repositories / Paths**:
  - ./

## Build & Development Commands
```bash
# Initialization
npm install

# Local development
npm run dev

# Test suites
npm test
```

## Coding Standards & Style
- TypeScript preferred for new modules
- ESLint and Prettier required before commits
- Keep functions under 60 lines; refactor helpers when larger

## Security & Quality Guardrails
- Never commit secrets – use `.env.example`
- All CI workflows must pass before release
- Maintain tests for new loaders and context utilities

## Architecture Patterns
- Mission Protocol tooling orchestrates domain packs via MCP
- CMOS context lives in `cmos/` with PROJECT_CONTEXT.json as the working memory
- Prefer pure functions with explicit inputs/outputs for mission utilities

## AI Agent Specific Instructions
- Always read this file before starting a mission
- Verify `PROJECT_CONTEXT.json` pointers match current mission
- Append to `SESSIONS.jsonl`; never rewrite history
- Escalate blockers with actionable `needs` entries

## Telemetry & Validation
- Log loader metrics (duration, size) when integrating tooling
- Warn (not block) when sections are missing; block on unreadable files
- Target cache TTL: 60 seconds for agents.md parsing results

---

**Last Updated**: 2025-11-03
**Version**: 1.0.0
**Maintained by**: <owner or team>
