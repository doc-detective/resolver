# Dynamic Documentation Analyzer

The Dynamic Documentation Analyzer is an advanced feature that analyzes unclear documentation and interactively executes and refines test steps using browser context and LLM guidance to generate canonical Doc Detective tests.

## Overview

Unlike the static analyzer which only extracts steps from documentation, the dynamic analyzer:

1. **Analyzes** documentation with LLM to identify rough steps
2. **Executes** each step in a live browser session
3. **Queries** the browser context (DOM, elements, forms, etc.)
4. **Refines** steps based on actual page state
5. **Interacts** with users when confidence is low or information is needed
6. **Generates** a validated, executable Doc Detective test

## Key Features

- **Context-Aware Step Generation**: Uses live browser state to generate precise selectors
- **Interactive User Queries**: Prompts users when confidence is low (<0.7 by default)
- **Credential Handling**: Detects credentials and guides users to use environment variables
- **Retry Logic**: Automatically retries failed steps with heuristic adjustments
- **Metadata Tracking**: Records token usage, retries, user interventions, and execution time

## Installation

The dynamic analyzer requires additional dependencies:

```bash
npm install doc-detective-core inquirer
```

## Usage

### Basic Example

```javascript
const { dynamicAnalyze } = require('doc-detective-resolver');

// Initialize WebDriverIO driver (from doc-detective-core)
const driver = await initializeDriver(config);

// Documentation to analyze
const documentation = `
Sign in to Example App with your credentials.
Click on the Dashboard tab.
Create a new project named "Test Project".
`;

// Configuration
const config = {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  userQueryThreshold: 0.7,
  maxRetries: 3
};

// Run dynamic analysis
const result = await dynamicAnalyze(documentation, config, driver);

// Result contains the canonical test and metadata
console.log(result.test);
console.log(result.metadata);
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | required | LLM provider: 'anthropic', 'openai', 'google', 'local' |
| `apiKey` | string | required | API key for the provider |
| `model` | string | optional | Specific model to use |
| `temperature` | number | 0.3 | LLM temperature (0-1) |
| `userQueryThreshold` | number | 0.7 | Confidence threshold for user queries (0-1) |
| `maxRetries` | number | 3 | Maximum retry attempts per step |
| `useLlmRefinement` | boolean | false | Use LLM for step refinement (vs heuristics) |
| `envFilePath` | string | '.env' | Path to .env file for credentials |

### Output Structure

The `dynamicAnalyze` function returns:

```javascript
{
  test: {
    testId: "uuid",
    description: "Dynamic test generated from...",
    steps: [
      { stepId: "uuid", goTo: "https://...", description: "..." },
      { stepId: "uuid", type: {...}, description: "..." },
      // ... more steps
    ],
    contexts: [...]
  },
  metadata: {
    startTime: "ISO timestamp",
    endTime: "ISO timestamp",
    executionTime: 12345, // milliseconds
    tokenUsage: {
      prompt: 1000,
      completion: 500,
      total: 1500
    },
    retries: 2,
    userInterventions: [
      { type: "low_confidence", timestamp: "...", ... },
      { type: "credentials", timestamp: "...", ... }
    ],
    stepsAnalyzed: 5,
    stepsExecuted: 5,
    stepsFailed: 0,
    stepsSkipped: 0
  },
  error: "error message (if any)"
}
```

## How It Works

### 1. Initial Static Analysis

First, the documentation is analyzed using the existing static analyzer to identify rough steps:

```
"Sign in to Example App" → { type: {...}, click: {...}, ... }
```

### 2. Iterative Refinement Loop

For each rough step:

#### a. Extract Browser Context

Query the current page state:
- URL and title
- Forms and their inputs
- Buttons and links
- Visible text

#### b. Refine Step with LLM

Build a prompt that includes:
- The rough step
- Current browser context
- Previously completed steps

The LLM returns:
```javascript
{
  step: { click: "#login-btn" },
  confidence: 0.95,
  reasoning: "Found visible login button with ID 'login-btn'"
}
```

#### c. User Query (if needed)

If confidence < threshold (default 0.7):
- Display the proposed step
- Show browser context (optional)
- Ask user to: Continue / Skip / Abort

#### d. Validate Step

Check if elements exist and are visible before execution.

#### e. Execute Step

Run the step using doc-detective-core's execution engine.

#### f. Handle Failures

If step fails:
- Apply heuristic adjustments (add wait, try alternative selectors)
- Retry up to `maxRetries`
- Query user if still failing

### 3. Credential Handling

When credentials are detected (e.g., `$USERNAME`, `$PASSWORD`):

1. Prompt user about credential handling
2. Generate placeholder variables
3. Add `loadVariables` step to test
4. Provide instructions for .env file:
   ```
   USERNAME=your_username_here
   PASSWORD=your_password_here
   ```

### 4. Generate Canonical Test

Combine all validated steps into a complete Doc Detective test with proper structure.

## User Interaction Examples

### Low Confidence Step

```
⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠
LOW CONFIDENCE STEP DETECTED
⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠

Confidence: 65.0%
Proposed Step: Click on "Submit" button

The analyzer has low confidence in this step. What would you like to do?
? Your choice: (Use arrow keys)
❯ Continue with this step
  Show me the JSON and browser context
  Skip this step
  Abort the analysis
```

### Credential Handling

```
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐
CREDENTIALS REQUIRED
🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐🔐

The documentation references credentials: username, password

To handle these securely, the analyzer will:
1. Use placeholder variables in the test (e.g., $USERNAME, $PASSWORD)
2. Add a loadVariables step to load from your .env file
3. Provide instructions for populating your .env file

Placeholders that will be used:
  username -> $USERNAME
  password -> $PASSWORD

? Do you want to proceed with placeholder credentials? (Y/n)

--------------------------------------------------------------------------------
INSTRUCTIONS: Add these lines to your .env file:
--------------------------------------------------------------------------------
USERNAME=your_username_here
PASSWORD=your_password_here
--------------------------------------------------------------------------------

Replace the placeholder values with your actual credentials.
The .env file should be in your project root or test directory.
```

## Heuristic Refinement

When a step fails, the following heuristics are applied:

### Retry 1: Add Wait
Assumes timing issue - internally adds a delay before execution.

### Retry 2: Adjust Selector
- `#element-id` → `[id="element-id"]`
- `.class-name` → `[class*="class-name"]`
- Add `:visible` pseudo-selector

### Retry 3: Final Attempt
Most generic selector form, last resort.

## LLM-Guided Refinement

Set `useLlmRefinement: true` to use the LLM for refining failed steps:

```javascript
const result = await dynamicAnalyze(documentation, {
  ...config,
  useLlmRefinement: true
});
```

The LLM receives:
- Failed step
- Failure reason
- Current browser context

And suggests a refined step with explanation.

## Best Practices

### 1. Start with Clear URLs
If documentation doesn't mention a starting URL, the analyzer will prompt you. Have the URL ready.

### 2. Use Specific Instructions
Better: "Click the 'Submit' button in the login form"
Worse: "Submit the form"

### 3. Monitor Confidence Scores
Low confidence often indicates:
- Ambiguous documentation
- Elements not present on page
- Need for user clarification

### 4. Secure Credentials
Always use environment variables for sensitive data. Never hardcode credentials.

### 5. Review Generated Tests
The generated test is a starting point. Review and adjust as needed.

## Limitations

1. **Requires Browser Session**: Must have an initialized WebDriver instance
2. **LLM API Access**: Requires API key for Anthropic, OpenAI, or Google
3. **Interactive**: Requires user input, not fully automated
4. **Token Costs**: LLM calls for each step refinement consume API tokens
5. **Browser State**: Assumes clean browser state; doesn't handle sessions or auth automatically

## Troubleshooting

### "doc-detective-core not available"
Install the dependency: `npm install doc-detective-core`

### Driver initialization fails
Ensure Appium is installed and browser drivers are available.

### High token usage
- Reduce `maxRetries`
- Use smaller models
- Simplify documentation input

### Steps keep failing
- Check if site requires authentication
- Verify selectors manually
- Try `useLlmRefinement: true` for better refinement

## Future Enhancements

- [ ] Parallel step execution
- [ ] Visual regression testing integration
- [ ] Session/auth state management
- [ ] Multi-page workflow support
- [ ] Step recording/playback
- [ ] Confidence tuning based on success rate
- [ ] LLM-guided retry strategies (configurable)

## See Also

- [Static Analyzer](./ANALYZER.md)
- [Doc Detective Core](https://github.com/doc-detective/doc-detective-core)
- [Examples](../examples/)
