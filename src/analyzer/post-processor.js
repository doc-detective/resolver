/**
 * Post-processor module for enhancing and validating actions
 */

const { validate } = require("doc-detective-common");

/**
 * Adds defensive find actions before click/typeKeys actions
 * to increase reliability and recall.
 * @param {Array} actions - Array of action steps
 * @returns {Array} Enhanced array with defensive actions
 */
function addDefensiveActions(actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return actions;
  }

  const enhanced = [];
  const significantActions = ["click", "type"];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionType = action.action;

    // Check if this is a significant action that needs a find before it
    if (significantActions.includes(actionType) && action.selector) {
      // Check if the previous action is already a find for the same selector
      const prevAction = enhanced[enhanced.length - 1];
      const hasPrecedingFind =
        prevAction &&
        prevAction.find &&
        (prevAction.find === action.selector || prevAction.find.selector === action.selector);

      if (!hasPrecedingFind) {
        // Add a defensive find action
        enhanced.push({
          find: {
            selector: action.selector,
          },
          description: `Verify element exists before ${actionType}`,
        });
      }
    }

    enhanced.push(action);

    // Add verification after important submission actions
    if (actionType === "click" && action.selector) {
      const selectorLower = action.selector.toLowerCase();
      const isSubmitAction =
        selectorLower.includes("submit") ||
        selectorLower.includes("login") ||
        selectorLower.includes("save") ||
        selectorLower.includes("send");

      if (isSubmitAction) {
        // Look ahead to see if there's already a verification
        const nextAction = actions[i + 1];
        const hasVerification = nextAction && nextAction.action === "find";

        if (!hasVerification) {
          enhanced.push({
            wait: 2000,
            description: "Wait for action to complete",
          });
        }
      }
    }
  }

  return enhanced;
}

/**
 * Tags actions with source attribution for traceability
 * @param {Array} actions - Array of action steps
 * @param {Object} segment - Source document segment
 * @returns {Array} Actions with source information
 */
function tagActionsWithSource(actions, segment) {
  if (!Array.isArray(actions)) {
    return actions;
  }

  return actions.map((action) => {
    // Don't override existing _source
    if (action._source) {
      return action;
    }

    return {
      ...action,
      _source: {
        type: segment.type,
        content: segment.content,
        line: segment.lineNumber,
      },
    };
  });
}

/**
 * Validates that generated actions conform to schemas
 * @param {Array} actions - Array of action steps
 * @param {Object} schemas - Available schemas
 * @returns {{valid: Array, invalid: Array}} Valid and invalid actions
 */
function validateActions(steps, schemas) {
  if (!Array.isArray(steps)) {
    return { valid: [], invalid: [] };
  }

  const valid = [];
  const invalid = [];

  for (const step of steps) {
    const schemaKey = `step_v3`;
    const schema = schemas[schemaKey];
    const validationResult = validate({ schemaKey, object: step });

    // Create a wrapper object that matches the expected validation format
    const validationObject = {};

    if (validationResult.valid) {
      valid.push(step);
    } else {
      invalid.push({
        step,
        error: validationResult.errors,
      });
    }
  }

  return { valid, invalid };
}

module.exports = {
  addDefensiveActions,
  tagActionsWithSource,
  validateActions,
};
