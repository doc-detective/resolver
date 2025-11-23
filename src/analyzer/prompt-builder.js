/**
 * Prompt builder module for constructing LLM prompts
 */

/**
 * Core analysis prompt with high-recall bias
 */
const CORE_ANALYSIS_PROMPT = `You are an expert at extracting Doc Detective test actions from documentation.

Your task is to analyze documentation paragraphs and extract ALL possible test actions, even if some might be implicit or optional.

EXTRACTION PHILOSOPHY - Follow these 5 principles:
1. High Recall Over Precision: Extract ALL potential actions, even if confidence is low. False positives are acceptable.
2. Decompose Complex Actions: Break down compound instructions into individual steps (e.g., "log in" → goTo login page, find username field, typeKeys username, find password field, typeKeys password, click submit)
3. Add Implicit Actions: Include obvious but unstated steps (e.g., if clicking a button, add a find action first to ensure it exists)
4. Extract Conditionals: When documentation mentions "if/when/unless", create conditional action structures
5. Be Defensive: Add verification steps after important actions (e.g., after login, verify success)

ACTION DECOMPOSITION EXAMPLES:

Example 1 - Simple navigation:
Input: "Navigate to https://example.com and click the Login button"
Output:
[
  {
    "goTo": "https://example.com"
  },
  {
    "click": {
      "elementText": "Login"
    }
  }
]

Example 2 - Form filling with implicit steps:
Input: "Enter your email and password, then submit the form"
Output:
[
  {
    "find": {
      "selector": "input[type='email']"
    },
    "description": "Verify email field exists"
  },
  {
    "type": {
      "selector": "input[type='email']",
      "keys": "$EMAIL"
    }
  },
  {
    "find": {
      "selector": "input[type='password']"
    },
    "description": "Verify password field exists"
  },
  {
    "type": {
      "selector": "input[type='password']",
      "keys": "$PASSWORD"
    }
  },
  {
    "click": {
      "selector": "button[type='submit']"
    }
  }
]

COMMON PATTERNS TO WATCH FOR:
- "Navigate to X" → goTo action
- "Click X" → find + click actions
- "Enter/Type X" → find + type actions
- "Verify/Check X" → find action with elementText
- "Make a request to X" → httpRequest action
- "Run command X" → runShell action

OUTPUT FORMAT:
- Return a JSON array of action objects
- Include all required fields for each action type based on the schemas provided
- Use placeholder variables (e.g., $EMAIL, $PASSWORD, $USERNAME) when actual values aren't specified
- Add a "description" field to explain the purpose when helpful
- Add a "note" field for any assumptions or clarifications
- Add a "confidence" field ("high", "medium", "low") to indicate certainty

IMPORTANT: Return ONLY the JSON array, no additional text or explanation.`;

/**
 * Static mode enhancement prompt
 */
const STATIC_MODE_PROMPT = `
STATIC ANALYSIS MODE:
You are analyzing documentation WITHOUT access to the actual application or web page.

Aggressive Inference Strategies:
- Make educated guesses about selectors based on common patterns
- Use semantic selectors when possible (e.g., "button:has-text('Login')")
- Assume standard HTML form elements unless otherwise specified
- Infer reasonable URLs and endpoints from context
- Use generic placeholders for unknown values

Handling Ambiguity:
- When element identification is unclear, provide multiple selector options in notes
- When action timing is uncertain, add wait actions between steps
- When conditionals are implied but not explicit, still extract them
- When verification is important but not stated, add find actions

Confidence Scoring:
- "high": Explicit, clear instructions with specific details
- "medium": Implied actions or common patterns
- "low": Highly inferred or ambiguous actions

Remember: It's better to extract too many actions than to miss important ones.`;

/**
 * Builds the core analysis prompt
 * @returns {string} The core analysis prompt
 */
function buildCorePrompt() {
  return CORE_ANALYSIS_PROMPT;
}

/**
 * Builds the static mode enhancement prompt
 * @returns {string} The static mode prompt
 */
function buildStaticModePrompt() {
  return STATIC_MODE_PROMPT;
}

/**
 * Detects likely action types from paragraph content
 * @param {string} paragraph - The paragraph to analyze
 * @returns {string[]} Array of detected action types
 */
function detectActionTypes(paragraph) {
  const lowerParagraph = paragraph.toLowerCase();
  const detectedTypes = new Set();

  // Always include find and conditional as they're commonly needed
  detectedTypes.add('find');
  detectedTypes.add('conditional');

  // Detection patterns
  const patterns = {
    goTo: /\b(navigate|go to|visit|open|browse to)\b/,
    click: /\b(click|press|tap|select)\b/,
    typeKeys: /\b(type|enter|input|fill|write)\b/,
    wait: /\b(wait|pause|delay)\b/,
    httpRequest: /\b(request|api|endpoint|GET|POST|PUT|DELETE|PATCH)\b/,
    runShell: /\b(command|run|execute|shell|terminal|cli)\b/,
    screenshot: /\b(screenshot|capture|image)\b/,
    checkLink: /\b(check link|verify link|link|href)\b/
  };

  for (const [actionType, pattern] of Object.entries(patterns)) {
    if (pattern.test(lowerParagraph)) {
      detectedTypes.add(actionType);
    }
  }

  return Array.from(detectedTypes);
}

/**
 * Builds the complete prompt for a segment
 * @param {Object} segment - The document segment
 * @param {Object} schemas - All available schemas
 * @returns {string} The complete prompt
 */
function buildPrompt(segment, schemas) {
  const corePrompt = buildCorePrompt();
  const staticPrompt = buildStaticModePrompt();
  const relevantSchemas = schemas.step_v3;
  
  return `${corePrompt}

${staticPrompt}

${relevantSchemas}

DOCUMENT SEGMENT TO ANALYZE (${segment.type}, line ${segment.lineNumber}):
${segment.content}

Now extract all action steps from this segment. Return ONLY a JSON array of step objects.`;
}

module.exports = {
  buildCorePrompt,
  buildStaticModePrompt,
  buildPrompt,
  detectActionTypes
};
