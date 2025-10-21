# Word Format Support

Doc Detective Resolver now supports Word documents (.docx and .doc files) as input for test detection and resolution.

## How It Works

Word documents are automatically converted to Markdown format using [Pandoc](https://pandoc.org/) with a custom Lua filter that extracts hidden text and converts it to HTML comments. The converted Markdown is then processed using the standard Markdown parsing rules.

### Conversion Process

1. **Pandoc** converts the Word document to Markdown
2. A **custom Lua filter** extracts text marked as "hidden" in Word and wraps it in HTML comment syntax
3. The resulting Markdown is **processed** by Doc Detective's standard parsing engine

This approach provides a cleaner user experience compared to typing HTML comments as plain text.

## Supported Features

All Markdown-based test detection features work with Word documents, including:

- **Bold text detection**: Text formatted as bold in Word will be detected for click and find actions
- **Hyperlinks**: Links in Word documents are converted and processed
- **Inline test specifications**: Use Word's hidden text feature to embed test specifications
- **Code blocks**: Code blocks are preserved during conversion (limited support)

### Inline Test Specifications with Hidden Text

The preferred method for adding inline test specifications is to use Word's **hidden text** feature. This keeps your documentation clean and readable while embedding test instructions.

**How to use hidden text in Word:**

1. Type your test specification (e.g., `<!-- test { "id": "my-test" } -->`)
2. Select the text
3. Press **Ctrl+D** (Windows) or **Cmd+D** (Mac) to open Font dialog
4. Check the **Hidden** checkbox
5. Click OK

The hidden text will be extracted during conversion and converted to HTML comments that Doc Detective can parse.

**Example:**

In your Word document, create hidden text containing:
```
<!-- test { "id": "my-test" } -->
```

Then write your visible documentation:
```
Click **Submit** button
```

Add another hidden text section:
```
<!-- step { "goTo": "https://example.com" } -->
```

Continue with visible text:
```
Look for the **Welcome** message
```

**Supported inline specification types:**
- `<!-- test { ... } -->` - Start a test with configuration
- `<!-- step { ... } -->` - Define an explicit test step
- `<!-- test end -->` - End a test block
- `<!-- test ignore start -->` / `<!-- test ignore end -->` - Ignore sections

**Alternative: Plain Text HTML Comments**

If you prefer not to use hidden text, you can still type HTML comments as plain text (visible in the document). They will be converted correctly, though this makes the document less readable for non-technical users.

## Usage

Simply specify a Word document as input:

```javascript
const { detectAndResolveTests } = require("doc-detective-resolver");

const results = await detectAndResolveTests({
  config: {
    input: "path/to/your/document.docx"
  }
});
```

## Example

Given a Word document with the following content:

- Click **Submit** button
- Navigate to https://example.com
- Look for the **Welcome** message

Doc Detective will detect:
- A click action for "Submit"
- A find action for "Submit" 
- A find action for "Welcome"

## Configuration

Word format support is enabled by default. The `word` file type is automatically added to the default file types list.

To customize Word document processing, you can extend or override the file type configuration:

```javascript
const config = {
  fileTypes: [
    "markdown",
    "word",
    // ... other file types
  ]
};
```

## Requirements

**Pandoc** must be installed on your system for Word format support to work:

- **Linux/macOS**: `apt-get install pandoc` or `brew install pandoc`
- **Windows**: Download from [pandoc.org](https://pandoc.org/installing.html)
- **Docker**: Include Pandoc in your container image

To verify Pandoc is installed:
```bash
pandoc --version
```

## Limitations

1. **Bold formatting**: Only simple bold formatting is reliably converted. Other text styles may not be preserved.
2. **Complex layouts**: Tables, multi-column layouts, and other complex formatting may not convert cleanly.
3. **Images**: Images are not currently processed or embedded in the converted Markdown.
4. **Hidden text extraction**: The Lua filter extracts text marked with Word's "Hidden" property. Other methods of hiding text may not be detected.
5. **Pandoc required**: Pandoc must be installed and available in the system PATH.

## Dependencies

Word format support requires:
- **Pandoc** - Document conversion engine (must be installed on system)
- **Lua filter** - Custom filter for extracting hidden text (included with Doc Detective Resolver)

## Testing

The test suite includes:
- Unit tests for the Word to Markdown conversion function
- Integration tests with sample Word documents
- Configuration tests for Word file type registration

To run the tests:

```bash
npm test
```
