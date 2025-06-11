# Doc Detective Resolver

![Current version](https://img.shields.io/github/package-json/v/doc-detective/resolver?color=orange)
[![NPM Shield](https://img.shields.io/npm/v/doc-detective-resolver)](https://www.npmjs.com/package/doc-detective-resolver)
[![Discord Shield](https://img.shields.io/badge/chat-on%20discord-purple)](https://discord.gg/2M7wXEThfF)
[![Docs Shield](https://img.shields.io/badge/docs-doc--detective.com-blue)](https://doc-detective.com)

Detect and resolve documentation into Doc Detective tests. This package helps you find and process tests embedded in your documentation.

This package is part of the [Doc Detective](https://github.com/doc-detective/doc-detective) ecosystem.

## Install

```bash
npm i doc-detective-resolver
```

## Init

```javascript
const { detectTests, resolveTests, detectAndResolveTests } = require("doc-detective-resolver");
```

## Functions

### `detectAndResolveTests({ config })`

Detects and resolves tests based on the provided configuration. This function performs the complete workflow:
1. Sets and validates the configuration
2. Detects tests according to the configuration
3. Resolves the detected tests

Returns a promise that resolves to an object of resolved tests, or null if no tests are detected.

```javascript
const { detectAndResolveTests } = require("doc-detective-resolver");
const resolvedTests = await detectAndResolveTests({ config });
```

### `detectTests({ config })`

Detects and processes test specifications based on provided configuration without resolving them. This function:
1. Resolves configuration if not already done
2. Qualifies files based on configuration
3. Parses test specifications from the qualified files

Returns a promise resolving to an array of test specifications.

```javascript
const { detectTests } = require("doc-detective-resolver");
const detectedTests = await detectTests({ config });
```

### `resolveTests({ config, detectedTests })`

Resolves previously detected test configurations according to the provided configuration.

```javascript
const { detectTests, resolveTests } = require("doc-detective-resolver");
const detectedTests = await detectTests({ config });
const resolvedTests = await resolveTests({ config, detectedTests });
```

## OpenAPI 3.x Support

Doc Detective Resolver includes built-in support for OpenAPI 3.x specifications, automatically transforming API operations into executable test specifications. This enables seamless integration of API documentation with automated testing workflows.

### Detection and File Support

OpenAPI files are automatically detected based on:

1. **File Extension**: Must be `.json`, `.yaml`, or `.yml`
2. **OpenAPI Version**: Must contain `openapi: "3.x.x"` field (any 3.x version)

When a file meets these criteria, it's processed as an OpenAPI specification instead of a standard Doc Detective test file.

### Transformation Process

The transformation from OpenAPI operations to Doc Detective tests follows this workflow:

#### 1. **Operation Extraction**
- All HTTP operations (GET, POST, PUT, PATCH, DELETE, etc.) are extracted from the `paths` section
- Each operation is evaluated for safety and configuration
- Non-operation fields like `parameters`, `servers`, `summary`, and `description` at the path level are skipped

#### 2. **Safety Classification**
Operations are classified as "safe" or "unsafe" based on the following rules:

**Safe Operations (automatically included):**
- Operations with `x-doc-detective` extension (any configuration makes them explicitly safe)
- GET, HEAD, OPTIONS, POST methods (considered safe by default)

**Unsafe Operations (skipped unless explicitly marked):**
- PUT, PATCH, DELETE methods without `x-doc-detective` extension
- Any operation that could modify or delete data without explicit safety confirmation

#### 3. **Test Generation**
For each safe operation, a Doc Detective test is created with:

- **Test ID**: Uses `operationId` if available, otherwise generates `{method}-{path}`
- **Description**: Uses operation `summary`, `description`, or generates from method and path
- **Main Step**: Creates an `httpRequest` step with OpenAPI configuration
- **Dependencies**: Adds `before` and `after` steps if configured

### x-doc-detective Extensions

The `x-doc-detective` extension provides fine-grained control over test generation and execution:

#### Root-Level Configuration
Applied to all operations as default values:

```yaml
openapi: 3.0.0
x-doc-detective:
  server: "https://testing.example.com"
  validateSchema: true
  statusCodes: [200, 201]
```

#### Operation-Level Configuration
Overrides root-level settings for specific operations:

```yaml
paths:
  /users/{id}:
    delete:
      x-doc-detective:
        validateSchema: false
        before: ["getUser"]
        after: ["getAllUsers"]
```

#### Supported Extension Properties

| Property | Type | Description |
|----------|------|-------------|
| `server` | string | Base URL for API requests (overrides OpenAPI servers) |
| `validateSchema` | boolean | Enable/disable response schema validation |
| `mockResponse` | boolean | Use mock responses instead of real API calls |
| `statusCodes` | array | Expected HTTP status codes for the operation |
| `useExample` | boolean | Use OpenAPI examples in requests |
| `exampleKey` | string | Specific example key to use from OpenAPI examples |
| `requestHeaders` | object | Additional headers to include in requests |
| `responseHeaders` | object | Expected response headers to validate |
| `before` | array | Operations to execute before this operation |
| `after` | array | Operations to execute after this operation |

### Dependency Management

Dependencies enable complex testing workflows by chaining operations:

#### Before Dependencies
Execute prerequisite operations before the main operation:

```yaml
post:
  operationId: createUser
  x-doc-detective:
    before: ["loginUser", "getPermissions"]
```

#### After Dependencies  
Execute cleanup or verification operations after the main operation:

```yaml
delete:
  operationId: deleteUser
  x-doc-detective:
    after: ["verifyUserDeleted", "cleanupSession"]
```

#### Dependency Resolution
Dependencies can be referenced by:
- **Operation ID**: `"getUserById"`
- **Path + Method**: `{"path": "/users/{id}", "method": "get"}`

### Configuration Inheritance

Configuration values are merged in the following priority order (highest to lowest):

1. Operation-level `x-doc-detective` configuration
2. Root-level `x-doc-detective` configuration  
3. Doc Detective global configuration
4. Default values

### Transformation Examples

#### Input: Basic OpenAPI Operation
```yaml
openapi: 3.0.0
paths:
  /users:
    get:
      operationId: getUsers
      summary: "Retrieve all users"
      responses:
        200:
          description: "List of users"
```

#### Output: Generated Doc Detective Test
```json
{
  "specId": "openapi-example",
  "tests": [
    {
      "id": "getUsers",
      "description": "Retrieve all users", 
      "steps": [
        {
          "action": "httpRequest",
          "openApi": {
            "operationId": "getUsers"
          }
        }
      ]
    }
  ],
  "openApi": [
    {
      "name": "Example API",
      "definition": { /* full OpenAPI spec */ }
    }
  ]
}
```

#### Input: Complex Operation with Dependencies
```yaml
paths:
  /users/{id}:
    delete:
      operationId: deleteUser
      x-doc-detective:
        server: "https://test.api.com"
        before: ["getUser", "backupUser"]
        after: ["verifyDeleted"]
        statusCodes: [204, 404]
```

#### Output: Generated Test with Dependencies
```json
{
  "id": "deleteUser",
  "steps": [
    {
      "action": "httpRequest",
      "openApi": { "operationId": "getUser" }
    },
    {
      "action": "httpRequest", 
      "openApi": { "operationId": "backupUser" }
    },
    {
      "action": "httpRequest",
      "openApi": {
        "operationId": "deleteUser",
        "server": "https://test.api.com",
        "statusCodes": [204, 404]
      }
    },
    {
      "action": "httpRequest",
      "openApi": { "operationId": "verifyDeleted" }
    }
  ]
}
```

### Requirements and Behaviors

#### Method-Specific Requirements
- **GET/HEAD/OPTIONS**: No special requirements, considered safe by default
- **POST**: Considered safe for creation operations, no additional requirements
- **PUT/PATCH/DELETE**: Require explicit `x-doc-detective` extension to be included

#### Validation Requirements
- OpenAPI specification must be valid 3.x format
- Referenced dependencies must exist in the same OpenAPI specification
- If `validateSchema: true`, operations must have complete request/response schemas

#### Server Configuration
- If no `server` specified in `x-doc-detective`, uses first server from OpenAPI `servers` array
- If no servers defined anywhere, transformation will fail with error
- Server URLs support environment variable substitution: `https://$API_HOST/v1`

### User Expectations

#### What Gets Generated
- **One test per safe operation**: Each operation becomes a separate test
- **Automatic request/response handling**: Full HTTP request steps with OpenAPI context
- **Schema validation**: Automatic request/response validation when enabled
- **Dependency orchestration**: Before/after operations executed in correct order

#### What Doesn't Get Generated
- **Unsafe operations**: PUT/PATCH/DELETE without explicit `x-doc-detective` are skipped
- **Path-level parameters**: Only operation-level configurations are processed
- **Custom test logic**: Only `httpRequest` steps are generated, no custom actions
- **Complex workflows**: Each operation is a separate test, not part of larger workflows

#### Error Handling
- **Invalid OpenAPI**: Files that don't validate as OpenAPI 3.x are skipped
- **Missing dependencies**: Referenced operations that don't exist log warnings but don't fail the transformation  
- **Schema errors**: Operations with invalid schemas log warnings but are still included
- **Server resolution**: Missing server configuration causes transformation to fail

### Integration with Doc Detective

Generated tests integrate seamlessly with the Doc Detective ecosystem:

- **Schema validation**: Uses Doc Detective's OpenAPI schema validation
- **Variable substitution**: Supports Doc Detective variable replacement patterns
- **Context resolution**: Automatically detects browser context requirements
- **Result reporting**: Test results use standard Doc Detective output format

### Best Practices

1. **Use meaningful operationIds**: They become test IDs and should be descriptive
2. **Include summaries/descriptions**: They become test descriptions for better reporting
3. **Configure servers appropriately**: Use test/staging servers, not production
4. **Mark destructive operations explicitly**: Use `x-doc-detective` on PUT/PATCH/DELETE
5. **Test dependencies carefully**: Ensure `before`/`after` operations exist and are safe
6. **Use environment variables**: Keep sensitive data out of OpenAPI files
7. **Validate your OpenAPI**: Use tools to ensure your specification is valid before testing

## Contributions

Looking to help out? See our [contributions guide](https://github.com/doc-detective/doc-detective-resolver/blob/main/CONTRIBUTIONS.md) for more info. If you can't contribute code, you can still help by reporting issues, suggesting new features, improving the documentation, or sponsoring the project.
