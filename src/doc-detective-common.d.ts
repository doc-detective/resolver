/**
 * Type declarations for doc-detective-common
 */
declare module "doc-detective-common" {
  export interface ValidationResult {
    valid: boolean;
    errors?: string;
    object: unknown;
  }

  /**
   * Validates an object against a specified JSON schema
   */
  export function validate(params: {
    schemaKey: string;
    object: unknown;
    addDefaults?: boolean;
  }): ValidationResult;

  /**
   * Recursively resolves all relative path properties in a configuration or specification object to absolute paths
   */
  export function resolvePaths(params: {
    config: unknown;
    object: unknown;
    filePath: string;
    nested?: boolean;
    objectType?: "config" | "spec";
  }): Promise<unknown>;

  /**
   * Transforms an object from one JSON schema version to another
   */
  export function transformToSchemaKey(params: {
    currentSchema: string;
    targetSchema: string;
    object: unknown;
  }): unknown;

  /**
   * Reads and parses content from a remote URL or local file path, supporting JSON and YAML formats
   */
  export function readFile(params: {
    fileURLOrPath: string;
  }): Promise<unknown>;
}
