/**
 * A deliberately small JSON Schema subset: enough for flat tool inputs.
 * Supported: type object/string/integer/boolean, properties, required,
 * additionalProperties:false, string pattern/enum/maxLength, integer minimum/maximum.
 * The same schema objects are published in tools/list, so what clients see is
 * exactly what the server enforces.
 */
import { ValidationError } from "../lib/errors";

export type PropertySchema =
  | { type: "string"; description?: string; pattern?: string; enum?: string[]; maxLength?: number; format?: string }
  | { type: "integer"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string };

export interface ObjectSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties: false;
}

export function validateArgs(schema: ObjectSchema, input: unknown): Record<string, unknown> {
  const args = input ?? {};
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new ValidationError("arguments must be an object");
  }
  const obj = args as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    if (obj[key] === undefined) throw new ValidationError(`missing required argument: ${key}`);
  }
  for (const [key, value] of Object.entries(obj)) {
    const prop = schema.properties[key];
    if (!prop) throw new ValidationError(`unknown argument: ${key}`);
    if (value === undefined) continue;
    checkProperty(key, prop, value);
  }
  return obj;
}

function checkProperty(key: string, prop: PropertySchema, value: unknown): void {
  switch (prop.type) {
    case "string": {
      if (typeof value !== "string") throw new ValidationError(`${key} must be a string`);
      if (prop.maxLength !== undefined && value.length > prop.maxLength) {
        throw new ValidationError(`${key} must be at most ${prop.maxLength} characters`);
      }
      if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
        throw new ValidationError(`${key} has an invalid format`);
      }
      if (prop.enum && !prop.enum.includes(value)) {
        throw new ValidationError(`${key} must be one of: ${prop.enum.join(", ")}`);
      }
      return;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new ValidationError(`${key} must be an integer`);
      }
      if (prop.minimum !== undefined && value < prop.minimum) {
        throw new ValidationError(`${key} must be >= ${prop.minimum}`);
      }
      if (prop.maximum !== undefined && value > prop.maximum) {
        throw new ValidationError(`${key} must be <= ${prop.maximum}`);
      }
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") throw new ValidationError(`${key} must be a boolean`);
      return;
  }
}
