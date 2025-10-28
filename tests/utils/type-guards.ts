type Primitive = string | number | boolean | symbol | null | undefined;

export function isPrimitive(value: unknown): value is Primitive {
  const valueType = typeof value;
  return (
    value === null ||
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean' ||
    valueType === 'undefined' ||
    valueType === 'symbol'
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertRecord(
  value: unknown,
  context: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${context} must be a plain object`);
  }
}

export function assertArray(value: unknown, context: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
}

export function assertString(value: unknown, context: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${context} must be a string`);
  }
}
