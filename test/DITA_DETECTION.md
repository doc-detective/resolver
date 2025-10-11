# DITA XML Test Detection

This document explains how to use DITA XML test detection with Doc Detective.

## Overview

DITA XML files can contain Doc Detective tests using XML processing instructions. The resolver automatically detects tests in files with `.dita`, `.ditamap`, or `.xml` extensions when the DITA file type is configured.

## Syntax

All processing instructions must start with `<?doc-detective` to be recognized by Doc Detective.

### Test Definition

Use XML processing instructions to define tests. You can use either YAML format or XML-style attributes.

**YAML format (multiline):**
```xml
<?doc-detective test
testId: my-test-id
detectSteps: false
?>
<!-- test content here -->
<?doc-detective test end?>
```

**XML attribute format (single line):**
```xml
<?doc-detective test testId="my-test-id" detectSteps=false ?>
<!-- test content here -->
<?doc-detective test end?>
```

### Step Definition

Individual test steps can be defined using either format:

**YAML format:**
```xml
<?doc-detective step checkLink: "https://example.com" ?>
<?doc-detective step find: "some text" ?>
```

**XML attribute format:**
```xml
<?doc-detective step checkLink="https://example.com" ?>
<?doc-detective step find="some text" ?>
<?doc-detective step wait=500 ?>
```

## Configuration

To enable DITA XML detection, add the DITA file type to your configuration:

```json
{
  "input": "path/to/dita/files",
  "fileTypes": [
    {
      "name": "dita",
      "extensions": ["dita", "ditamap", "xml"],
      "inlineStatements": {
        "testStart": ["<\\?doc-detective\\s+test\\s+([\\s\\S]*?)\\s*\\?>"],
        "testEnd": ["<\\?doc-detective\\s+test\\s+end\\s*\\?>"],
        "ignoreStart": ["<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>"],
        "ignoreEnd": ["<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>"],
        "step": ["<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>"]
      },
      "markup": []
    }
  ]
}
```

Alternatively, you can reference the built-in DITA definition (when available in the schema).

## Example

See `test/example.dita` for a complete example of a DITA topic with embedded Doc Detective tests.

## Platform Compatibility

The patterns automatically handle both Unix (`\n`) and Windows (`\r\n`) line endings, ensuring cross-platform compatibility.

## Attribute Parsing

When using XML-style attributes:
- String values can be quoted: `name="value"` or unquoted: `name=value`
- Boolean values are recognized: `detectSteps=false` becomes `false` (boolean)
- Numeric values are parsed: `wait=500` becomes `500` (number)
- Dot notation creates nested objects: `httpRequest.url="https://example.com"` becomes `{ httpRequest: { url: "https://example.com" } }`

### Dot Notation for Nested Objects

You can use dot notation in attribute names to create nested object structures. This is particularly useful for complex actions like `httpRequest`:

**Example:**
```xml
<?doc-detective step httpRequest.url="https://api.example.com/users" httpRequest.method="GET" ?>
```

This creates:
```json
{
  "httpRequest": {
    "url": "https://api.example.com/users",
    "method": "GET"
  }
}
```

**Multi-level nesting:**
```xml
<?doc-detective step httpRequest.url="https://api.example.com/submit" httpRequest.method="POST" httpRequest.request.body="test data" ?>
```

This creates:
```json
{
  "httpRequest": {
    "url": "https://api.example.com/submit",
    "method": "POST",
    "request": {
      "body": "test data"
    }
  }
}
```

