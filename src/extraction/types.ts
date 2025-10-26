/**
 * Type definitions for the Template Extraction system.
 * Based on research mission R3.1.
 */

/**
 * Defines a single configurable parameter for a template.
 */
export interface TemplateParameter {
  /** The data type of the parameter, used for UI generation and validation. */
  type: 'string' | 'number' | 'boolean' | 'choice';

  /** A human-readable description of the parameter, shown to the user. */
  description: string;

  /** The default value to be used if the user provides no input. */
  default?: string | number | boolean;

  /** For parameters of type 'choice', a list of valid options. */
  choices?: string[];

  /** An optional regular expression for validating string inputs. */
  validationRegex?: string;

  /** Whether the user must provide a value for this parameter. */
  required: boolean;
}

/**
 * The root metadata object for an extracted mission template.
 * This file (template-metadata.json) lives at the root of the template directory.
 */
export interface TemplateMetadata {
  // --- Descriptive Metadata ---
  /** A unique, machine-readable identifier for the template (e.g., 'java-microservice'). */
  templateId: string;

  /** The semantic version of the template itself (e.g., '1.2.0'). */
  templateVersion: string;

  /** A human-readable name for display in catalogs (e.g., 'Java Spring Boot Microservice'). */
  name: string;

  /** A detailed paragraph explaining the template's purpose and the kind of mission it generates. */
  description: string;

  /** The email or username of the template's author or maintainer. */
  author: string;

  /** An array of searchable keywords to aid in discoverability (e.g., ['java', 'spring-boot', 'api']). */
  tags: string[];

  // --- Operational Metadata ---
  /** A map defining all the parameters that the template accepts. The keys are the variable names used in the template files. */
  parameters: Record<string, TemplateParameter>;

  // --- Provenance and Quality Metrics ---
  /** The unique ID of the successful mission this template was originally extracted from, if applicable. */
  sourceMissionId?: string;

  /** The historical success rate of the source mission type, providing a baseline quality indicator. */
  sourceMissionSuccessRate?: number;

  /** The ISO 8601 timestamp of when the template was created. */
  creationDate: string;

  /** The ISO 8601 timestamp of the last modification to the template. */
  lastUpdatedDate: string;

  /** A counter for how many times this template has been used to generate a new mission. */
  usageCount: number;

  /** The success rate (0.0 to 1.0) of missions that were generated from this template. */
  generatedSuccessRate: number;
}

/**
 * Represents a candidate element identified for potential parameterization.
 */
export interface Candidate {
  /** The type of candidate identified */
  type: 'literal' | 'identifier' | 'config-value' | 'path-segment' | 'magic-number';

  /** The actual value/content of the candidate */
  value: string | number;

  /** File path where this candidate was found */
  filePath: string;

  /** Line number in the file */
  lineNumber: number;

  /** Frequency of this value across the mission */
  frequency: number;

  /** Confidence score for parameterization (0.0 to 1.0) */
  confidence: number;

  /** Context information (e.g., surrounding code, config key name) */
  context?: string;
}

/**
 * Map of candidates organized by suggested parameter name.
 */
export interface CandidateMap {
  [parameterName: string]: Candidate[];
}

/**
 * Represents a partially extracted template with placeholders.
 */
export interface ExtractedTemplate {
  /** The file structure with Jinja2 placeholders */
  fileStructure: TemplateFile[];

  /** The extracted metadata */
  metadata: TemplateMetadata;

  /** Optional hooks for pre/post generation */
  hooks?: {
    preGenerate?: string;
    postGenerate?: string;
  };
}

/**
 * Represents a single file in the template structure.
 */
export interface TemplateFile {
  /** Original file path (may contain Jinja2 placeholders) */
  path: string;

  /** File content with Jinja2 placeholders and control blocks */
  content: string;

  /** Whether this file is optional (wrapped in conditional) */
  optional?: boolean;

  /** The condition for including this file (if optional) */
  condition?: string;
}

/**
 * Configuration for the extraction process.
 */
export interface ExtractionConfig {
  /** Path to the source mission directory */
  sourceMissionPath: string;

  /** Author name for the template metadata */
  author: string;

  /** Minimum confidence threshold for auto-parameterization (0.0 to 1.0) */
  confidenceThreshold?: number;

  /** Whether to enable AST-based analysis */
  enableASTAnalysis?: boolean;

  /** File patterns to exclude from analysis */
  excludePatterns?: string[];
}

/**
 * Result of Stage 1: Candidate Identification
 */
export interface Stage1Result {
  /** Annotated candidates for parameterization */
  candidates: CandidateMap;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Number of files analyzed */
  filesAnalyzed: number;
}

/**
 * Result of Stage 2: Automated Parameterization
 */
export interface Stage2Result {
  /** The draft template */
  template: ExtractedTemplate;

  /** Execution time in milliseconds */
  executionTime: number;

  /** Number of parameters generated */
  parametersGenerated: number;
}

/**
 * Complete extraction result returned to the user.
 */
export interface ExtractionResult {
  /** Whether the extraction was successful */
  success: boolean;

  /** The extracted template (if successful) */
  template?: ExtractedTemplate;

  /** Stage 1 results for review */
  stage1?: Stage1Result;

  /** Stage 2 results for review */
  stage2?: Stage2Result;

  /** Any error messages */
  errors?: string[];

  /** Total execution time in milliseconds */
  totalTime: number;
}
