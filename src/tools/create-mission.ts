/**
 * create_mission MCP Tool
 *
 * Creates a new mission by combining generic template with optional domain-specific fields.
 * Returns validated mission YAML ready for execution.
 *
 * Algorithm:
 * 1. Load generic mission template
 * 2. Generate unique mission ID
 * 3. Populate core fields from params
 * 4. If domain specified, load and merge domainFields
 * 5. Validate final mission against schema
 * 6. Return YAML string
 *
 * @module tools/create-mission
 * @version 1.0
 */

import * as YAML from 'yaml';
import { SecureYAMLLoader } from '../loaders/yaml-loader';
import { RegistryParser } from '../registry/registry-parser';
import { DomainPackLoader } from '../domains/domain-pack-loader';
import { MissionMerger } from '../merge/deep-merge';
import { GenericMission, isGenericMission } from '../schemas/generic-mission';
import { DomainPackEntry } from '../types/registry';
import Ajv from 'ajv';
import { ValidationError } from '../errors/validation-error';
import { ErrorHandler } from '../errors/handler';
import { DomainError } from '../errors/domain-error';
import type { JsonValue } from '../errors/types';

/**
 * Parameters for create_mission tool
 */
export interface CreateMissionParams {
  /** Clear, concise mission objective (required) */
  objective: string;

  /** Optional domain pack name */
  domain?: string;

  /** Optional success criteria list */
  successCriteria?: string[];

  /** Optional constraints list */
  constraints?: string[];
}

/**
 * MCP Tool Definition for create_mission
 */
export const createMissionToolDefinition = {
  name: 'create_mission',
  description:
    "Use this tool to create a new mission based on a user's request. You must provide a clear and concise objective. You can optionally specify a domain from the list provided by get_available_domains (formerly list_available_domains). If no domain is specified, a generic mission will be created.",
  inputSchema: {
    type: 'object',
    required: ['objective'],
    properties: {
      objective: {
        type: 'string',
        description: 'Clear, concise mission goal describing what success looks like',
      },
      domain: {
        type: 'string',
        description:
          'Optional domain pack name (use get_available_domains to see available options)',
      },
      successCriteria: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of measurable success conditions',
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional array of limitations or boundaries',
      },
    },
  },
} as const;

/**
 * CreateMissionToolImpl
 *
 * Main implementation class for mission creation
 */
export class CreateMissionToolImpl {
  private packLoader: DomainPackLoader;
  private merger: MissionMerger;
  private registry: RegistryParser;
  private loader: SecureYAMLLoader;
  private ajv: Ajv;

  constructor(
    packLoader: DomainPackLoader,
    merger: MissionMerger,
    registry: RegistryParser,
    loader: SecureYAMLLoader
  ) {
    this.packLoader = packLoader;
    this.merger = merger;
    this.registry = registry;
    this.loader = loader;
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  /**
   * Execute mission creation
   *
   * @param params - Mission creation parameters
   * @param registryEntries - Available domain pack entries
   * @returns YAML string of the created mission
   * @throws Error if validation fails or domain not found
   */
  async execute(params: CreateMissionParams, registryEntries: DomainPackEntry[]): Promise<string> {
    const contextData = this.buildContextFromParams(params);

    try {
      // Validate input parameters
      this.validateParams(params);

      // 1. Load generic template
      const genericTemplate = await this.loadGenericTemplate();

      // 2. Generate mission ID
      const missionId = this.generateMissionId();

      // 3. Populate core fields from params
      let mission = this.populateCoreFields(genericTemplate, params, missionId);

      // 4. If domain specified, load and merge domainFields
      if (params.domain) {
        mission = await this.mergeWithDomain(mission, params.domain, registryEntries);
      }

      // 5. Validate final mission
      this.validateMission(mission);

      // 6. Return YAML string
      return this.toYAML(mission);
    } catch (error) {
      throw ErrorHandler.wrap(error, 'tools.create_mission.execute', {
        module: 'tools/create-mission',
        data: contextData,
      });
    }
  }

  /**
   * Validate input parameters
   *
   * @param params - Parameters to validate
   * @throws Error if validation fails
   */
  private validateParams(params: CreateMissionParams): void {
    if (!params.objective || params.objective.trim().length === 0) {
      throw new ValidationError('objective is required and cannot be empty', {
        context: { field: 'objective' },
      });
    }

    if (params.domain !== undefined && params.domain.trim().length === 0) {
      throw new ValidationError('domain cannot be empty if provided', {
        context: { field: 'domain' },
      });
    }

    if (params.successCriteria !== undefined && !Array.isArray(params.successCriteria)) {
      throw new ValidationError('successCriteria must be an array', {
        context: { field: 'successCriteria' },
      });
    }

    if (params.constraints !== undefined && !Array.isArray(params.constraints)) {
      throw new ValidationError('constraints must be an array', {
        context: { field: 'constraints' },
      });
    }
  }

  private buildContextFromParams(params: CreateMissionParams): Record<string, JsonValue> {
    return {
      hasObjective: Boolean(params.objective?.trim()),
      objectiveLength: params.objective?.length ?? 0,
      domain: params.domain ?? null,
      successCriteriaCount: params.successCriteria?.length ?? 0,
      constraintsCount: params.constraints?.length ?? 0,
    };
  }

  /**
   * Generate unique mission ID using timestamp and random suffix
   *
   * Format: mission-YYYYMMDD-HHmmss-rrr
   *
   * @returns Unique mission ID
   */
  private generateMissionId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    // Add random suffix for uniqueness when called rapidly
    const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');

    return `mission-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
  }

  /**
   * Load generic mission template from templates directory
   *
   * @returns Generic mission template object
   * @throws Error if template cannot be loaded
   */
  private async loadGenericTemplate(): Promise<GenericMission> {
    try {
      // Load without schema validation to avoid readonly type issues
      const template = await this.loader.load<GenericMission>('generic_mission.yaml');

      // Ensure template has required structure
      if (!isGenericMission(template)) {
        throw new ValidationError('Generic template does not match required structure', {
          context: { template: 'generic_mission.yaml' },
        });
      }

      return template;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error';
      throw new ValidationError(`Failed to load generic template: ${reason}`, {
        context: { template: 'generic_mission.yaml' },
        cause: error,
      });
    }
  }

  /**
   * Populate core fields from parameters
   *
   * @param template - Base generic template
   * @param params - User-provided parameters
   * @param missionId - Generated mission ID
   * @returns Mission with populated core fields
   */
  private populateCoreFields(
    template: GenericMission,
    params: CreateMissionParams,
    missionId: string
  ): GenericMission {
    // Create a new mission object (no mutation)
    const mission: GenericMission = {
      ...template,
      missionId,
      objective: params.objective,
      context: {
        ...template.context,
        constraints: params.constraints || template.context.constraints || [],
      },
      // Ensure successCriteria is never empty (requirement from schema)
      successCriteria:
        params.successCriteria && params.successCriteria.length > 0
          ? params.successCriteria
          : ['Mission objective achieved'],
      // Ensure deliverables is never empty (requirement from schema)
      deliverables: ['Mission completion report'],
    };

    return mission;
  }

  /**
   * Merge mission with domain-specific fields
   *
   * @param mission - Base mission object
   * @param domainName - Name of domain pack to merge
   * @param registryEntries - Available registry entries
   * @returns Mission with merged domain fields
   * @throws Error if domain not found or merge fails
   */
  private async mergeWithDomain(
    mission: GenericMission,
    domainName: string,
    registryEntries: DomainPackEntry[]
  ): Promise<GenericMission> {
    try {
      // Load domain pack
      const domainPack = await this.packLoader.loadPack(domainName, registryEntries);

      // Create extension object with domainFields
      const extension = {
        domainFields: domainPack.template,
      };

      // Merge using deep merge logic
      const merged = this.merger.merge(mission, extension);

      return merged;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found in registry')) {
        throw new DomainError(
          `Domain pack "${domainName}" not found. Use get_available_domains (legacy alias: list_available_domains) to see available options.`,
          {
            code: 'DOMAIN_NOT_FOUND',
            context: { domainName },
          }
        );
      }

      throw ErrorHandler.wrap(
        error,
        'tools.create_mission.merge_with_domain',
        {
          module: 'tools/create-mission',
          data: { domainName },
        },
        {
          userMessage: `Unable to merge domain "${domainName}" into mission.`,
        }
      );
    }
  }

  /**
   * Validate mission against schema
   *
   * @param mission - Mission object to validate
   * @throws Error if validation fails
   */
  private validateMission(mission: GenericMission): void {
    // Use type guard for validation instead of ajv to avoid readonly type issues
    if (!isGenericMission(mission)) {
      throw new ValidationError('Mission does not match GenericMission structure', {
        context: { check: 'isGenericMission' },
      });
    }

    // Additional structural validation
    if (!mission.schemaType || mission.schemaType !== 'Mission') {
      throw new ValidationError('Invalid schemaType', {
        context: { expected: 'Mission', actual: mission.schemaType },
      });
    }

    if (!mission.schemaVersion || mission.schemaVersion !== '2.0') {
      throw new ValidationError('Invalid schemaVersion', {
        context: { expected: '2.0', actual: mission.schemaVersion },
      });
    }

    if (!mission.missionId || mission.missionId.length === 0) {
      throw new ValidationError('Invalid missionId', {
        context: { missionIdLength: mission.missionId?.length ?? 0 },
      });
    }

    if (!mission.objective || mission.objective.length === 0) {
      throw new ValidationError('Invalid objective', {
        context: { objectiveLength: mission.objective?.length ?? 0 },
      });
    }

    if (!Array.isArray(mission.successCriteria) || mission.successCriteria.length === 0) {
      throw new ValidationError('successCriteria must be a non-empty array', {
        context: {
          successCriteriaCount: Array.isArray(mission.successCriteria)
            ? mission.successCriteria.length
            : 0,
        },
      });
    }

    if (!Array.isArray(mission.deliverables) || mission.deliverables.length === 0) {
      throw new ValidationError('deliverables must be a non-empty array', {
        context: {
          deliverablesCount: Array.isArray(mission.deliverables) ? mission.deliverables.length : 0,
        },
      });
    }
  }

  /**
   * Convert mission object to YAML string
   *
   * @param mission - Mission object to serialize
   * @returns Formatted YAML string
   */
  private toYAML(mission: GenericMission): string {
    try {
      // Use YAML.stringify for clean output
      const yamlString = YAML.stringify(mission, {
        indent: 2,
        lineWidth: 0, // Prevent line wrapping
        defaultStringType: 'QUOTE_DOUBLE',
      });

      return yamlString;
    } catch (error) {
      throw ErrorHandler.wrap(
        error,
        'tools.create_mission.to_yaml',
        {
          module: 'tools/create-mission',
          data: {
            missionId: mission.missionId,
          },
        },
        {
          userMessage: 'Unable to serialize mission to YAML.',
        }
      );
    }
  }

  /**
   * Format mission YAML for LLM consumption
   *
   * Adds helpful context and formatting for Claude to understand the output
   *
   * @param yamlString - YAML string to format
   * @returns Formatted string for LLM
   */
  formatForLLM(yamlString: string): string {
    return `# Mission Created Successfully

The following mission has been created and validated:

\`\`\`yaml
${yamlString}
\`\`\`

This mission is ready to be saved and executed. The structure follows the ICEV pattern:
- **Intent**: Defined in the objective
- **Context**: Background, dependencies, and constraints
- **Execution**: Implementation details (in domainFields if domain-specific)
- **Verification**: Success criteria and deliverables

You can now save this mission to a file or modify it as needed.`;
  }
}
