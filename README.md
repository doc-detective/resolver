# Doc Detective Resolver

![Current version](https://img.shields.io/github/package-json/v/doc-detective/resolver?color=orange)
[![NPM Shield](https://img.shields.io/npm/v/doc-detective-resolver)](https://www.npmjs.com/package/doc-detective-resolver)
[![Discord Shield](https://img.shields.io/badge/chat-on%20discord-purple)](https://discord.gg/2M7wXEThfF)
[![Docs Shield](https://img.shields.io/badge/docs-doc--detective.com-blue)](https://doc-detective.com)

Detect and resolve documentation into Doc Detective tests. This package helps you find and process tests embedded in your documentation.

This package is part of the [Doc Detective](https://github.com/doc-detective/doc-detective) ecosystem.

## Features

- **Embedded Test Detection**: Parse documentation files to extract embedded test specifications
- **Test Resolution**: Process and standardize detected tests into executable format  
- **OpenAPI/Arazzo Support**: Integration with API specifications
- **Multiple Markup Formats**: Support for Markdown, HTML, JavaScript, and more
- **🆕 AI-Powered Analysis**: Automatically extract test actions from documentation using LLMs

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

## AI-Powered Static Analysis (New!)

The `analyze()` function uses LLM providers to automatically extract Doc Detective action steps from plain documentation text. This feature is optimized for **high recall** - it extracts all possible actions even at the cost of some false positives.

### `analyze(document, config)`

Analyzes documentation and extracts action steps using AI.

#### Supported Providers

- **Anthropic** (Claude)
- **Google** (Gemini)
- **OpenAI** (GPT-4)

#### Configuration

```javascript
const { analyze } = require("doc-detective-resolver");

const config = {
  provider: 'anthropic',  // or 'google', 'openai'
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-20250514',  // optional, uses provider default
  temperature: 0.3,  // optional, default 0.3
  maxTokens: 4000    // optional, default 4000
};
```

#### Basic Usage

```javascript
const { analyze } = require("doc-detective-resolver");

const documentation = `
Navigate to https://example.com and log in with your credentials.
Click the Settings button in the top navigation bar.
Enter your new password and click Save.
`;

const result = await analyze(documentation, {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

console.log(`Extracted ${result.summary.totalActions} actions`);
console.log(JSON.stringify(result.actions, null, 2));
```

#### Response Format

```javascript
{
  actions: [
    {
      action: 'goTo',
      url: 'https://example.com',
      _source: { type: 'text', content: '...', line: 2 },
      _generated: false
    },
    {
      action: 'find',
      selector: "input[type='email']",
      description: 'Verify email field exists',
      _generated: true  // Added defensively
    },
    // ... more actions
  ],
  segments: [
    {
      actions: [...],
      segment: { type: 'text', content: '...', lineNumber: 2 },
      metadata: { promptTokens: 245, completionTokens: 189, latencyMs: 1234 }
    }
  ],
  summary: {
    totalActions: 15,
    totalSegments: 3,
    analyzedSegments: 3,
    skippedSegments: 0,
    totalTokens: 434,
    totalLatencyMs: 1234
  }
}
```

#### Environment Variables

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
# or
export GOOGLE_GENERATIVE_AI_API_KEY="..."
# or
export OPENAI_API_KEY="sk-..."
```

#### Advanced Features

**Defensive Actions**: The analyzer automatically adds verification steps:
- `find` actions before `click` and `typeKeys` to ensure elements exist
- `wait` actions after submit/save operations

**Source Attribution**: Each action is tagged with its source:
```javascript
{
  action: 'click',
  selector: 'button',
  _source: {
    type: 'text',
    content: 'Click the submit button',
    line: 5
  }
}
```

**Code Block Analysis**: Shell commands in code blocks are automatically extracted:
````markdown
```bash
npm install
npm run build
```
````

**Conditional Logic**: Handles conditional instructions:
```javascript
// Input: "If you see a popup, close it. Then click Continue."
{
  action: 'conditional',
  if: [{ action: 'find', selector: '.popup' }],
  then: [{ action: 'click', selector: '.popup .close' }]
}
```

#### Limitations

- Requires API keys from supported LLM providers
- Network connectivity required
- Processing time and cost depend on document length
- Best for instructional documentation (not reference docs)
- Generated actions should be reviewed before production use

## Development with Workspaces

This package supports npm workspaces for developing `doc-detective-common` alongside the resolver. This allows you to modify both packages simultaneously and test changes together.

### Setting up Workspaces

The workspace setup happens automatically during `npm install`, but you can also set it up manually:

```bash
npm run workspace:install
```

This will:
- Clone the `doc-detective/common` repository into `workspaces/doc-detective-common`
- Install dependencies for the workspace package
- Set up the workspace configuration

### Working with Workspaces

Once set up, you can use standard npm workspace commands:

```bash
# Run tests across all workspaces
npm run workspace:test

# Build all workspace packages
npm run workspace:build

# Install a dependency in the common workspace
npm install <package> -w doc-detective-common

# Run commands in specific workspaces
npm run test -w doc-detective-common
npm run build -w doc-detective-common
```

### Environment Variables

- `NO_WORKSPACE_SETUP` - Skip workspace setup during postinstall
- `FORCE_WORKSPACE_SETUP` - Force workspace setup even in CI environments

## Contributions

Looking to help out? See our [contributions guide](https://github.com/doc-detective/doc-detective-resolver/blob/main/CONTRIBUTIONS.md) for more info. If you can't contribute code, you can still help by reporting issues, suggesting new features, improving the documentation, or sponsoring the project.
