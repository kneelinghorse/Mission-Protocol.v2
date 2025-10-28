import { describe, expect, test } from '@jest/globals';
import { getToolDefinitions } from '../../src/index';
import {
  optimizeTokensToolDefinition,
  optimizeTokensToolDefinitionDeprecated,
  updateTokenOptimizationToolDefinition,
} from '../../src/tools/optimize-tokens';

describe('Tool definitions contract', () => {
  test('optimize tokens exports remain backwards compatible', () => {
    expect(optimizeTokensToolDefinition).toBe(updateTokenOptimizationToolDefinition);
    expect(updateTokenOptimizationToolDefinition.name).toBe('update_token_optimization');
    expect(optimizeTokensToolDefinitionDeprecated.name).toBe('optimize_tokens');
  });

  test('registered tool schema stays stable', () => {
    const normalized = getToolDefinitions()
      .map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(normalized).toMatchSnapshot();
  });

  test('tool names remain unique', () => {
    const names = getToolDefinitions().map((definition) => definition.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
