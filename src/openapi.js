const { JSONSchemaFaker } = require("json-schema-faker");
const { readFile } = require("doc-detective-common");
const parser = require("@apidevtools/json-schema-ref-parser");
const path = require("path");

JSONSchemaFaker.option({ requiredOnly: true });

// Helper function for environment variable replacement
function replaceEnvs(obj) {
  if (typeof obj !== "object" || obj === null) return obj;

  const result = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    let value = obj[key];

    if (typeof value === "string") {
      // Replace environment variables in string values
      const matches = value.match(/\$([a-zA-Z0-9_]+)/g);
      if (matches) {
        for (const match of matches) {
          const envVar = match.substring(1);
          const envValue = process.env[envVar];
          if (envValue !== undefined) {
            value = value.replace(match, envValue);
          }
        }
      }
    } else if (typeof value === "object" && value !== null) {
      // Recursively replace in nested objects/arrays
      value = replaceEnvs(value);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Dereferences an OpenAPI or Arazzo description
 *
 * @param {String} descriptionPath - The OpenAPI or Arazzo description to be dereferenced.
 * @returns {Promise<Object>} - The dereferenced OpenAPI or Arazzo description.
 */
async function loadDescription(descriptionPath = "") {
  // Error handling
  if (!descriptionPath) {
    throw new Error("Description is required.");
  }

  // Load the definition from the URL or local file path
  const definition = await readFile({ fileURLOrPath: descriptionPath });

  // Dereference the definition
  const dereferencedDefinition = await parser.dereference(definition);

  return dereferencedDefinition;
}

/**
 * Retrieves the operation details from an OpenAPI definition based on the provided operationId.
 *
 * @param {Object} [definition={}] - The OpenAPI definition object.
 * @param {string} [operationId=""] - The unique identifier for the operation.
 * @param {string} [responseCode=""] - The HTTP response code to filter the operation.
 * @param {string} [exampleKey=""] - The key for the example to be compiled.
 * @param {string} [server=""] - The server URL to use for examples.
 * @throws {Error} Will throw an error if the definition or operationId is not provided.
 * @returns {Object|null} Returns an object containing the operation details, schemas, and example if found; otherwise, returns null.
 */
function getOperation(
  definition = {},
  operationId = "",
  responseCode = "",
  exampleKey = "",
  server = ""
) {
  // Error handling
  if (!definition) {
    throw new Error("OpenAPI definition is required.");
  }
  if (!operationId) {
    throw new Error("OperationId is required.");
  }
  // Search for the operationId in the OpenAPI definition
  for (const path in definition.paths) {
    for (const method in definition.paths[path]) {
      if (definition.paths[path][method].operationId === operationId) {
        const operation = definition.paths[path][method];
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

function getSchemas(definition = {}, responseCode = "") {
  const schemas = {};

  // Get request schema for operation
  if (definition.requestBody) {
    schemas.request =
      definition.requestBody.content[
        Object.keys(definition.requestBody.content)[0]
      ].schema;
  }
  if (!responseCode) {
    if (definition.responses && Object.keys(definition.responses).length > 0) {
      responseCode = Object.keys(definition.responses)[0];
    } else {
      throw new Error("No responses defined for the operation.");
    }
  }
  schemas.response =
    definition.responses[responseCode].content[
      Object.keys(definition.responses[responseCode].content)[0]
    ].schema;

  return schemas;
}

/**
 * Compiles an example object based on the provided operation, path, and example key.
 *
 * @param {Object} operation - The operation object.
 * @param {string} path - The path string.
 * @param {string} exampleKey - The example key string.
 * @returns {Object} - The compiled example object.
 * @throws {Error} - If operation or path is not provided.
 */
function compileExample(
  operation = {},
  path = "",
  responseCode = "",
  exampleKey = ""
) {
  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!path) {
    throw new Error("Path is required.");
  }

  // Setup
  let example = {
    url: path,
    request: { parameters: {}, headers: {}, body: {} },
    response: { headers: {}, body: {} },
  };

  // Path parameters
  const pathParameters = getExampleParameters(operation, "path", exampleKey);
  pathParameters.forEach((param) => {
    example.url = example.url.replace(`{${param.key}}`, param.value);
  });

  // Query parameters
  const queryParameters = getExampleParameters(operation, "query", exampleKey);
  queryParameters.forEach((param) => {
    example.request.parameters[param.key] = param.value;
  });

  // Headers
  const headerParameters = getExampleParameters(
    operation,
    "header",
    exampleKey
  );
  headerParameters.forEach((param) => {
    example.request.headers[param.key] = param.value;
  });

  // Request body
  if (operation.requestBody) {
    const requestBody = getExample(operation.requestBody, exampleKey);
    if (typeof requestBody != "undefined") {
      example.request.body = requestBody;
    }
  }

  // Response
  if (!responseCode) {
    responseCode = Object.keys(operation.responses)[0];
  }
  const response = operation.responses[responseCode];

  // Response headers
  if (response.headers) {
    for (const header in response.headers) {
      const headerExample = getExample(response.headers[header], exampleKey);
      if (typeof headerExample != "undefined")
        example.response.headers[header] = headerExample;
    }
  }

  // Response body
  if (response.content) {
    for (const key in response.content) {
      const responseBody = getExample(response.content[key], exampleKey);
      if (typeof responseBody != "undefined") {
        example.response.body = responseBody;
      }
    }
  }

  // Load environment variables
  example = replaceEnvs(example);
  // console.log(JSON.stringify(example, null, 2));
  return example;
}

// Return array of query parameters for the example
/**
 * Retrieves example parameters based on the given operation, type, and example key.
 *
 * @param {object} operation - The operation object.
 * @param {string} [type=""] - The type of parameter to retrieve.
 * @param {string} [exampleKey=""] - The example key to use.
 * @returns {Array} - An array of example parameters.
 * @throws {Error} - If the operation is not provided.
 */
function getExampleParameters(operation = {}, type = "", exampleKey = "") {
  const params = [];

  // Error handling
  if (!operation) {
    throw new Error("Operation is required.");
  }
  if (!operation.parameters) return params;

  // Find all query parameters
  for (const parameter of operation.parameters) {
    if (parameter.in === type) {
      const value = getExample(parameter, exampleKey);
      if (value) {
        params.push({ key: parameter.name, value });
      }
    }
  }

  return params;
}

/**
 * Retrieves an example value based on the given definition and example key.
 *
 * @param {object} definition - The definition object.
 * @param {string} exampleKey - The key of the example to retrieve.
 * @returns {object|null} - The example value.
 * @throws {Error} - If the definition is not provided.
 */
function getExample(
  definition = {},
  exampleKey = "",
  generateFromSchema = null
) {
  // Debug
  // console.log({definition, exampleKey});

  // Setup
  let example;

  // Error handling
  if (!definition) {
    throw new Error("Definition is required.");
  }

  // If there are no examples in the definition, generate example based on definition schema
  if (generateFromSchema == null) {
    const hasExamples = checkForExamples(definition, exampleKey);
    generateFromSchema =
      !hasExamples &&
      (definition.required || definition?.schema?.required || !exampleKey);
  }

  if (generateFromSchema && definition.type) {
    try {
      example = JSONSchemaFaker.generate(definition);
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
    let schema;
    if (definition.schema) {
      // Parameter pattern
      schema = definition.schema;
    } else if (definition.properties) {
      // Object pattern
      schema = definition;
    } else if (definition.items) {
      // Array pattern
      schema = definition;
    } else if (definition.content) {
      // Request/response body pattern
      for (const key in definition.content) {
        if (definition.content[key]) {
          schema = definition.content[key];
          break;
        }
      }
    } else {
      return null;
    }

    if (schema.type === "object") {
      example = generateObjectExample(schema, exampleKey, generateFromSchema);
    } else if (schema.type === "array") {
      example = generateArrayExample(
        schema.items,
        exampleKey,
        generateFromSchema
      );
    } else {
      example = getExample(schema, exampleKey, generateFromSchema);
    }
  }

  // console.log(example);
  return example;
}

/**
 * Generates an object example based on the provided schema and example key.
 *
 * @param {object} schema - The schema object.
 * @param {string} exampleKey - The example key.
 * @returns {object} - The generated object example.
 */
function generateObjectExample(
  schema = {},
  exampleKey = "",
  generateFromSchema = null
) {
  const example = {};
  for (const property in schema.properties) {
    const objectExample = getExample(
      schema.properties[property],
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
 * @param {Object} items - The items object.
 * @param {string} exampleKey - The example key.
 * @returns {Array} - The generated array example.
 */
function generateArrayExample(
  items = {},
  exampleKey = "",
  generateFromSchema = null
) {
  // Debug
  // console.log({ items, exampleKey });

  const example = [];
  const itemExample = getExample(items, exampleKey, generateFromSchema);
  if (itemExample) example.push(itemExample);

  // Debug
  // console.log(example);
  return example;
}

/**
 * Checks if the provided definition object contains any examples.
 *
 * @param {Object} [definition={}] - The object to traverse for examples.
 * @param {string} [exampleKey=""] - The specific key to look for in the examples.
 * @returns {boolean} - Returns true if examples are found, otherwise false.
 */
function checkForExamples(definition = {}, exampleKey = "") {
  const examples = [];

  function traverse(obj) {
    if (typeof obj !== "object" || obj === null) return;

    if (obj.hasOwnProperty("example")) {
      examples.push(obj.example);
    }
    if (
      exampleKey &&
      Object.hasOwn(obj, "examples") &&
      Object.hasOwn(obj.examples, exampleKey) &&
      Object.hasOwn(obj.examples[exampleKey], "value")
    ) {
      examples.push(obj.examples[exampleKey].value);
    }

    for (const key in obj) {
      traverse(obj[key]);
    }
  }

  traverse(definition);
  if (examples.length) return true;
  return false;
}

/**
 * Checks if a file is an OpenAPI 3.x specification.
 *
 * @param {Object} content - The file content to check.
 * @param {String} filepath - The path to the file.
 * @returns {Boolean} - True if the file is an OpenAPI 3.x specification, false otherwise.
 */
function isOpenApi3File(content, filepath) {
  if (!content || typeof content !== "object") {
    return false;
  }

  // Check the file extension
  const ext = path.extname(filepath).toLowerCase();
  if (![".json", ".yaml", ".yml"].includes(ext)) {
    return false;
  }

  // Check if it has the openapi field and it starts with "3."
  if (content.openapi && content.openapi.startsWith("3.")) {
    return true;
  }

  return false;
}

/**
 * Transforms an OpenAPI document into a Doc Detective test specification.
 *
 * @param {Object} openApiDoc - The OpenAPI document.
 * @param {String} filePath - Path to the original file.
 * @param {Object} config - The configuration object.
 * @returns {Object} - The Doc Detective test specification.
 */
function transformOpenApiToSpec(openApiDoc, filePath, config) {
  // Create spec object
  const id = `openapi-${path.basename(filePath, path.extname(filePath))}`;
  const spec = { 
    specId: id, 
    contentPath: filePath, 
    tests: [],
    openApi: [{
      name: openApiDoc.info?.title || id,
      definition: openApiDoc
    }]
  };

  // Extract operations
  const operations = extractOperations(openApiDoc);

  // Create tests from operations
  for (const operation of operations) {
    try {
      const test = transformOperationToTest(operation, openApiDoc, config);
      if (test) {
        spec.tests.push(test);
      }
    } catch (error) {
      console.warn(`Error transforming operation ${operation.operationId}: ${error.message}`);
    }
  }

  return spec;
}

/**
 * Extracts operations from an OpenAPI document.
 *
 * @param {Object} openApiDoc - The OpenAPI document.
 * @returns {Array} - Array of operation objects.
 */
function extractOperations(openApiDoc) {
  const operations = [];

  // Get default configuration
  const rootConfig = openApiDoc["x-doc-detective"] || {};
  
  for (const path in openApiDoc.paths) {
    for (const method in openApiDoc.paths[path]) {
      // Skip non-operation fields like parameters
      if (["parameters", "servers", "summary", "description"].includes(method)) {
        continue;
      }
      
      const operation = openApiDoc.paths[path][method];
      
      // Add path and method to the operation
      operation.path = path;
      operation.method = method;
      
      // Merge x-doc-detective configurations
      operation["x-doc-detective"] = {
        ...(rootConfig || {}),
        ...(operation["x-doc-detective"] || {})
      };
      
      operations.push(operation);
    }
  }

  return operations;
}

/**
 * Determines if an operation is safe to execute automatically.
 *
 * @param {Object} operation - The operation to check.
 * @returns {Boolean} - True if the operation is safe, false otherwise.
 */
function isOperationSafe(operation) {
  // Check if operation has explicit safety configuration
  if (operation["x-doc-detective"]?.safe !== undefined) {
    return operation["x-doc-detective"].safe;
  }

  // Default safety based on HTTP method
  const safeMethods = ["get", "head", "options", "post"];
  return safeMethods.includes(operation.method.toLowerCase());
}

/**
 * Transforms an OpenAPI operation into a Doc Detective test.
 *
 * @param {Object} operation - The OpenAPI operation.
 * @param {Object} openApiDoc - The full OpenAPI document for resolving dependencies.
 * @param {Object} config - The configuration object.
 * @returns {Object} - The Doc Detective test.
 */
function transformOperationToTest(operation, openApiDoc, config) {
  // Skip unsafe operations
  if (!isOperationSafe(operation)) {
    console.log(`Skipping unsafe operation: ${operation.operationId || operation.path}`);
    return null;
  }

  // Create test
  const test = {
    id: operation.operationId || `${operation.method}-${operation.path}`,
    description: operation.summary || operation.description || `${operation.method} ${operation.path}`,
    steps: []
  };

  // Add before steps
  const beforeSteps = createDependencySteps(operation["x-doc-detective"]?.before, openApiDoc);
  if (beforeSteps) {
    test.steps.push(...beforeSteps);
  }

  // Add main operation step
  const mainStep = createHttpRequestStep(operation);
  test.steps.push(mainStep);

  // Add after steps
  const afterSteps = createDependencySteps(operation["x-doc-detective"]?.after, openApiDoc);
  if (afterSteps) {
    test.steps.push(...afterSteps);
  }

  return test;
}

/**
 * Creates an httpRequest step from an OpenAPI operation.
 *
 * @param {Object} operation - The OpenAPI operation.
 * @returns {Object} - The httpRequest step.
 */
function createHttpRequestStep(operation) {
  const step = {
    action: "httpRequest",
    openApi: {}
  };
  
  // Use operationId if available
  if (operation.operationId) {
    step.openApi.operationId = operation.operationId;
  } else {
    step.openApi.path = operation.path;
    step.openApi.method = operation.method;
  }

  // Add OpenAPI configuration from x-doc-detective
  if (operation["x-doc-detective"]) {
    const config = operation["x-doc-detective"];
    
    // Add server if specified
    if (config.server) {
      step.openApi.server = config.server;
    }
    
    // Add validateSchema if specified
    if (config.validateSchema !== undefined) {
      step.openApi.validateSchema = config.validateSchema;
    }
    
    // Add mockResponse if specified
    if (config.mockResponse !== undefined) {
      step.openApi.mockResponse = config.mockResponse;
    }
    
    // Add statusCodes if specified
    if (config.statusCodes) {
      step.openApi.statusCodes = config.statusCodes;
    }
    
    // Add useExample if specified
    if (config.useExample !== undefined) {
      step.openApi.useExample = config.useExample;
    }
    
    // Add exampleKey if specified
    if (config.exampleKey) {
      step.openApi.exampleKey = config.exampleKey;
    }
    
    // Add requestHeaders if specified
    if (config.requestHeaders) {
      step.requestHeaders = config.requestHeaders;
    }
    
    // Add responseHeaders if specified
    if (config.responseHeaders) {
      step.responseHeaders = config.responseHeaders;
    }
  }
  
  return step;
}

/**
 * Creates steps for dependency operations.
 *
 * @param {Array} dependencies - Array of operation dependencies.
 * @param {Object} openApiDoc - The full OpenAPI document.
 * @returns {Array} - Array of steps for the dependencies.
 */
function createDependencySteps(dependencies, openApiDoc) {
  if (!dependencies || !dependencies.length) {
    return null;
  }
  
  const steps = [];
  
  for (const dep of dependencies) {
    let operation;
    
    if (typeof dep === 'string') {
      // If dependency is just a string, treat as operationId
      operation = findOperationById(dep, openApiDoc);
    } else if (dep.operationId) {
      // If dependency has operationId
      operation = findOperationById(dep.operationId, openApiDoc);
    } else if (dep.path && dep.method) {
      // If dependency has path and method
      operation = findOperationByPath(dep.path, dep.method, openApiDoc);
    }
    
    if (operation) {
      steps.push(createHttpRequestStep(operation));
    }
  }
  
  return steps;
}

/**
 * Finds an operation by its operationId.
 *
 * @param {String} operationId - The operationId to find.
 * @param {Object} openApiDoc - The OpenAPI document to search.
 * @returns {Object} - The operation if found, null otherwise.
 */
function findOperationById(operationId, openApiDoc) {
  for (const path in openApiDoc.paths) {
    for (const method in openApiDoc.paths[path]) {
      if (["parameters", "servers", "summary", "description"].includes(method)) {
        continue;
      }
      
      const operation = openApiDoc.paths[path][method];
      
      if (operation.operationId === operationId) {
        operation.path = path;
        operation.method = method;
        return operation;
      }
    }
  }
  
  return null;
}

/**
 * Finds an operation by path and method.
 *
 * @param {String} pathPattern - The path pattern to find.
 * @param {String} method - The HTTP method.
 * @param {Object} openApiDoc - The OpenAPI document to search.
 * @returns {Object} - The operation if found, null otherwise.
 */
function findOperationByPath(pathPattern, method, openApiDoc) {
  const normMethod = method.toLowerCase();
  
  // Try exact match first
  if (openApiDoc.paths[pathPattern] && openApiDoc.paths[pathPattern][normMethod]) {
    const operation = openApiDoc.paths[pathPattern][normMethod];
    operation.path = pathPattern;
    operation.method = normMethod;
    return operation;
  }
  
  // No match found
  return null;
}

module.exports = { 
  getOperation, 
  loadDescription, 
  isOpenApi3File,
  transformOpenApiToSpec,
  extractOperations,
  transformOperationToTest,
  isOperationSafe,
  createHttpRequestStep,
  createDependencySteps,
  findOperationById,
  findOperationByPath
};
