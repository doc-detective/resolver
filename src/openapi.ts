import { readFile } from "doc-detective-common";
import type { 
  OpenApiDescription, 
  OpenApiOperation, 
  OpenApiParameter,
  OpenApiResponse,
  CompiledExample, 
  OperationResult 
} from "./types";

// JSONSchemaFaker types
interface JSONSchemaFakerStatic {
  option(options: Record<string, unknown>): void;
  generate(schema: Record<string, unknown>): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSONSchemaFaker } = require("json-schema-faker") as { JSONSchemaFaker: JSONSchemaFakerStatic };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parser = require("@apidevtools/json-schema-ref-parser") as { dereference(schema: unknown): Promise<unknown> };

JSONSchemaFaker.option({ requiredOnly: true });

// Forward declaration for replaceEnvs - will be imported at runtime to avoid circular deps
let replaceEnvs: (obj: unknown) => unknown;

/**
 * Sets the replaceEnvs function from utils module
 * This is called during module initialization to avoid circular dependencies
 */
export function setReplaceEnvs(fn: (obj: unknown) => unknown): void {
  replaceEnvs = fn;
}

/**
 * Dereferences an OpenAPI or Arazzo description
 *
 * @param descriptionPath - The OpenAPI or Arazzo description to be dereferenced.
 * @returns The dereferenced OpenAPI or Arazzo description.
 */
export async function loadDescription(descriptionPath: string = ""): Promise<OpenApiDescription> {
  // Error handling
  if (!descriptionPath) {
    throw new Error("Description is required.");
  }

  // Load the definition from the URL or local file path
  const definition = await readFile({ fileURLOrPath: descriptionPath }) as OpenApiDescription;

  // Dereference the definition
  const dereferencedDefinition = await parser.dereference(definition) as OpenApiDescription;

  return dereferencedDefinition;
}

/**
 * Retrieves the operation details from an OpenAPI definition based on the provided operationId.
 *
 * @param definition - The OpenAPI definition object.
 * @param operationId - The unique identifier for the operation.
 * @param responseCode - The HTTP response code to filter the operation.
 * @param exampleKey - The key for the example to be compiled.
 * @param server - The server URL to use for examples.
 * @throws Will throw an error if the definition or operationId is not provided.
 * @returns Returns an object containing the operation details, schemas, and example if found; otherwise, returns null.
 */
export function getOperation(
  definition: OpenApiDescription = {},
  operationId: string = "",
  responseCode: string = "",
  exampleKey: string = "",
  server: string = ""
): OperationResult | null {
  // Error handling
  if (!definition) {
    throw new Error("OpenAPI definition is required.");
  }
  if (!operationId) {
    throw new Error("OperationId is required.");
  }

  // Search for the operationId in the OpenAPI definition
  if (!definition.paths) return null;

  for (const path in definition.paths) {
    for (const method in definition.paths[path]) {
      const operation = definition.paths[path][method] as OpenApiOperation;
      if (operation.operationId === operationId) {
        if (!server) {
          if (definition.servers && definition.servers.length > 0) {
            server = definition.servers[0].url;
          } else {
            throw new Error(
              "No server URL provided and no servers defined in the OpenAPI definition."
            );
          }
        }
        const example = compileExample(
          operation,
          server + path,
          responseCode,
          exampleKey
        );
        const schemas = getSchemas(operation, responseCode);
        return { path, method, definition: operation, schemas, example };
      }
    }
  }
  return null;
}

interface Schemas {
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

function getSchemas(definition: OpenApiOperation = {}, responseCode: string = ""): Schemas {
  const schemas: Schemas = {};

  // Get request schema for operation
  if (definition.requestBody?.content) {
    const contentKeys = Object.keys(definition.requestBody.content);
    if (contentKeys.length > 0) {
      const firstContent = definition.requestBody.content[contentKeys[0]];
      schemas.request = firstContent.schema as Record<string, unknown>;
    }
  }

  if (!responseCode) {
    if (definition.responses && Object.keys(definition.responses).length > 0) {
      responseCode = Object.keys(definition.responses)[0];
    } else {
      throw new Error("No responses defined for the operation.");
    }
  }

  const response = definition.responses?.[responseCode] as OpenApiResponse | undefined;
  if (response?.content) {
    const contentKeys = Object.keys(response.content);
    if (contentKeys.length > 0) {
      const firstContent = response.content[contentKeys[0]];
      schemas.response = firstContent.schema as Record<string, unknown>;
    }
  }

  return schemas;
}

/**
 * Compiles an example object based on the provided operation, path, and example key.
 *
 * @param operation - The operation object.
 * @param path - The path string.
 * @param responseCode - The HTTP response code.
 * @param exampleKey - The example key string.
 * @returns The compiled example object.
 * @throws If operation or path is not provided.
 */
function compileExample(
  operation: OpenApiOperation = {},
  path: string = "",
  responseCode: string = "",
  exampleKey: string = ""
): CompiledExample {
  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!path) {
    throw new Error("Path is required.");
  }

  // Setup
  let example: CompiledExample = {
    url: path,
    request: { parameters: {}, headers: {}, body: {} },
    response: { headers: {}, body: {} },
  };

  // Path parameters
  const pathParameters = getExampleParameters(operation, "path", exampleKey);
  pathParameters.forEach((param) => {
    example.url = example.url.replace(`{${param.key}}`, String(param.value));
  });

  // Query parameters
  const queryParameters = getExampleParameters(operation, "query", exampleKey);
  queryParameters.forEach((param) => {
    example.request.parameters[param.key] = param.value;
  });

  // Headers
  const headerParameters = getExampleParameters(operation, "header", exampleKey);
  headerParameters.forEach((param) => {
    example.request.headers[param.key] = param.value;
  });

  // Request body
  if (operation.requestBody) {
    const requestBody = getExample(operation.requestBody, exampleKey);
    if (typeof requestBody !== "undefined") {
      example.request.body = requestBody;
    }
  }

  // Response
  if (!responseCode && operation.responses) {
    responseCode = Object.keys(operation.responses)[0];
  }
  const response = operation.responses?.[responseCode] as OpenApiResponse | undefined;

  // Response headers
  if (response?.headers) {
    for (const header in response.headers) {
      const headerExample = getExample(response.headers[header], exampleKey);
      if (typeof headerExample !== "undefined") {
        example.response.headers[header] = headerExample;
      }
    }
  }

  // Response body
  if (response?.content) {
    for (const key in response.content) {
      const responseBody = getExample(response.content[key] as DefinitionWithExamples, exampleKey);
      if (typeof responseBody !== "undefined") {
        example.response.body = responseBody;
      }
    }
  }

  // Load environment variables
  if (replaceEnvs) {
    example = replaceEnvs(example) as CompiledExample;
  }

  return example;
}

interface ExampleParameter {
  key: string;
  value: unknown;
}

/**
 * Retrieves example parameters based on the given operation, type, and example key.
 *
 * @param operation - The operation object.
 * @param type - The type of parameter to retrieve.
 * @param exampleKey - The example key to use.
 * @returns An array of example parameters.
 * @throws If the operation is not provided.
 */
function getExampleParameters(
  operation: OpenApiOperation = {},
  type: string = "",
  exampleKey: string = ""
): ExampleParameter[] {
  const params: ExampleParameter[] = [];

  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!operation.parameters) return params;

  // Find all parameters of the given type
  for (const parameter of operation.parameters as OpenApiParameter[]) {
    if (parameter.in === type) {
      const value = getExample(parameter, exampleKey);
      if (value) {
        params.push({ key: parameter.name, value });
      }
    }
  }

  return params;
}

interface DefinitionWithExamples {
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
  schema?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  items?: Record<string, unknown>;
  content?: Record<string, unknown>;
  type?: string;
  required?: boolean;
}

/**
 * Retrieves an example value based on the given definition and example key.
 *
 * @param definition - The definition object.
 * @param exampleKey - The key of the example to retrieve.
 * @param generateFromSchema - Whether to generate from schema if no example found.
 * @returns The example value.
 * @throws If the definition is not provided.
 */
function getExample(
  definition: DefinitionWithExamples = {},
  exampleKey: string = "",
  generateFromSchema: boolean | null = null
): unknown {
  // Setup
  let example: unknown;

  // Error handling
  if (!definition) {
    throw new Error("Definition is required.");
  }

  // If there are no examples in the definition, generate example based on definition schema
  if (generateFromSchema === null) {
    const hasExamples = checkForExamples(definition as Record<string, unknown>, exampleKey);
    const schemaWithRequired = definition.schema as { required?: boolean } | undefined;
    generateFromSchema =
      !hasExamples &&
      (definition.required || schemaWithRequired?.required || !exampleKey);
  }

  if (generateFromSchema && definition.type) {
    try {
      example = JSONSchemaFaker.generate(definition as Record<string, unknown>);
      if (example) return example;
    } catch (error) {
      console.warn(`Error generating example: ${error}`);
    }
  }

  if (
    definition.examples &&
    typeof exampleKey !== "undefined" &&
    exampleKey !== "" &&
    typeof definition.examples[exampleKey] !== "undefined" &&
    typeof definition.examples[exampleKey].value !== "undefined"
  ) {
    // If the definition has an `examples` property, exampleKey is specified, and the exampleKey exists in the examples object, use that example.
    example = definition.examples[exampleKey].value;
  } else if (typeof definition.example !== "undefined") {
    // If the definition has an `example` property, use that example.
    example = definition.example;
  } else {
    // If the definition has no examples, generate an example based on the definition/properties.
    // Find the next `schema` child property in the definition, regardless of depth
    let schema: Record<string, unknown> | undefined;
    if (definition.schema) {
      // Parameter pattern
      schema = definition.schema;
    } else if (definition.properties) {
      // Object pattern
      schema = definition as unknown as Record<string, unknown>;
    } else if (definition.items) {
      // Array pattern
      schema = definition as unknown as Record<string, unknown>;
    } else if (definition.content) {
      // Request/response body pattern
      for (const key in definition.content) {
        if (definition.content[key]) {
          schema = definition.content[key] as Record<string, unknown>;
          break;
        }
      }
    } else {
      return null;
    }

    if (!schema) return null;

    const schemaType = (schema as { type?: string }).type;
    if (schemaType === "object") {
      example = generateObjectExample(schema, exampleKey, generateFromSchema);
    } else if (schemaType === "array") {
      const items = (schema as { items?: Record<string, unknown> }).items;
      example = generateArrayExample(items || {}, exampleKey, generateFromSchema);
    } else {
      example = getExample(schema as DefinitionWithExamples, exampleKey, generateFromSchema);
    }
  }

  return example;
}

/**
 * Generates an object example based on the provided schema and example key.
 *
 * @param schema - The schema object.
 * @param exampleKey - The example key.
 * @param generateFromSchema - Whether to generate from schema.
 * @returns The generated object example.
 */
function generateObjectExample(
  schema: Record<string, unknown> = {},
  exampleKey: string = "",
  generateFromSchema: boolean | null = null
): Record<string, unknown> {
  const example: Record<string, unknown> = {};
  const properties = schema.properties as Record<string, unknown> | undefined;
  
  if (!properties) return example;

  for (const property in properties) {
    const objectExample = getExample(
      properties[property] as DefinitionWithExamples,
      exampleKey,
      generateFromSchema
    );
    if (objectExample) example[property] = objectExample;
  }
  return example;
}

/**
 * Generates an array example based on the provided items and example key.
 *
 * @param items - The items object.
 * @param exampleKey - The example key.
 * @param generateFromSchema - Whether to generate from schema.
 * @returns The generated array example.
 */
function generateArrayExample(
  items: Record<string, unknown> = {},
  exampleKey: string = "",
  generateFromSchema: boolean | null = null
): unknown[] {
  const example: unknown[] = [];
  const itemExample = getExample(items as DefinitionWithExamples, exampleKey, generateFromSchema);
  if (itemExample) example.push(itemExample);

  return example;
}

/**
 * Checks if the provided definition object contains any examples.
 *
 * @param definition - The object to traverse for examples.
 * @param exampleKey - The specific key to look for in the examples.
 * @returns Returns true if examples are found, otherwise false.
 */
function checkForExamples(definition: Record<string, unknown> = {}, exampleKey: string = ""): boolean {
  const examples: unknown[] = [];

  function traverse(obj: unknown): void {
    if (typeof obj !== "object" || obj === null) return;

    const record = obj as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(record, "example")) {
      examples.push(record.example);
    }
    if (
      exampleKey &&
      Object.hasOwn(record, "examples") &&
      typeof record.examples === "object" &&
      record.examples !== null &&
      Object.hasOwn(record.examples as Record<string, unknown>, exampleKey)
    ) {
      const examplesObj = record.examples as Record<string, { value?: unknown }>;
      if (Object.hasOwn(examplesObj[exampleKey], "value")) {
        examples.push(examplesObj[exampleKey].value);
      }
    }

    for (const key in record) {
      traverse(record[key]);
    }
  }

  traverse(definition);
  return examples.length > 0;
}
