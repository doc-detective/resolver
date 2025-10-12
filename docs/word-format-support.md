# Word Format Support

Doc Detective Resolver now supports Word documents (.docx and .doc files) as input for test detection and resolution.

## How It Works

Word documents are automatically converted to Markdown format using the [mammoth](https://github.com/mwilliamson/mammoth.js) library, then processed using the standard Markdown parsing rules.

## Supported Features

All Markdown-based test detection features work with Word documents, including:

- **Bold text detection**: Text formatted as bold in Word will be detected for click and find actions
- **Hyperlinks**: Links in Word documents are converted and processed
- **Test specifications**: HTML comment-style test specifications can be added to Word documents
- **Code blocks**: Code blocks are preserved during conversion (limited support)

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
4. **Comments**: Word comments are not preserved in the conversion.

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
