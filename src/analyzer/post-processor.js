/**
 * Post-processor module for enhancing and validating actions
 */

const { validate } = require('doc-detective-common');

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
  const significantActions = ['click', 'typeKeys', 'type'];
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const actionType = action.action;
    
    // Check if this is a significant action that needs a find before it
    if (significantActions.includes(actionType) && action.selector) {
      // Check if the previous action is already a find for the same selector
      const prevAction = enhanced[enhanced.length - 1];
      const hasPrecedingFind = prevAction && 
                               prevAction.action === 'find' && 
                               prevAction.selector === action.selector;
      
      if (!hasPrecedingFind) {
        // Add a defensive find action
        enhanced.push({
          action: 'find',
          selector: action.selector,
          description: `Verify element exists before ${actionType}`,
          _generated: true
        });
      }
    }
    
    enhanced.push(action);
    
    // Add verification after important submission actions
    if (actionType === 'click' && action.selector) {
      const selectorLower = action.selector.toLowerCase();
      const isSubmitAction = selectorLower.includes('submit') || 
                            selectorLower.includes('login') ||
                            selectorLower.includes('save') ||
                            selectorLower.includes('send');
      
      if (isSubmitAction) {
        // Look ahead to see if there's already a verification
        const nextAction = actions[i + 1];
        const hasVerification = nextAction && nextAction.action === 'find';
        
        if (!hasVerification) {
          enhanced.push({
            action: 'wait',
            duration: 2000,
            description: 'Wait for action to complete',
            _generated: true
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

  return actions.map(action => {
    // Don't override existing _source
    if (action._source) {
      return action;
    }
    
    return {
      ...action,
      _source: {
        type: segment.type,
        content: segment.content,
        line: segment.lineNumber
      }
    };
  });
}

/**
 * Validates that generated actions conform to schemas
 * @param {Array} actions - Array of action steps
 * @param {Object} schemas - Available schemas
 * @returns {{valid: Array, invalid: Array}} Valid and invalid actions
 */
function validateActions(actions, schemas) {
  if (!Array.isArray(actions)) {
    return { valid: [], invalid: [] };
  }

  const valid = [];
  const invalid = [];
  
  for (const action of actions) {
    if (!action || !action.action) {
      invalid.push({
        action,
        error: 'Missing action type'
      });
      continue;
    }
    
    const actionType = action.action;
    const schemaKey = `${actionType}_v3`;
    const schema = schemas[schemaKey];
    
    if (!schema) {
      // If no schema exists, try without version suffix
      const legacyKey = `${actionType}_v2`;
      if (schemas[legacyKey]) {
        valid.push(action);
        continue;
      }
      
      invalid.push({
        action,
        error: `No schema found for action type: ${actionType}`
      });
      continue;
    }
    
    // Create a wrapper object that matches the expected validation format
    const validationObject = {};
    validationObject[actionType] = action;
    
    const validationResult = validate({ schemaKey, object: validationObject });
    
    if (validationResult.valid) {
      valid.push(action);
    } else {
      invalid.push({
        action,
        error: validationResult.errors
      });
    }
  }
  
  return { valid, invalid };
}

module.exports = {
  addDefensiveActions,
  tagActionsWithSource,
  validateActions
};
