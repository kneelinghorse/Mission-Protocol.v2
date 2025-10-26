# Artifact Summaries

## 01_directory_structure.txt
- 1 825 lines enumerating repository tree (node_modules/dist omitted)

## 02_domain_analysis.json
- 24 packs analysed
- 20 packs unused (no references in src/tests)
- Avg template field count: 20, max depth: 3

## 03_tool_usage_analysis.json
- 12 tool modules
- 30 tool definition exports, 25 function exports
- Usage gathered across src/tests; no unused tools

## 04_complexity_metrics.json
- 75 files, 17 689 LOC, 1 107 decision points
- Most complex: `src/extraction/template-extractor.ts` (63 decision points, 634 LOC)

## 05_coverage_report.json
- Status: failed (5 suites)
- Coverage not generated; captures individual suite failures with TS diagnostics

## 06_api_surface.json
- 93 exports captured across `src/index.ts` and `src/tools/*.ts`
- Breakdown: 25 functions, 6 classes, 33 variables, 27 interfaces, 2 types

## 07_bottlenecks.json
- Highlights large files, nested loop hotspots, sequential dependency resolution, and telemetry noise

## 08_security_issues.json
- Strengths: SecureYAMLLoader, sanitized import/export flows
- Warnings: unsanitized write tools, telemetry leakage, lack of rollback safeguards
- Notes npm audit (2025-10-26) clean

## 09_doc_coverage.json
- Repo Markdown files: 679 (9 within docs/)
- API doc coverage: 61.54%
- 36 undocumented exports listed

## 10_technical_debt.json
- Tracks long files, failing suites, API drifts, tooling gaps, security follow-ups

## 11_categorized_issues.json
- Severity counts: high 17, medium 34, low 22, info 1

## 11_compiled_findings.json
- Total findings: 74 (see per-category breakdown)

## 11_improvement_roadmap.json
- Keys: immediate, short_term, medium_term, long_term

## 11_recommendations.json
- 15 actionable items with impact/effort/risk metadata
