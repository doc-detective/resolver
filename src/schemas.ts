/**
 * Schemas - Define validation schemas for resolver inputs and outputs.
 * 
 * This module uses Zod to define schemas that validate and transform data 
 * throughout the resolution process.
 */

import { z } from 'zod';
import { jsonSchemaToZod } from "json-schema-to-zod";
import { FromSchema } from "json-schema-to-ts";
import { schemas } from "doc-detective-common";

export type ConfigV3 = FromSchema<typeof schemas.config_v3>;
/**
 * Basic input schema for the resolver
 * 
 * This is a simple example that can be expanded based on your specific needs.
 */
export const InputSchema = z.object({
  source: z.string().min(1, "Source cannot be empty"),
  options: z.object({
    format: z.enum(["json", "yaml", "md"]).optional().default("json"),
    strict: z.boolean().optional().default(false),
  }).optional().default({}),
});

/**
 * Type inference from the schema
 */
export type Input = z.infer<typeof InputSchema>;

/**
 * Output schema for the resolver
 */
export const OutputSchema = z.object({
  resolved: z.string(),
  format: z.enum(["json", "yaml", "md"]),
  timestamp: z.number(),
});

/**
 * Type inference from the schema
 */
export type Output = z.infer<typeof OutputSchema>;

/**
 * Parse and validate input data
 * 
 * @param data - The input data to validate
 * @returns Validated and transformed input data
 * @throws Will throw an error if validation fails
 */
export function parseInput(data: unknown): Input {
  return InputSchema.parse(data);
}

/**
 * Parse and validate output data
 * 
 * @param data - The output data to validate
 * @returns Validated and transformed output data
 * @throws Will throw an error if validation fails
 */
export function parseOutput(data: unknown): Output {
  return OutputSchema.parse(data);
}
