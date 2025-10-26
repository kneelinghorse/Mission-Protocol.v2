/**
 * Compression Rules Unit Tests
 */

import { describe, test, expect } from '@jest/globals';
import {
  applySanitization,
  applyStructuralRefactoring,
  applyLinguisticSimplification,
  convertProseToList,
  convertPassiveToActive,
  extractPreservedSections,
  replaceWithPlaceholders,
  restorePreservedSections,
  getDefaultRuleset,
} from '../../src/intelligence/compression-rules';

describe('compression-rules', () => {
  describe('sanitization', () => {
    test('applies regex replacement rules', () => {
      const input = 'It is important to note that in order to proceed, please provide a detailed explanation of X.';
      const rules = [
        { type: 'regex_replace' as const, pattern: /it is important to note that/gi, replacement: 'note:', enabled: true },
        { type: 'regex_replace' as const, pattern: /in order to/gi, replacement: 'to', enabled: true },
        { type: 'regex_replace' as const, pattern: /provide a detailed explanation of/gi, replacement: 'explain', enabled: true },
      ];
      const out = applySanitization(input, rules);
      expect(out).toContain('note:');
      expect(out).toContain('to proceed');
      expect(out).toContain('explain X');
    });
  });

  describe('structural refactoring', () => {
    test('convert prose to list with ordinal delimiters', () => {
      const input = 'First, do A. Then, do B. Finally, do C.';
      const out = convertProseToList(input, ['First,', 'Then,', 'Finally,']);
      expect(out).toContain('\n- do A.');
      expect(out).toContain('\n- do B.');
      expect(out).toContain('\n- do C.');
    });

    test('applyStructuralRefactoring only converts when multiple items found', () => {
      const input = 'Step: Do A only.';
      const rules = [
        { type: 'convert_prose_to_list' as const, enabled: true, delimiters: ['First,', 'Then,'] },
      ];
      const out = applyStructuralRefactoring(input, rules);
      expect(out).toBe(input);
    });
  });

  describe('linguistic simplification', () => {
    test('convert passive to active (heuristic)', () => {
      const input = 'Task should be completed by engineer.';
      const out = convertPassiveToActive(input);
      expect(out.toLowerCase()).toContain('engineer should completed task');
    });

    test('applyLinguisticSimplification runs regex and passive conversions', () => {
      const input = 'The system is able to run and has the ability to stop.';
      const rules = [
        { type: 'regex_replace' as const, pattern: /is able to/gi, replacement: 'can', enabled: true },
        { type: 'regex_replace' as const, pattern: /has the ability to/gi, replacement: 'can', enabled: true },
        { type: 'convert_passive_to_active' as const, enabled: true },
      ];
      const out = applyLinguisticSimplification(input, rules);
      expect(out).toContain('can run');
      expect(out).toContain('can stop');
    });
  });

  describe('preserve/restore', () => {
    test('extracts, replaces, and restores preserved sections', () => {
      const input = 'context: text\n<preserve>KEEP_ME</preserve>\nother: text';
      const patterns = [/<preserve>.*?<\/preserve>/gs];
      const preserved = extractPreservedSections(input, patterns);
      const withPlaceholders = replaceWithPlaceholders(input, preserved);
      expect(withPlaceholders).not.toContain('KEEP_ME');
      const restored = restorePreservedSections(withPlaceholders, preserved);
      expect(restored).toContain('KEEP_ME');
    });
  });

  describe('ruleset levels', () => {
    test('balanced level includes all three rule groups', () => {
      const ruleset = getDefaultRuleset('balanced');
      expect(ruleset.sanitizationRules.length).toBeGreaterThan(0);
      expect(ruleset.structuralRules.length).toBeGreaterThan(0);
      expect(ruleset.linguisticRules.length).toBeGreaterThan(0);
      expect(ruleset.preservePatterns.length).toBeGreaterThan(0);
    });
  });
});

