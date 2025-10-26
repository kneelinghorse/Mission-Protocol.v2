# Template Runtime Store

This directory contains the canonical mission templates for the Mission Protocol system.

## Contents

### Core Templates

- **registry.yaml** - Central registry of all available domain packs
- **generic_mission.yaml** - Universal mission template following the ICEV pattern (Intent-Context-Execution-Verification)

### Domain Packs

All domain packs are located in the `packs/` directory. Each pack contains:
- `pack.yaml` - Manifest with metadata and version information
- `schema.json` - JSON Schema defining the structure of domain-specific fields
- `template.yaml` - Default template with placeholder values

#### Available Domain Packs

1. **foundation** (v1.0.0)
   - Core infrastructure and governance baseline
   - Fields: governanceChecklist, stakeholders

2. **software.technical-task** (v1.0.0)
   - Software development missions
   - Fields: userStory, technicalApproach, nonFunctionalRequirements, outOfScope

3. **business.market-research** (v1.0.0)
   - Business analysis and market research
   - Fields: stakeholders, keyMetrics, dataSources, researchSummary

4. **build.implementation** (v1.0.0)
   - Technical implementation and development builds
   - Fields: type, implementationSteps, technicalDependencies, testingStrategy, rollbackPlan

5. **build.technical-research** (v1.0.0)
   - Technical research and architectural investigation
   - Fields: type, researchObjectives, technologiesUnderInvestigation, evaluationCriteria, prototypeRequirements

- The registry also includes discovery sequencing packs (`discovery.*`), engineering workflows (`engineering.*`, `process.*`, `qa.bug-report`), product strategy templates (`product.*`, `market.customer-development`, `design.ux-research-summary`), research scaffolds (`research.general`), and architecture handoffs (`build.architecture-mission`). Run `mission-protocol list_available_domains` to view every pack name and description.

## Provenance

These templates were restored in Sprint 1 (B1.1) based on:
- Architectural specifications from `cmos/research/r1.1_The_Universal_Mission_Framework.md`
- Design patterns from `cmos/research/r1.2_Architectural_Design_Specification.md`
- Domain pack authoring guidelines from `docs/domain-pack-authoring.md`

All templates validate against their respective schemas and successfully load through the `DomainPackLoader`.

## Verification

Run the smoke test to verify template integrity:

```bash
npm test -- tests/integration/template-runtime-store.test.ts
```

## Usage

Templates are loaded automatically by the MCP server at initialization. They can be accessed via:
- `list_available_domains` - List all registered domain packs
- `create_mission` - Create a new mission using a domain pack

## Maintenance

When adding new domain packs:
1. Create directory in `packs/`
2. Add `pack.yaml`, `schema.json`, and `template.yaml`
3. Register in `registry.yaml`
4. Run smoke test to verify
5. Update this README
