# Word Hidden Text Filter for Pandoc

This Lua filter extracts hidden text from Word documents and converts it to HTML comments in Markdown format.

## Purpose

This filter enables Doc Detective to process inline test specifications embedded as hidden text in Word documents. Hidden text provides a clean way to include test instructions without cluttering the visible documentation.

## How It Works

The filter processes the Word document during Pandoc conversion:

1. Identifies text marked with Word's "Hidden" property
2. Extracts the text content
3. Wraps it in HTML comment syntax (`<!-- ... -->`)
4. Inserts it into the Markdown output

## Usage

The filter is automatically applied when converting Word documents via the `convertWordToMarkdown()` function in `utils.js`.

Manual usage with Pandoc:
```bash
pandoc input.docx -f docx -t markdown --lua-filter=word-hidden-text-filter.lua -o output.md
```

## Word Hidden Text Format

In Microsoft Word:
1. Type your test specification (e.g., `<!-- test { "id": "my-test" } -->`)
2. Select the text
3. Press Ctrl+D (Windows) or Cmd+D (Mac)
4. Check the "Hidden" checkbox
5. Click OK

## Example

**Word document with hidden text:**
```
[Hidden: <!-- test { "id": "example-test" } -->]
Click the Submit button to continue.
[Hidden: <!-- step { "goTo": "https://example.com" } -->]
```

**Resulting Markdown:**
```markdown
<!-- test { "id": "example-test" } -->
Click the Submit button to continue.
<!-- step { "goTo": "https://example.com" } -->
```

## Supported Specifications

All Doc Detective inline specification types are supported:
- `<!-- test { ... } -->` - Test start with configuration
- `<!-- step { ... } -->` - Explicit test step
- `<!-- test end -->` - Test end
- `<!-- test ignore start -->` / `<!-- test ignore end -->` - Ignore blocks

## Notes

- The filter is designed to work with .docx files (Office Open XML format)
- Hidden text must be properly marked in Word using the Font dialog
- The filter includes fallback logic if hidden text detection fails
