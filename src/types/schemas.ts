/**
 * JSON Schema type definitions for validation
 */

export interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  additionalProperties?: boolean | JSONSchema;
  enum?: any[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  [key: string]: any;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: any[];
}
