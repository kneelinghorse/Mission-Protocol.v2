/**
 * SemVer Validator Tests
 *
 * Comprehensive test suite for semantic version validation
 */

import {
  isValidSemVer,
  parseSemVer,
  compareSemVer,
  validateSemVerOrThrow,
  areVersionsCompatible,
} from '../../src/registry/semver-validator';

describe('SemVer Validator', () => {
  describe('isValidSemVer', () => {
    test('should validate correct SemVer formats', () => {
      expect(isValidSemVer('1.0.0')).toBe(true);
      expect(isValidSemVer('0.0.1')).toBe(true);
      expect(isValidSemVer('10.20.30')).toBe(true);
      expect(isValidSemVer('999.999.999')).toBe(true);
    });

    test('should reject invalid SemVer formats', () => {
      expect(isValidSemVer('1.0')).toBe(false);
      expect(isValidSemVer('1')).toBe(false);
      expect(isValidSemVer('v1.0.0')).toBe(false);
      expect(isValidSemVer('1.0.0-alpha')).toBe(false);
      expect(isValidSemVer('1.0.0+build')).toBe(false);
      expect(isValidSemVer('1.0.0-alpha+build')).toBe(false);
    });

    test('should reject versions with leading zeros', () => {
      expect(isValidSemVer('01.0.0')).toBe(false);
      expect(isValidSemVer('1.01.0')).toBe(false);
      expect(isValidSemVer('1.0.01')).toBe(false);
    });

    test('should handle invalid inputs', () => {
      expect(isValidSemVer('')).toBe(false);
      expect(isValidSemVer('   ')).toBe(false);
      expect(isValidSemVer('invalid')).toBe(false);
      expect(isValidSemVer('1.x.0')).toBe(false);
    });

    test('should handle whitespace correctly', () => {
      expect(isValidSemVer(' 1.0.0 ')).toBe(true);
      expect(isValidSemVer('1.0.0 ')).toBe(true);
      expect(isValidSemVer(' 1.0.0')).toBe(true);
    });

    test('should handle null and undefined', () => {
      expect(isValidSemVer(null as any)).toBe(false);
      expect(isValidSemVer(undefined as any)).toBe(false);
    });
  });

  describe('parseSemVer', () => {
    test('should parse valid SemVer strings', () => {
      expect(parseSemVer('1.0.0')).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        raw: '1.0.0',
      });

      expect(parseSemVer('10.20.30')).toEqual({
        major: 10,
        minor: 20,
        patch: 30,
        raw: '10.20.30',
      });

      expect(parseSemVer('0.0.1')).toEqual({
        major: 0,
        minor: 0,
        patch: 1,
        raw: '0.0.1',
      });
    });

    test('should return null for invalid versions', () => {
      expect(parseSemVer('1.0')).toBeNull();
      expect(parseSemVer('v1.0.0')).toBeNull();
      expect(parseSemVer('invalid')).toBeNull();
    });

    test('should trim whitespace before parsing', () => {
      expect(parseSemVer(' 1.0.0 ')).toEqual({
        major: 1,
        minor: 0,
        patch: 0,
        raw: '1.0.0',
      });
    });
  });

  describe('compareSemVer', () => {
    test('should compare versions correctly', () => {
      // v1 < v2
      expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1);
      expect(compareSemVer('1.0.0', '1.1.0')).toBe(-1);
      expect(compareSemVer('1.0.0', '1.0.1')).toBe(-1);

      // v1 == v2
      expect(compareSemVer('1.0.0', '1.0.0')).toBe(0);
      expect(compareSemVer('5.10.3', '5.10.3')).toBe(0);

      // v1 > v2
      expect(compareSemVer('2.0.0', '1.0.0')).toBe(1);
      expect(compareSemVer('1.1.0', '1.0.0')).toBe(1);
      expect(compareSemVer('1.0.1', '1.0.0')).toBe(1);
    });

    test('should prioritize major version differences', () => {
      expect(compareSemVer('2.0.0', '1.99.99')).toBe(1);
      expect(compareSemVer('1.99.99', '2.0.0')).toBe(-1);
    });

    test('should prioritize minor version when major is equal', () => {
      expect(compareSemVer('1.2.0', '1.1.99')).toBe(1);
      expect(compareSemVer('1.1.99', '1.2.0')).toBe(-1);
    });

    test('should return null for invalid versions', () => {
      expect(compareSemVer('1.0.0', 'invalid')).toBeNull();
      expect(compareSemVer('invalid', '1.0.0')).toBeNull();
      expect(compareSemVer('invalid', 'invalid')).toBeNull();
    });
  });

  describe('validateSemVerOrThrow', () => {
    test('should not throw for valid SemVer', () => {
      expect(() => validateSemVerOrThrow('1.0.0')).not.toThrow();
      expect(() => validateSemVerOrThrow('0.0.1')).not.toThrow();
      expect(() => validateSemVerOrThrow('10.20.30')).not.toThrow();
    });

    test('should throw for invalid SemVer', () => {
      expect(() => validateSemVerOrThrow('1.0')).toThrow(
        'Invalid SemVer format for version: "1.0". Expected format: X.Y.Z (e.g., 1.0.0)'
      );

      expect(() => validateSemVerOrThrow('invalid')).toThrow(
        'Invalid SemVer format for version: "invalid". Expected format: X.Y.Z (e.g., 1.0.0)'
      );
    });

    test('should use custom field name in error message', () => {
      expect(() => validateSemVerOrThrow('1.0', 'schema_version')).toThrow(
        'Invalid SemVer format for schema_version: "1.0". Expected format: X.Y.Z (e.g., 1.0.0)'
      );
    });
  });

  describe('areVersionsCompatible', () => {
    test('should consider same major version compatible (major >= 1)', () => {
      expect(areVersionsCompatible('1.0.0', '1.0.0')).toBe(true);
      expect(areVersionsCompatible('1.0.0', '1.5.0')).toBe(true);
      expect(areVersionsCompatible('1.5.0', '1.0.0')).toBe(true);
      expect(areVersionsCompatible('2.0.0', '2.99.99')).toBe(true);
    });

    test('should consider different major versions incompatible (major >= 1)', () => {
      expect(areVersionsCompatible('1.0.0', '2.0.0')).toBe(false);
      expect(areVersionsCompatible('2.0.0', '1.0.0')).toBe(false);
      expect(areVersionsCompatible('3.0.0', '4.0.0')).toBe(false);
    });

    test('should handle 0.x.x versions specially', () => {
      // In 0.x.x, minor versions are breaking changes
      expect(areVersionsCompatible('0.1.0', '0.1.0')).toBe(true);
      expect(areVersionsCompatible('0.1.0', '0.1.5')).toBe(true);
      expect(areVersionsCompatible('0.1.0', '0.2.0')).toBe(false);
      expect(areVersionsCompatible('0.5.0', '0.6.0')).toBe(false);
    });

    test('should consider 0.x.x and 1.x.x incompatible', () => {
      expect(areVersionsCompatible('0.9.9', '1.0.0')).toBe(false);
      expect(areVersionsCompatible('1.0.0', '0.9.9')).toBe(false);
    });

    test('should return false for invalid versions', () => {
      expect(areVersionsCompatible('1.0.0', 'invalid')).toBe(false);
      expect(areVersionsCompatible('invalid', '1.0.0')).toBe(false);
    });
  });
});
