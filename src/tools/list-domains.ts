/**
 * List Domains Tool
 *
 * MCP tool implementation for discovering available domain packs.
 * Returns LLM-optimized list of domains from the registry.
 *
 * @module tools/list-domains
 */

import { RegistryParser } from '../registry/registry-parser';
import { DomainPackEntry } from '../types/registry';
import { DomainInfo } from '../types/tools';

/**
 * List Domains Tool Implementation
 *
 * Provides domain discovery capabilities for the MCP server.
 * Reads from the registry and formats output for LLM consumption.
 */
export class ListDomainsToolImpl {
  private registry: RegistryParser;

  constructor(registry: RegistryParser) {
    this.registry = registry;
  }

  /**
   * Execute the tool: load registry and return domain info
   *
   * @param registryPath - Path to registry.yaml file
   * @returns Array of domain information
   * @throws Error if registry cannot be loaded or is invalid
   */
  async execute(registryPath: string = 'registry.yaml'): Promise<DomainInfo[]> {
    try {
      // Load all domain entries from registry
      const entries = await this.registry.loadRegistry(registryPath);

      // Convert to simplified DomainInfo format
      return entries.map(entry => this.toDomainInfo(entry));
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('File not found') || error.message.includes('ENOENT'))
    ) {
      return [];
    }
    throw error;
  }
}

  /**
   * Convert DomainPackEntry to DomainInfo
   * Extracts only the information needed for tool output
   *
   * @param entry - Full domain pack entry
   * @returns Simplified domain info
   */
  private toDomainInfo(entry: DomainPackEntry): DomainInfo {
    const info: DomainInfo = {
      name: entry.name,
      description: entry.description,
      version: entry.version,
    };

    if (entry.author) {
      info.author = entry.author;
    }

    return info;
  }

  /**
   * Format domains for LLM readability
   * Creates a human-friendly description of available domains
   *
   * @param domains - Array of domain information
   * @returns Formatted string optimized for LLM consumption
   */
  formatForLLM(domains: DomainInfo[]): string {
    if (domains.length === 0) {
      return 'No domain packs are currently available in the registry.';
    }

    const lines: string[] = [
      `Found ${domains.length} domain pack${domains.length === 1 ? '' : 's'}:`,
      '',
    ];

    domains.forEach((domain, index) => {
      lines.push(`${index + 1}. **${domain.name}** (v${domain.version})`);
      lines.push(`   ${domain.description}`);
      if (domain.author) {
        lines.push(`   Author: ${domain.author}`);
      }
      lines.push(''); // Blank line between entries
    });

    return lines.join('\n');
  }
}

/**
 * MCP Tool Definition
 * Canonical specification for retrieving available domains
 */
export const getAvailableDomainsToolDefinition = {
  name: 'get_available_domains',
  description:
    "Get a list of all available domain-specific mission types you can create. Call this when the user asks 'what can you do?' or 'what kinds of missions are there?'.",
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
} as const;

/**
 * Legacy alias maintained for one release cycle
 */
export const listAvailableDomainsToolDefinitionDeprecated = {
  ...getAvailableDomainsToolDefinition,
  name: 'list_available_domains',
  description:
    '[DEPRECATED] Use get_available_domains instead. Provides the same list of domain-specific mission types.',
} as const;
