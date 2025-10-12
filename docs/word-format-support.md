# Word Format Support

Doc Detective Resolver now supports Word documents (.docx and .doc files) as input for test detection and resolution.

## How It Works

Word documents are automatically converted to Markdown format using the [mammoth](https://github.com/mwilliamson/mammoth.js) library, then processed using the standard Markdown parsing rules.

## Supported Features

All Markdown-based test detection features work with Word documents, including:

- **Bold text detection**: Text formatted as bold in Word will be detected for click and find actions
- **Hyperlinks**: Links in Word documents are converted and processed
- **Inline test specifications**: HTML comment-style test specifications typed as plain text in Word documents
- **Code blocks**: Code blocks are preserved during conversion (limited support)

### Inline Test Specifications

You can specify inline test specifications in Word documents by typing HTML comment syntax as plain text. These will be preserved during conversion and processed by Doc Detective.

**Example:**

In your Word document, type the following as regular text:

```
<!-- test { "id": "my-test" } -->

Click **Submit** button

<!-- step { "goTo": "https://example.com" } -->

Look for the **Welcome** message
```

Doc Detective will recognize and parse these inline specifications just like it does in Markdown files.

**Supported inline specification types:**
- `<!-- test { ... } -->` - Start a test with configuration
- `<!-- step { ... } -->` - Define an explicit test step
- `<!-- test end -->` - End a test block
- `<!-- test ignore start -->` / `<!-- test ignore end -->` - Ignore sections

**Tips for using inline specifications in Word:**
- Type the HTML comments as regular text (don't use Word's comment feature)
- Use a monospace font (like Courier New) for better readability
- Ensure proper JSON syntax within the comments
- The conversion process will unescape these comments automatically

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

## Limitations

1. **Bold formatting**: Only simple bold formatting is reliably converted. Other text styles may not be preserved.
2. **Complex layouts**: Tables, multi-column layouts, and other complex formatting may not convert cleanly.
3. **Images**: Images are not currently processed or embedded in the converted Markdown.
4. **Word Comments**: Word's built-in comment feature (Review > New Comment) is not extracted. To use inline test specifications, type HTML comments as plain text in the document body instead.

## Dependencies

Word format support requires the `mammoth` npm package, which is included as a dependency of doc-detective-resolver.

## Testing

The test suite includes:
- Unit tests for the Word to Markdown conversion function
- Integration tests with sample Word documents
- Configuration tests for Word file type registration

To run the tests:

```bash
npm test
```
