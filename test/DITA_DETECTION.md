# DITA XML Test Detection

This document explains how to use DITA XML test detection with Doc Detective.

## Overview

DITA XML files can contain Doc Detective tests using XML processing instructions. The resolver automatically detects tests in files with `.dita`, `.ditamap`, or `.xml` extensions when the DITA file type is configured.

## Syntax

### Test Definition

Use XML processing instructions to define tests:

```xml
<?test
testId: my-test-id
detectSteps: false
?>
<!-- test content here -->
<?test end?>
```

### Step Definition

Individual test steps can be defined using:

```xml
<?step checkLink: "https://example.com" ?>
<?step find: "some text" ?>
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
        "testStart": ["<\\?test\\s+([\\s\\S]*?)\\s*\\?>"],
        "testEnd": ["<\\?test end\\s*\\?>"],
        "ignoreStart": ["<\\?test ignore start\\s*\\?>"],
        "ignoreEnd": ["<\\?test ignore end\\s*\\?>"],
        "step": ["<\\?step\\s+([\\s\\S]*?)\\s*\\?>"]
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
