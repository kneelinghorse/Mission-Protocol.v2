# Artifact Summaries

## 01_dependencies.json
- Keys: package.json, pyproject.toml, requirements.txt, setup.py

## 01_directory_structure.txt
- lines: 954

## 01_file_inventory.json
- Keys: files, summary

## 02_domain_analysis.json
- Keys: domain_root_exists, domains_analyzed, unused_or_duplicate, errors

## 02_domain_definitions.json
- Keys: files

## 02_domain_list.yaml
- YAML file recorded (see raw for details)

## 03_tool_signatures.json
- Keys: files

## 03_tool_usage_analysis.json
- Keys: usage

## 03_unused_tools.json
- Keys: threshold, unused_tools

## 04_code_smells.json
- Keys: long_functions, large_files, deep_nesting, duplicate_blocks, todo_comments

## 04_complexity_metrics.json
- Keys: file_metrics, derived

## 04_error_handling_gaps.json
- Keys: functions_without_error_handling, missing_input_validation, potential_unhandled_promises

## 04_lint_results.json
- Keys: results
- entries: 3

## 05_coverage_report.json
- Keys: totals, files, file_count
- totals: lines_found: 3235, lines_hit: 3070, lines_percent: 94.9, functions_found: 572, functions_hit: 551

## 05_test_inventory.json
- Keys: patterns, test_files, total

## 05_test_quality.json
- Keys: files_analyzed, per_file, module_test_counts, totals, flaky_candidates
- totals: tests: 801, assertions: 1779

## 05_untested_modules.json
- Keys: threshold, modules

## 06_api_consistency.json
- Keys: naming_issues, parameter_pattern_issues, missing_return_annotations, error_handling_notes, counts
- counts: total_exports: 116, naming_issue_count: 4, parameter_issue_count: 6, missing_return_annotations: 61

## 06_api_surface.json
- Keys: exports, counts
- counts: total: 116, documented: 116, undocumented: 0

## 06_breaking_changes.json
- Keys: status, reason, notes

## 07_bottlenecks.json
- Keys: synchronous_file_operations, nested_loops, large_data_structures, inefficient_queries

## 07_complexity_analysis.json
- Keys: targets, analysis

## 07_resource_usage.json
- Keys: memory_allocations, file_handles, network_calls

## 08_dependency_vulnerabilities.json
- Keys: auditReportVersion, vulnerabilities, metadata

## 08_input_validation.json
- Keys: file_system_operations, user_inputs, external_data

## 08_security_issues.json
- Keys: eval_usage, unsafe_deserialization, command_injection_risk, path_traversal_risk, hardcoded_secrets

## 09_doc_coverage.json
- Keys: functions_with_docs, functions_total, function_doc_coverage_percent, example_sections_detected, api_reference_mentions

## 09_doc_quality.json
- Keys: readability_scores, broken_links, outdated_examples, missing_sections, notes

## 09_documentation_inventory.json
- Keys: patterns, files, total

## 10_feature_requests.json
- Keys: patterns, matches

## 10_not_implemented.json
- Keys: patterns, matches

## 10_technical_debt.json
- Keys: workaround, deprecated, commented_code, hack_comments, temporary_solution

## 11_categorized_issues.json
- Keys: critical, high_priority, medium_priority, low_priority, nice_to_have

## 11_compiled_findings.json
- Keys: total_findings, findings
- total_findings: 258

## 11_improvement_roadmap.json
- Keys: immediate, short_term, medium_term, long_term

## 11_recommendations.json
- Keys: recommendations

## architecture_summary.json
- Keys: src, lib, tools, templates, domains

## summary_metrics.json
- Keys: findings_by_severity, findings_by_category, coverage_percent, branch_coverage_percent, lint_summary

## top10_issues.json
- entries: 10
