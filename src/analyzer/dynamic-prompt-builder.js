/**
 * Dynamic prompt builder for context-aware step generation.
 * Constructs LLM prompts that include browser state and execution history.
 */

const { buildCorePrompt } = require('./prompt-builder');

/**
 * Builds a dynamic prompt for the LLM that includes current browser context and previous step results.
 * 
 * @param {string} instruction - The instruction text to analyze
 * @param {Object} browserContext - Current browser state from extractBrowserContext()
 * @param {Object} previousResult - Result from the previous step execution (optional)
 * @param {Array<Object>} completedSteps - Array of steps already completed (optional)
 * @returns {string} Complete prompt for the LLM
 */
function buildDynamicPrompt(instruction, browserContext, previousResult = null, completedSteps = []) {
  let prompt = `You are analyzing documentation and generating a SINGLE, SPECIFIC Doc Detective test step based on the current browser state and instruction.

CRITICAL REQUIREMENTS:
1. Generate EXACTLY ONE step - the next logical action needed
2. Use specific selectors based on the actual elements present on the page
3. Include a confidence score (0-1) indicating how certain you are about this step
4. Be precise with element selectors - prefer IDs, then specific names, then unique class combinations
5. If credentials or variable values are mentioned, use placeholder variables like $USERNAME, $PASSWORD

`;

  // Add browser context
  if (browserContext) {
    prompt += `CURRENT BROWSER STATE:
URL: ${browserContext.url}
Title: ${browserContext.title}

`;

    if (browserContext.headings && browserContext.headings.length > 0) {
      prompt += `Page Headings:\n`;
      browserContext.headings.forEach(h => {
        prompt += `- ${h.text}\n`;
      });
      prompt += `\n`;
    }

    if (browserContext.forms && browserContext.forms.length > 0) {
      prompt += `Forms Available:\n`;
      browserContext.forms.forEach((form, idx) => {
        prompt += `Form ${idx}: ${form.id || form.name || 'unnamed'}\n`;
        if (form.inputs.length > 0) {
          form.inputs.forEach(input => {
            prompt += `  - ${input.type}: ${input.name || input.id || 'unnamed'} ${input.label ? `(${input.label})` : ''}\n`;
          });
        }
      });
      prompt += `\n`;
    }

    if (browserContext.inputs && browserContext.inputs.length > 0) {
      prompt += `Input Fields Available:\n`;
      browserContext.inputs.slice(0, 15).forEach(input => {
        const label = input.label || input.ariaLabel || input.placeholder || 'unlabeled';
        prompt += `- ${input.type}: "${label}" selector: ${input.selector || 'needs detection'}\n`;
      });
      prompt += `\n`;
    }

    if (browserContext.buttons && browserContext.buttons.length > 0) {
      prompt += `Buttons Available:\n`;
      browserContext.buttons.slice(0, 15).forEach(btn => {
        prompt += `- "${btn.text}" ${btn.selector ? `selector: ${btn.selector}` : ''}\n`;
      });
      prompt += `\n`;
    }

    if (browserContext.links && browserContext.links.length > 0) {
      prompt += `Links Available (first 10):\n`;
      browserContext.links.slice(0, 10).forEach(link => {
        prompt += `- "${link.text}" -> ${link.href}\n`;
      });
      prompt += `\n`;
    }
  }

  // Add previous result context
  if (previousResult) {
    prompt += `PREVIOUS STEP RESULT:
Status: ${previousResult.result || previousResult.status}
${previousResult.description || previousResult.resultDescription || ''}

`;
  }

  // Add completed steps context
  if (completedSteps && completedSteps.length > 0) {
    prompt += `STEPS COMPLETED SO FAR:\n`;
    completedSteps.forEach((step, idx) => {
      prompt += `${idx + 1}. ${step.description || JSON.stringify(step).substring(0, 100)}\n`;
    });
    prompt += `\n`;
  }

  // Add the instruction
  prompt += `INSTRUCTION TO IMPLEMENT:
"${instruction}"

TASK:
Analyze the current browser state and determine the SINGLE NEXT STEP needed to progress toward completing this instruction.

RESPONSE FORMAT:
Return a JSON object with this exact structure:
{
  "step": {
    // Single Doc Detective step object (e.g., {"click": "button#submit"}, {"type": {"keys": "$USERNAME", "selector": "input[name='username']"}}, etc.)
  },
  "confidence": 0.0-1.0,  // Your confidence in this step (0=uncertain, 1=certain)
  "reasoning": "Brief explanation of why this is the next step and how you chose the selector"
}

STEP TYPES AVAILABLE:
- Navigation: {"goTo": "url"}
- Finding: {"find": "selector"} or {"find": {"selector": "css", "matchText": "text"}}
- Clicking: {"click": "selector"}
- Typing: {"type": {"keys": "text or $VARIABLE", "selector": "css"}}
- Waiting: {"wait": milliseconds}
- HTTP: {"httpRequest": {"method": "GET/POST", "url": "..."}}

SELECTOR GUIDELINES:
- Prefer IDs: "#element-id"
- Then names: "input[name='username']"
- Then specific classes: ".primary-button"
- Then text matching: {"selector": "button", "matchText": "Sign In"}
- Avoid overly generic selectors like "button" or "input"

CONFIDENCE SCORING:
- 1.0: Exact match found (ID or name directly in page, clear action)
- 0.8-0.9: Strong match (unique selector, clear context)
- 0.6-0.7: Reasonable match (selector exists but might not be unique)
- 0.4-0.5: Uncertain (multiple possibilities, ambiguous instruction)
- 0.0-0.3: Guessing (no clear match, instruction unclear)

IMPORTANT:
- If credentials/passwords are mentioned, use placeholder variables like $USERNAME, $PASSWORD
- If navigating to a URL, return a goTo step
- If finding/verifying an element, use find step
- If clicking or submitting, use click step
- If entering text, use type step with selector
`;

  return prompt;
}

/**
 * Builds a prompt for refining a failed step.
 * 
 * @param {Object} failedStep - The step that failed
 * @param {Object} failureResult - The failure result
 * @param {Object} browserContext - Current browser state
 * @returns {string} Refinement prompt
 */
function buildRefinementPrompt(failedStep, failureResult, browserContext) {
  let prompt = `A test step failed and needs refinement based on the current browser state.

FAILED STEP:
${JSON.stringify(failedStep, null, 2)}

FAILURE REASON:
${failureResult.description || failureResult.resultDescription || 'Unknown error'}

CURRENT BROWSER STATE:
URL: ${browserContext.url}
Title: ${browserContext.title}

`;

  if (browserContext.inputs && browserContext.inputs.length > 0) {
    prompt += `Available Inputs:\n`;
    browserContext.inputs.slice(0, 10).forEach(input => {
      prompt += `- ${input.type}: ${input.selector || input.name || input.id}\n`;
    });
    prompt += `\n`;
  }

  if (browserContext.buttons && browserContext.buttons.length > 0) {
    prompt += `Available Buttons:\n`;
    browserContext.buttons.slice(0, 10).forEach(btn => {
      prompt += `- "${btn.text}" ${btn.selector}\n`;
    });
    prompt += `\n`;
  }

  prompt += `TASK:
Analyze why the step failed and suggest a refined version that will work with the current page state.

Common issues to check:
- Wrong selector (element doesn't exist)
- Element not visible or not ready
- Need to wait for page load
- Need to scroll element into view
- Wrong element type

RESPONSE FORMAT:
{
  "step": { /* refined step */ },
  "confidence": 0.0-1.0,
  "reasoning": "Explanation of what was wrong and how the refinement fixes it"
}

If the step cannot be refined (e.g., element truly doesn't exist), set confidence to 0 and explain why.
`;

  return prompt;
}

module.exports = {
  buildDynamicPrompt,
  buildRefinementPrompt
};
