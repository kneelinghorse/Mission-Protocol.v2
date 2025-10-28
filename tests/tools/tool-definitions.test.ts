import { describe, expect, test } from '@jest/globals';
import { getToolDefinitions } from '../../src/index';
import {
  optimizeTokensToolDefinition,
  optimizeTokensToolDefinitionDeprecated,
  updateTokenOptimizationToolDefinition,
} from '../../src/tools/optimize-tokens';

function sanitize(value: unknown): unknown {
  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .reduce<Record<string, unknown>>((acc, [key, val]) => {
        acc[key] = sanitize(val);
        return acc;
      }, {});
  }

  return value;
}

describe('Tool definitions contract', () => {
  test('optimize tokens exports remain backwards compatible', () => {
    expect(optimizeTokensToolDefinition).toBe(updateTokenOptimizationToolDefinition);
    expect(updateTokenOptimizationToolDefinition.name).toBe('update_token_optimization');
    expect(optimizeTokensToolDefinitionDeprecated.name).toBe('optimize_tokens');
  });

  test('registered tool schema stays stable', () => {
    const normalized = getToolDefinitions()
      .map((definition) => sanitize(definition))
      .sort((a, b) =>
        String((a as { name: string }).name).localeCompare(String((b as { name: string }).name))
      );

    expect(normalized).toMatchSnapshot();
  });

  test('tool names remain unique', () => {
    const names = getToolDefinitions().map((definition) => definition.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
