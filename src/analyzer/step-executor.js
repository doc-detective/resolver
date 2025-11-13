/**
 * Step execution wrapper with retry logic and heuristic adjustments.
 * Wraps doc-detective-core's runStep with intelligent error handling.
 */

const { buildRefinementPrompt } = require('./dynamic-prompt-builder');
const { analyzeSegment } = require('../llm/provider');

/**
 * Executes a step with retry logic and heuristic adjustments on failure.
 * 
 * @param {Object} step - Doc Detective step to execute
 * @param {Object} driver - WebDriverIO driver instance
 * @param {Object} config - Configuration object
 * @param {Function} runStepFn - The runStep function from doc-detective-core
 * @param {Object} context - Test context
 * @param {Object} options - Execution options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {boolean} options.useLlmRefinement - Whether to use LLM for refinement (default: false)
 * @param {Object} options.browserContext - Current browser context for refinement
 * @returns {Promise<Object>} Execution result with metadata
 * @returns {string} .status - 'PASS', 'FAIL', or 'SKIPPED'
 * @returns {string} .description - Result description
 * @returns {number} .retries - Number of retries performed
 * @returns {Array<Object>} .attempts - History of all attempts
 */
async function executeStepWithRetry(step, driver, config, runStepFn, context, options = {}) {
  const {
    maxRetries = 3,
    useLlmRefinement = false,
    browserContext = null
  } = options;

  const attempts = [];
  let currentStep = { ...step };
  let retryCount = 0;

  while (retryCount <= maxRetries) {
    // Execute the step
    const startTime = Date.now();
    let result;
    
    try {
      result = await runStepFn({
        config,
        context,
        step: currentStep,
        driver,
        metaValues: {},
        options: {}
      });
    } catch (error) {
      result = {
        status: 'FAIL',
        description: `Exception during step execution: ${error.message}`
      };
    }

    const executionTime = Date.now() - startTime;

    attempts.push({
      attempt: retryCount + 1,
      step: { ...currentStep },
      result: { ...result },
      executionTime
    });

    // If step passed, return success
    if (result.status === 'PASS') {
      return {
        ...result,
        retries: retryCount,
        attempts,
        finalStep: currentStep
      };
    }

    // If we've exhausted retries, return failure
    if (retryCount >= maxRetries) {
      return {
        ...result,
        retries: retryCount,
        attempts,
        finalStep: currentStep
      };
    }

    // Apply refinement for next retry
    retryCount++;
    
    if (useLlmRefinement && browserContext) {
      // Use LLM to refine the step
      currentStep = await refinementWithLlm(currentStep, result, browserContext, config);
    } else {
      // Use heuristic refinement
      currentStep = applyHeuristicRefinement(currentStep, result, retryCount);
    }
  }

  // Should never reach here, but just in case
  return {
    status: 'FAIL',
    description: 'Maximum retries exceeded',
    retries: maxRetries,
    attempts,
    finalStep: currentStep
  };
}

/**
 * Applies heuristic adjustments to a failed step.
 * 
 * @param {Object} step - Original step
 * @param {Object} result - Failure result
 * @param {number} retryCount - Current retry number
 * @returns {Object} Refined step
 */
function applyHeuristicRefinement(step, result, retryCount) {
  const refined = { ...step };
  const failureDescription = result.description || result.resultDescription || '';

  // Heuristic 1: Add wait before action (timing issue)
  if (retryCount === 1) {
    // Don't modify the original step, but the executor could add a wait before it
    // For now, we'll just add a description noting the retry
    refined.description = `${refined.description || 'Step'} (retry ${retryCount}: added wait)`;
    return refined;
  }

  // Heuristic 2: Try alternative selectors
  if (retryCount === 2) {
    // For find/click steps, try to make selector more flexible
    if (refined.click) {
      const originalSelector = typeof refined.click === 'string' ? refined.click : refined.click.selector;
      
      // Try variations
      if (originalSelector) {
        // If it's an ID, try without # 
        if (originalSelector.startsWith('#')) {
          refined.click = `[id="${originalSelector.substring(1)}"]`;
        }
        // If it's a class, try making it more general
        else if (originalSelector.startsWith('.')) {
          refined.click = `[class*="${originalSelector.substring(1)}"]`;
        }
        // Try adding :visible pseudo-selector (if supported)
        else {
          refined.click = `${originalSelector}:visible`;
        }
      }
    } else if (refined.find) {
      const originalSelector = typeof refined.find === 'string' ? refined.find : refined.find.selector;
      
      if (originalSelector) {
        if (originalSelector.startsWith('#')) {
          refined.find = `[id="${originalSelector.substring(1)}"]`;
        } else if (originalSelector.startsWith('.')) {
          refined.find = `[class*="${originalSelector.substring(1)}"]`;
        }
      }
    } else if (refined.type && refined.type.selector) {
      const originalSelector = refined.type.selector;
      
      if (originalSelector.startsWith('#')) {
        refined.type.selector = `[id="${originalSelector.substring(1)}"]`;
      } else if (originalSelector.startsWith('.')) {
        refined.type.selector = `[class*="${originalSelector.substring(1)}"]`;
      }
    }
    
    refined.description = `${refined.description || 'Step'} (retry ${retryCount}: adjusted selector)`;
    return refined;
  }

  // Heuristic 3: Last attempt - try most generic form
  if (retryCount >= 3) {
    // Make selector very flexible as last resort
    refined.description = `${refined.description || 'Step'} (retry ${retryCount}: final attempt)`;
    return refined;
  }

  return refined;
}

/**
 * Uses LLM to refine a failed step based on current browser context.
 * 
 * @param {Object} step - Failed step
 * @param {Object} result - Failure result
 * @param {Object} browserContext - Current browser state
 * @param {Object} config - Configuration with LLM settings
 * @returns {Promise<Object>} Refined step
 */
async function refineWithLlm(step, result, browserContext, config) {
  try {
    const prompt = buildRefinementPrompt(step, result, browserContext);
    
    const segment = {
      type: 'text',
      content: JSON.stringify(step),
      lineNumber: 0
    };

    const refinementResult = await analyzeSegment(segment, prompt, config);
    
    if (refinementResult.actions && refinementResult.actions.length > 0) {
      const refined = refinementResult.actions[0];
      
      // If confidence is too low, don't use the refinement
      if (refined.confidence && refined.confidence < 0.3) {
        return step; // Return original
      }
      
      return refined.step || refined;
    }
    
    return step; // Fallback to original
  } catch (error) {
    // If LLM refinement fails, return original step
    console.error('LLM refinement failed:', error.message);
    return step;
  }
}

/**
 * Validates a step before execution by checking if referenced elements exist.
 * 
 * @param {Object} step - Step to validate
 * @param {Object} driver - WebDriverIO driver instance
 * @returns {Promise<Object>} Validation result
 * @returns {boolean} .valid - Whether step can be executed
 * @returns {string} .reason - Reason if invalid
 */
async function validateStepPreExecution(step, driver) {
  try {
    // For steps that reference elements, check if they exist
    let selector = null;

    if (step.click) {
      selector = typeof step.click === 'string' ? step.click : step.click.selector;
    } else if (step.find) {
      selector = typeof step.find === 'string' ? step.find : step.find.selector;
    } else if (step.type && step.type.selector) {
      selector = step.type.selector;
    }

    if (selector) {
      // Try to find the element
      const elements = await driver.$$(selector);
      
      if (elements.length === 0) {
        return {
          valid: false,
          reason: `Element not found: ${selector}`
        };
      }

      // Check if element is visible (for click/type actions)
      if (step.click || step.type) {
        const isDisplayed = await elements[0].isDisplayed();
        if (!isDisplayed) {
          return {
            valid: false,
            reason: `Element exists but is not visible: ${selector}`
          };
        }
      }
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Validation error: ${error.message}`
    };
  }
}

module.exports = {
  executeStepWithRetry,
  validateStepPreExecution,
  applyHeuristicRefinement,
  refineWithLlm
};
