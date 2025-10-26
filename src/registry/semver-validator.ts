/**
 * SemVer Validator
 *
 * Validates semantic versioning strings according to SemVer 2.0.0 specification.
 * Supports strict X.Y.Z format (major.minor.patch).
 *
 * @module registry/semver-validator
 */

import { SemVerComponents } from '../types/registry';

/**
 * SemVer regex pattern
 * Matches versions in X.Y.Z format where X, Y, Z are non-negative integers
 */
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Validates if a string is a valid SemVer version
 *
 * @param version - Version string to validate
 * @returns true if valid SemVer, false otherwise
 */
export function isValidSemVer(version: string): boolean {
  if (!version || typeof version !== 'string') {
    return false;
  }

  return SEMVER_PATTERN.test(version.trim());
}

/**
 * Parses a SemVer string into its components
 *
 * @param version - Version string to parse
 * @returns SemVer components or null if invalid
 */
export function parseSemVer(version: string): SemVerComponents | null {
  if (!isValidSemVer(version)) {
    return null;
  }

  const trimmed = version.trim();
  const match = trimmed.match(SEMVER_PATTERN);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    raw: trimmed,
  };
}

/**
 * Compares two SemVer versions
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2, null if either is invalid
 */
export function compareSemVer(v1: string, v2: string): number | null {
  const parsed1 = parseSemVer(v1);
  const parsed2 = parseSemVer(v2);

  if (!parsed1 || !parsed2) {
    return null;
  }

  // Compare major
  if (parsed1.major !== parsed2.major) {
    return parsed1.major < parsed2.major ? -1 : 1;
  }

  // Compare minor
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor < parsed2.minor ? -1 : 1;
  }

  // Compare patch
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch < parsed2.patch ? -1 : 1;
  }

  return 0;
}

/**
 * Validates that a version string is valid SemVer and throws if not
 *
 * @param version - Version string to validate
 * @param fieldName - Name of field for error message (default: "version")
 * @throws Error if version is invalid
 */
export function validateSemVerOrThrow(version: string, fieldName: string = 'version'): void {
  if (!isValidSemVer(version)) {
    throw new Error(
      `Invalid SemVer format for ${fieldName}: "${version}". Expected format: X.Y.Z (e.g., 1.0.0)`
    );
  }
}

/**
 * Checks if two versions are compatible (same major version)
 *
 * @param v1 - First version string
 * @param v2 - Second version string
 * @returns true if compatible, false otherwise or if invalid
 */
export function areVersionsCompatible(v1: string, v2: string): boolean {
  const parsed1 = parseSemVer(v1);
  const parsed2 = parseSemVer(v2);

  if (!parsed1 || !parsed2) {
    return false;
  }

  // In SemVer, major version 0 is for initial development
  // Different minor versions in 0.x.x are NOT compatible
  if (parsed1.major === 0 || parsed2.major === 0) {
    return parsed1.major === parsed2.major && parsed1.minor === parsed2.minor;
  }

  // For major >= 1, same major version indicates compatibility
  return parsed1.major === parsed2.major;
}
