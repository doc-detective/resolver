/**
 * User interaction utilities for dynamic analysis.
 * Prompts users for input when confidence is low or additional information is needed.
 */

const inquirer = require("inquirer");
const path = require("path");

/**
 * Checks if a step object supports browser element selection.
 * Supports: click, type, find, screenshot, goTo (for finding elements on page)
 *
 * @param {Object} stepObject - The step object to check
 * @returns {boolean} True if the step supports element selection
 */
function supportsElementSelection(stepObject) {
  if (!stepObject || typeof stepObject !== 'object') return false;
  
  // Check for step action keys that support element selection
  const supportedActions = ['click', 'type', 'find', 'screenshot'];
  return supportedActions.some(action => action in stepObject);
}

/**
 * Applies selected element data to the appropriate fields in a step object.
 *
 * @param {Object} stepObject - The step object to modify
 * @param {Object} selectorInfo - Selector information from determineOptimalSelector
 * @returns {Object} Modified step object with populated fields
 */
function applyElementToStep(stepObject, selectorInfo) {
  const modified = { ...stepObject };
  
  // Handle different step types
  if (modified.click !== undefined) {
    if (selectorInfo.property === 'elementText') {
      modified.click = selectorInfo.value;
    } else if (typeof modified.click === 'object') {
      modified.click.selector = selectorInfo.value;
    } else {
      modified.click = { selector: selectorInfo.value };
    }
  } else if (modified.type !== undefined) {
    if (typeof modified.type === 'object') {
      if (selectorInfo.property === 'elementText') {
        modified.type.elementText = selectorInfo.value;
      } else {
        modified.type.selector = selectorInfo.value;
      }
    } else {
      // type is a string, convert to object
      modified.type = {
        keys: modified.type,
        [selectorInfo.property === 'elementText' ? 'elementText' : 'selector']: selectorInfo.value
      };
    }
  } else if (modified.find !== undefined) {
    if (selectorInfo.property === 'elementText') {
      modified.find = selectorInfo.value;
    } else if (typeof modified.find === 'object') {
      modified.find.selector = selectorInfo.value;
    } else {
      modified.find = { selector: selectorInfo.value };
    }
  } else if (modified.screenshot !== undefined) {
    if (typeof modified.screenshot === 'object') {
      if (selectorInfo.property === 'elementText') {
        modified.screenshot.elementText = selectorInfo.value;
      } else {
        modified.screenshot.selector = selectorInfo.value;
      }
    } else {
      // screenshot is a string (filename), add selector as property
      modified.screenshot = {
        path: modified.screenshot,
        [selectorInfo.property === 'elementText' ? 'elementText' : 'selector']: selectorInfo.value
      };
    }
  }
  
  return modified;
}

/**
 * Interactive JSON editor that allows navigating and editing JSON objects.
 *
 * @param {Object} jsonObject - The JSON object to edit
 * @param {Array<string>} breadcrumb - Current path in the object (for display)
 * @param {Object} driver - Optional WebDriver instance for browser element selection
 * @returns {Promise<Object>} The edited JSON object
 */
async function editJsonInteractive(jsonObject, breadcrumb = [], driver = null) {
  const currentPath = breadcrumb.length > 0 ? breadcrumb.join(" > ") : "Root";
  
  console.log("\n" + "─".repeat(80));
  console.log(`Editing: ${currentPath}`);
  console.log("─".repeat(80));
  console.log("Current value:");
  console.log(JSON.stringify(jsonObject, null, 2));
  console.log("");

  // If not an object, allow direct editing
  if (typeof jsonObject !== "object" || jsonObject === null) {
    const newValue = await queryUser(
      `Enter new value for ${currentPath}:`,
      { type: "input", defaultValue: String(jsonObject) }
    );
    return parseValue(newValue);
  }

  // If array, handle differently
  if (Array.isArray(jsonObject)) {
    return await editArrayInteractive(jsonObject, breadcrumb);
  }

  // Build choices for object navigation
  const choices = [];
  const keys = Object.keys(jsonObject);
  
  // Add step-level element selection option if this is a supported step and driver is available
  // Check if we're at step level (breadcrumb includes 'Step' or 'New Step')
  const isAtStepLevel = breadcrumb.length > 0 && breadcrumb.some(crumb => 
    crumb === 'Step' || crumb === 'New Step'
  );
  // Allow selection if driver available AND (step already supports it OR step is empty/new)
  const stepSupportsSelection = supportsElementSelection(jsonObject);
  const isEmptyOrNewStep = Object.keys(jsonObject).length === 0 || 
                           (Object.keys(jsonObject).length === 1 && 'description' in jsonObject);
  const canSelectElement = isAtStepLevel && driver && (stepSupportsSelection || isEmptyOrNewStep);
  
  // Debug logging
  if (isAtStepLevel) {
    console.log(`[DEBUG] At step level: true`);
    console.log(`[DEBUG] Driver available: ${!!driver}`);
    console.log(`[DEBUG] Step supports selection: ${stepSupportsSelection}`);
    console.log(`[DEBUG] Is empty/new step: ${isEmptyOrNewStep}`);
    console.log(`[DEBUG] Can select element: ${canSelectElement}`);
  }
  
  if (canSelectElement) {
    choices.push("🎯 Select target element in browser");
  }

  keys.forEach((key) => {
    const value = jsonObject[key];
    const valueType = Array.isArray(value)
      ? "array"
      : typeof value === "object" && value !== null
      ? "object"
      : typeof value;
    const preview =
      typeof value === "object"
        ? `{${valueType}}`
        : String(value).substring(0, 50);
    choices.push(`Edit "${key}": ${preview}`);
  });

  choices.push("➕ Add new key");
  choices.push("🗑️  Delete a key");
  if (breadcrumb.length > 0) {
    choices.push("⬅️  Go back");
  }
  choices.push("✅ Done editing");

  const action = await queryUser("What would you like to do?", {
    type: "list",
    choices,
  });

  if (action === "✅ Done editing") {
    return jsonObject;
  } else if (action === "⬅️  Go back") {
    return jsonObject;
  } else if (action === "🎯 Select target element in browser") {
    // Launch browser element picker
    const result = await selectElementInBrowser(driver);
    
    if (result.action === 'selected') {
      let modifiedStep;
      
      // If step is empty or only has description, ask what type of step to create
      const isEmptyStep = Object.keys(jsonObject).length === 0 || 
                         (Object.keys(jsonObject).length === 1 && 'description' in jsonObject);
      
      if (isEmptyStep) {
        const stepType = await queryUser("What type of step do you want to create?", {
          type: "list",
          choices: [
            "click - Click the element",
            "type - Type text into the element",
            "find - Find and verify the element exists",
            "screenshot - Take a screenshot of the element",
            "Cancel"
          ]
        });
        
        if (stepType === "Cancel") {
          return editJsonInteractive(jsonObject, breadcrumb, driver);
        }
        
        const action = stepType.split(" - ")[0];
        
        // Create appropriate step structure
        if (action === "click") {
          if (result.selector.property === 'elementText') {
            jsonObject.click = result.selector.value;
          } else {
            jsonObject.click = { selector: result.selector.value };
          }
        } else if (action === "type") {
          const keys = await queryUser("Enter the text to type:", {
            type: "input"
          });
          jsonObject.type = {
            keys: keys,
            [result.selector.property === 'elementText' ? 'elementText' : 'selector']: result.selector.value
          };
        } else if (action === "find") {
          if (result.selector.property === 'elementText') {
            jsonObject.find = result.selector.value;
          } else {
            jsonObject.find = { selector: result.selector.value };
          }
        } else if (action === "screenshot") {
          const filename = await queryUser("Enter the screenshot filename:", {
            type: "input",
            defaultValue: "screenshot.png"
          });
          jsonObject.screenshot = {
            path: filename,
            [result.selector.property === 'elementText' ? 'elementText' : 'selector']: result.selector.value
          };
        }
        
        modifiedStep = jsonObject;
      } else {
        // Apply the selected element to the existing step
        modifiedStep = applyElementToStep(jsonObject, result.selector);
        
        // Copy all properties from modified step
        Object.keys(modifiedStep).forEach(key => {
          jsonObject[key] = modifiedStep[key];
        });
      }
      
      console.log("\nUpdated step:");
      console.log(JSON.stringify(jsonObject, null, 2));
      
      const confirm = await queryUser("Use this updated step?", {
        type: "confirm",
        defaultValue: true,
      });
      
      if (!confirm) {
        // Revert changes if not confirmed
        if (!isEmptyStep) {
          // For existing steps, we already modified in place, would need to track original
          console.log("Changes kept. Continue editing to modify.");
        } else {
          // For new steps, clear what we added
          Object.keys(jsonObject).forEach(key => {
            if (key !== 'description') delete jsonObject[key];
          });
        }
      }
    }
    
    // Continue editing
    return editJsonInteractive(jsonObject, breadcrumb, driver);
  } else if (action === "➕ Add new key") {
    const keyName = await queryUser("Enter the key name:", { type: "input" });
    if (!keyName) {
      return editJsonInteractive(jsonObject, breadcrumb);
    }

    const valueType = await queryUser("Select the value type:", {
      type: "list",
      choices: ["string", "number", "boolean", "object", "array", "null"],
    });

    let newValue;
    if (valueType === "object") {
      newValue = {};
      newValue = await editJsonInteractive(newValue, [...breadcrumb, keyName], driver);
    } else if (valueType === "array") {
      newValue = [];
      newValue = await editArrayInteractive(newValue, [...breadcrumb, keyName], driver);
    } else if (valueType === "null") {
      newValue = null;
    } else if (valueType === "boolean") {
      const boolValue = await queryUser(`Enter value for "${keyName}":`, {
        type: "list",
        choices: ["true", "false"],
      });
      newValue = boolValue === "true";
    } else if (valueType === "number") {
      const numValue = await queryUser(`Enter value for "${keyName}":`, {
        type: "input",
      });
      newValue = parseFloat(numValue);
      if (isNaN(newValue)) {
        console.log("Invalid number, using 0");
        newValue = 0;
      }
    } else {
      // string
      newValue = await queryUser(`Enter value for "${keyName}":`, {
        type: "input",
      });
    }

    jsonObject[keyName] = newValue;
    return editJsonInteractive(jsonObject, breadcrumb);
  } else if (action === "🗑️  Delete a key") {
    if (keys.length === 0) {
      console.log("No keys to delete.");
      return editJsonInteractive(jsonObject, breadcrumb);
    }

    const keyToDelete = await queryUser("Select key to delete:", {
      type: "list",
      choices: [...keys, "Cancel"],
    });

    if (keyToDelete !== "Cancel") {
      delete jsonObject[keyToDelete];
      console.log(`Deleted key: ${keyToDelete}`);
    }
    return editJsonInteractive(jsonObject, breadcrumb);
  } else {
    // Edit a specific key
    const match = action.match(/^Edit "(.+?)":/);
    if (!match) {
      return editJsonInteractive(jsonObject, breadcrumb);
    }

    const keyName = match[1];
    const currentValue = jsonObject[keyName];

    // If it's an object or array, navigate into it
    if (typeof currentValue === "object" && currentValue !== null) {
      if (Array.isArray(currentValue)) {
        jsonObject[keyName] = await editArrayInteractive(
          currentValue,
          [...breadcrumb, keyName],
          driver
        );
      } else {
        jsonObject[keyName] = await editJsonInteractive(
          currentValue,
          [...breadcrumb, keyName],
          driver
        );
      }
    } else {
      // Edit primitive value
      const valueType = typeof currentValue;
      let newValue;

      // Special handling for selector and elementText fields
      if ((keyName === "selector" || keyName === "elementText") && driver) {
        newValue = await editSelectorWithBrowserPick(keyName, currentValue, driver);
      } else if (valueType === "boolean") {
        const boolValue = await queryUser(`Edit "${keyName}":`, {
          type: "list",
          choices: ["true", "false", "null"],
          defaultValue: String(currentValue),
        });
        newValue = boolValue === "null" ? null : boolValue === "true";
      } else if (valueType === "number") {
        const numValue = await queryUser(`Edit "${keyName}":`, {
          type: "input",
          defaultValue: String(currentValue),
        });
        if (numValue === "null") {
          newValue = null;
        } else {
          newValue = parseFloat(numValue);
          if (isNaN(newValue)) {
            console.log("Invalid number, keeping original value");
            newValue = currentValue;
          }
        }
      } else {
        // string or null
        newValue = await queryUser(`Edit "${keyName}":`, {
          type: "input",
          defaultValue: currentValue === null ? "null" : String(currentValue),
        });
        if (newValue === "null") {
          newValue = null;
        }
      }

      jsonObject[keyName] = newValue;
    }

    return editJsonInteractive(jsonObject, breadcrumb);
  }
}

/**
 * Interactive array editor.
 *
 * @param {Array} arrayObject - The array to edit
 * @param {Array<string>} breadcrumb - Current path in the object
 * @param {Object} driver - Optional WebDriver instance for browser element selection
 * @returns {Promise<Array>} The edited array
 */
async function editArrayInteractive(arrayObject, breadcrumb = [], driver = null) {
  const currentPath = breadcrumb.length > 0 ? breadcrumb.join(" > ") : "Root";
  
  console.log("\n" + "─".repeat(80));
  console.log(`Editing Array: ${currentPath}`);
  console.log("─".repeat(80));
  console.log("Current array:");
  console.log(JSON.stringify(arrayObject, null, 2));
  console.log("");

  const choices = [];

  arrayObject.forEach((item, index) => {
    const itemType = Array.isArray(item)
      ? "array"
      : typeof item === "object" && item !== null
      ? "object"
      : typeof item;
    const preview =
      typeof item === "object" ? `{${itemType}}` : String(item).substring(0, 50);
    choices.push(`Edit [${index}]: ${preview}`);
  });

  choices.push("➕ Add item");
  choices.push("🗑️  Delete item");
  if (breadcrumb.length > 0) {
    choices.push("⬅️  Go back");
  }
  choices.push("✅ Done editing");

  const action = await queryUser("What would you like to do?", {
    type: "list",
    choices,
  });

  if (action === "✅ Done editing") {
    return arrayObject;
  } else if (action === "⬅️  Go back") {
    return arrayObject;
  } else if (action === "➕ Add item") {
    const valueType = await queryUser("Select the item type:", {
      type: "list",
      choices: ["string", "number", "boolean", "object", "array", "null"],
    });

    let newValue;
    if (valueType === "object") {
      newValue = {};
      newValue = await editJsonInteractive(newValue, [
        ...breadcrumb,
        `[${arrayObject.length}]`,
      ], driver);
    } else if (valueType === "array") {
      newValue = [];
      newValue = await editArrayInteractive(newValue, [
        ...breadcrumb,
        `[${arrayObject.length}]`,
      ], driver);
    } else if (valueType === "null") {
      newValue = null;
    } else if (valueType === "boolean") {
      const boolValue = await queryUser("Enter value:", {
        type: "list",
        choices: ["true", "false"],
      });
      newValue = boolValue === "true";
    } else if (valueType === "number") {
      const numValue = await queryUser("Enter value:", { type: "input" });
      newValue = parseFloat(numValue);
      if (isNaN(newValue)) {
        console.log("Invalid number, using 0");
        newValue = 0;
      }
    } else {
      // string
      newValue = await queryUser("Enter value:", { type: "input" });
    }

    arrayObject.push(newValue);
    return editArrayInteractive(arrayObject, breadcrumb);
  } else if (action === "🗑️  Delete item") {
    if (arrayObject.length === 0) {
      console.log("Array is empty.");
      return editArrayInteractive(arrayObject, breadcrumb);
    }

    const indexChoices = arrayObject.map((item, index) => {
      const preview =
        typeof item === "object"
          ? JSON.stringify(item).substring(0, 40)
          : String(item).substring(0, 40);
      return `[${index}]: ${preview}`;
    });
    indexChoices.push("Cancel");

    const itemToDelete = await queryUser("Select item to delete:", {
      type: "list",
      choices: indexChoices,
    });

    if (itemToDelete !== "Cancel") {
      const match = itemToDelete.match(/^\[(\d+)\]:/);
      if (match) {
        const index = parseInt(match[1]);
        arrayObject.splice(index, 1);
        console.log(`Deleted item at index ${index}`);
      }
    }
    return editArrayInteractive(arrayObject, breadcrumb);
  } else {
    // Edit a specific index
    const match = action.match(/^Edit \[(\d+)\]:/);
    if (!match) {
      return editArrayInteractive(arrayObject, breadcrumb);
    }

    const index = parseInt(match[1]);
    const currentValue = arrayObject[index];

    // If it's an object or array, navigate into it
    if (typeof currentValue === "object" && currentValue !== null) {
      if (Array.isArray(currentValue)) {
        arrayObject[index] = await editArrayInteractive(currentValue, [
          ...breadcrumb,
          `[${index}]`,
        ], driver);
      } else {
        arrayObject[index] = await editJsonInteractive(currentValue, [
          ...breadcrumb,
          `[${index}]`,
        ], driver);
      }
    } else {
      // Edit primitive value
      const valueType = typeof currentValue;
      let newValue;

      if (valueType === "boolean") {
        const boolValue = await queryUser(`Edit [${index}]:`, {
          type: "list",
          choices: ["true", "false", "null"],
          defaultValue: String(currentValue),
        });
        newValue = boolValue === "null" ? null : boolValue === "true";
      } else if (valueType === "number") {
        const numValue = await queryUser(`Edit [${index}]:`, {
          type: "input",
          defaultValue: String(currentValue),
        });
        if (numValue === "null") {
          newValue = null;
        } else {
          newValue = parseFloat(numValue);
          if (isNaN(newValue)) {
            console.log("Invalid number, keeping original value");
            newValue = currentValue;
          }
        }
      } else {
        // string or null
        newValue = await queryUser(`Edit [${index}]:`, {
          type: "input",
          defaultValue: currentValue === null ? "null" : String(currentValue),
        });
        if (newValue === "null") {
          newValue = null;
        }
      }

      arrayObject[index] = newValue;
    }

    return editArrayInteractive(arrayObject, breadcrumb);
  }
}

/**
 * Parse a string value to its appropriate type.
 *
 * @param {string} value - String value to parse
 * @returns {*} Parsed value
 */
function parseValue(value) {
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (!isNaN(value) && value.trim() !== "") return parseFloat(value);
  return value;
}

/**
 * Determines the optimal selector for an element based on priority.
 * Priority: elementText > aria label > id > data-testid > unique attributes > CSS > XPath
 *
 * @param {Object} elementData - Data about the clicked element
 * @param {string} elementData.id - Element ID
 * @param {string} elementData.tagName - Element tag name
 * @param {string} elementData.text - Element text content (trimmed)
 * @param {string} elementData.ariaLabel - ARIA label attribute
 * @param {string} elementData.name - Name attribute
 * @param {string} elementData.type - Type attribute
 * @param {string} elementData.role - Role attribute
 * @param {string} elementData.dataTestId - data-testid attribute
 * @param {Array<string>} elementData.classes - Array of class names
 * @param {string} elementData.cssSelector - Unique CSS selector
 * @param {string} elementData.xpath - XPath selector
 * @param {number} elementData.matchCount - Number of elements matching this selector
 * @returns {Object} Selector information
 * @returns {string} .type - 'elementText', 'aria', 'id', 'data-testid', 'css', 'xpath'
 * @returns {string} .value - The selector value
 * @returns {string} .property - The property name to use ('elementText' or 'selector')
 * @returns {string} .display - Human-readable description
 */
function determineOptimalSelector(elementData) {
  // Priority 1: Element text (uses elementText property)
  if (elementData.text && elementData.text.length > 0 && elementData.text.length < 100) {
    return {
      type: 'elementText',
      value: elementData.text,
      property: 'elementText',
      display: `Text: "${elementData.text}"`
    };
  }

  // Priority 2: ARIA label (uses selector with aria/ prefix)
  if (elementData.ariaLabel) {
    return {
      type: 'aria',
      value: `aria/${elementData.ariaLabel}`,
      property: 'selector',
      display: `ARIA label: "${elementData.ariaLabel}"`
    };
  }

  // Priority 3: Element ID
  if (elementData.id) {
    return {
      type: 'id',
      value: `#${elementData.id}`,
      property: 'selector',
      display: `ID: #${elementData.id}`
    };
  }

  // Priority 4: data-testid
  if (elementData.dataTestId) {
    return {
      type: 'data-testid',
      value: `[data-testid="${elementData.dataTestId}"]`,
      property: 'selector',
      display: `data-testid: "${elementData.dataTestId}"`
    };
  }

  // Priority 5: Unique name attribute
  if (elementData.name && elementData.matchCount === 1) {
    return {
      type: 'css',
      value: `[name="${elementData.name}"]`,
      property: 'selector',
      display: `Name attribute: "${elementData.name}"`
    };
  }

  // Priority 6: CSS selector
  if (elementData.cssSelector) {
    return {
      type: 'css',
      value: elementData.cssSelector,
      property: 'selector',
      display: `CSS: ${elementData.cssSelector}`
    };
  }

  // Priority 7: XPath (last resort)
  if (elementData.xpath) {
    return {
      type: 'xpath',
      value: elementData.xpath,
      property: 'selector',
      display: `XPath: ${elementData.xpath}`
    };
  }

  // Fallback: use tag name
  return {
    type: 'css',
    value: elementData.tagName.toLowerCase(),
    property: 'selector',
    display: `Tag: ${elementData.tagName.toLowerCase()}`
  };
}

/**
 * Launches an interactive element picker in the browser.
 * Injects JavaScript that highlights elements on hover and captures clicks.
 *
 * @param {Object} driver - WebDriver instance
 * @returns {Promise<Object>} Selected element data and optimal selector
 * @returns {string} .action - 'selected' or 'cancelled'
 * @returns {Object} .elementData - Raw element data (if selected)
 * @returns {Object} .selector - Optimal selector info (if selected)
 */
async function selectElementInBrowser(driver) {
  console.log("\n" + "🎯".repeat(40));
  console.log("BROWSER ELEMENT PICKER");
  console.log("🎯".repeat(40));
  console.log("\nHover over elements to highlight them.");
  console.log("Click an element to select it.");
  console.log("Press ESC to cancel.\n");

  try {
    const result = await driver.execute(function() {
      return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'doc-detective-element-picker-overlay';
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.3);
          z-index: 999998;
          cursor: crosshair;
        `;

        // Create tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'doc-detective-tooltip';
        tooltip.style.cssText = `
          position: fixed;
          background: #333;
          color: #fff;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-family: monospace;
          z-index: 1000000;
          pointer-events: none;
          display: none;
          max-width: 400px;
          word-break: break-all;
        `;
        document.body.appendChild(tooltip);

        // Create highlight box
        const highlight = document.createElement('div');
        highlight.id = 'doc-detective-highlight';
        highlight.style.cssText = `
          position: absolute;
          border: 2px solid #00ff00;
          background: rgba(0, 255, 0, 0.1);
          z-index: 999999;
          pointer-events: none;
          display: none;
        `;
        document.body.appendChild(highlight);

        let lastElement = null;

        // Generate unique CSS selector
        function getCssSelector(el) {
          if (el.id) return '#' + el.id;
          
          let path = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
              selector += '#' + el.id;
              path.unshift(selector);
              break;
            } else {
              let sibling = el;
              let nth = 1;
              while (sibling.previousElementSibling) {
                sibling = sibling.previousElementSibling;
                if (sibling.nodeName.toLowerCase() === selector) nth++;
              }
              if (nth > 1) selector += ':nth-of-type(' + nth + ')';
              else if (el.className) {
                const classes = Array.from(el.classList).filter(c => 
                  c && !c.startsWith('doc-detective')
                ).join('.');
                if (classes) selector += '.' + classes;
              }
            }
            path.unshift(selector);
            el = el.parentNode;
          }
          return path.join(' > ');
        }

        // Generate XPath
        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          if (el === document.body) return '/html/body';
          
          let ix = 0;
          const siblings = el.parentNode ? el.parentNode.childNodes : [];
          for (let i = 0; i < siblings.length; i++) {
            const sibling = siblings[i];
            if (sibling === el) {
              const tagName = el.tagName.toLowerCase();
              return getXPath(el.parentNode) + '/' + tagName + '[' + (ix + 1) + ']';
            }
            if (sibling.nodeType === 1 && sibling.tagName === el.tagName) ix++;
          }
        }

        // Mouse move handler
        function onMouseMove(e) {
          const target = document.elementFromPoint(e.clientX, e.clientY);
          if (!target || target === overlay || target === tooltip || target === highlight) return;
          
          lastElement = target;
          
          // Update highlight
          const rect = target.getBoundingClientRect();
          highlight.style.display = 'block';
          highlight.style.top = (window.scrollY + rect.top) + 'px';
          highlight.style.left = (window.scrollX + rect.left) + 'px';
          highlight.style.width = rect.width + 'px';
          highlight.style.height = rect.height + 'px';
          
          // Update tooltip
          const text = target.textContent.trim().substring(0, 50);
          const selector = getCssSelector(target);
          tooltip.textContent = selector + (text ? ': ' + text : '');
          tooltip.style.display = 'block';
          tooltip.style.top = (e.clientY + 20) + 'px';
          tooltip.style.left = (e.clientX + 20) + 'px';
        }

        // Click handler
        function onClick(e) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          cleanup();
          
          if (!lastElement) {
            resolve({ action: 'cancelled' });
            return;
          }
          
          // Extract element data
          const text = lastElement.textContent.trim();
          const cssSelector = getCssSelector(lastElement);
          const xpath = getXPath(lastElement);
          
          // Count matches for this selector
          let matchCount = 1;
          try {
            matchCount = document.querySelectorAll(cssSelector).length;
          } catch (e) {
            matchCount = 1;
          }
          
          resolve({
            action: 'selected',
            elementData: {
              id: lastElement.id || null,
              tagName: lastElement.tagName,
              text: text,
              ariaLabel: lastElement.getAttribute('aria-label') || null,
              name: lastElement.getAttribute('name') || null,
              type: lastElement.getAttribute('type') || null,
              role: lastElement.getAttribute('role') || null,
              dataTestId: lastElement.getAttribute('data-testid') || null,
              classes: Array.from(lastElement.classList),
              cssSelector: cssSelector,
              xpath: xpath,
              matchCount: matchCount
            }
          });
        }

        // Keyboard handler
        function onKeyDown(e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
            resolve({ action: 'cancelled' });
          }
        }

        // Cleanup function
        function cleanup() {
          overlay.remove();
          tooltip.remove();
          highlight.remove();
          document.removeEventListener('mousemove', onMouseMove, true);
          document.removeEventListener('click', onClick, true);
          document.removeEventListener('keydown', onKeyDown, true);
        }

        // Attach listeners
        document.addEventListener('mousemove', onMouseMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKeyDown, true);
        
        // Add overlay to DOM
        document.body.appendChild(overlay);
      });
    });

    if (result.action === 'cancelled') {
      console.log("\nElement selection cancelled.\n");
      return { action: 'cancelled' };
    }

    // Determine optimal selector
    const selector = determineOptimalSelector(result.elementData);
    
    console.log("\n" + "─".repeat(80));
    console.log("SELECTED ELEMENT");
    console.log("─".repeat(80));
    console.log(`Tag: ${result.elementData.tagName}`);
    console.log(`Selector: ${selector.display}`);
    if (result.elementData.text) {
      console.log(`Text: "${result.elementData.text.substring(0, 100)}"`);
    }
    console.log("─".repeat(80) + "\n");

    return {
      action: 'selected',
      elementData: result.elementData,
      selector: selector
    };
  } catch (error) {
    console.error("Error during element selection:", error.message);
    return { action: 'error', error: error.message };
  }
}

/**
 * Helper function to offer browser element selection when editing selector or elementText fields.
 *
 * @param {string} keyName - The key being edited ('selector' or 'elementText')
 * @param {*} currentValue - Current value of the field
 * @param {Object} driver - WebDriver instance (optional)
 * @returns {Promise<*>} New value for the field
 */
async function editSelectorWithBrowserPick(keyName, currentValue, driver) {
  if (!driver) {
    // No driver available, just do regular string input
    const newValue = await queryUser(`Edit "${keyName}":`, {
      type: "input",
      defaultValue: currentValue === null ? "null" : String(currentValue),
    });
    return newValue === "null" ? null : newValue;
  }

  // Offer browser selection option
  const editChoice = await queryUser(`Edit "${keyName}":`, {
    type: "list",
    choices: [
      "Enter value manually",
      "🎯 Select element in browser",
      "Set to null"
    ],
    defaultValue: "Enter value manually"
  });

  if (editChoice === "Set to null") {
    return null;
  } else if (editChoice === "🎯 Select element in browser") {
    const result = await selectElementInBrowser(driver);
    
    if (result.action === 'cancelled' || result.action === 'error') {
      // User cancelled or error occurred, fall back to manual entry
      return editSelectorWithBrowserPick(keyName, currentValue, driver);
    }

    // Return the appropriate value based on the key name
    if (keyName === 'elementText' || result.selector.property === 'elementText') {
      return result.selector.type === 'elementText' ? result.selector.value : result.elementData.text || currentValue;
    } else {
      // For 'selector' key, return the selector value
      return result.selector.value;
    }
  } else {
    // Manual entry
    const newValue = await queryUser(`Enter value for "${keyName}":`, {
      type: "input",
      defaultValue: currentValue === null ? "null" : String(currentValue),
    });
    return newValue === "null" ? null : newValue;
  }
}

/**
 * Prompts the user with a question and optional choices.
 *
 * @param {string} message - Human-friendly message to display
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.choices - Array of choice strings (for list prompts)
 * @param {string} options.type - Prompt type: 'confirm', 'list', 'input' (default: 'confirm')
 * @param {boolean} options.showJson - Whether to show JSON representation of context
 * @param {Object} options.jsonContext - JSON object to display if showJson is true
 * @returns {Promise<string|boolean>} User's response
 */
async function queryUser(message, options = {}) {
  const {
    choices,
    type = "confirm",
    showJson = false,
    jsonContext = null,
    defaultValue = null,
  } = options;

  console.log("\n" + "=".repeat(80));
  console.log("USER INPUT REQUIRED");
  console.log("=".repeat(80));
  console.log(`\n${message}\n`);

  if (showJson && jsonContext) {
    console.log("\nContext (JSON):");
    console.log(JSON.stringify(jsonContext, null, 2));
    console.log("");
  }

  const promptConfig = {
    type,
    name: "response",
    message: "Your choice:",
  };

  if (type === "list" && choices) {
    promptConfig.choices = choices;
    if (defaultValue) {
      promptConfig.default = defaultValue;
    }
  } else if (type === "confirm") {
    promptConfig.message = message;
    promptConfig.default = defaultValue !== null ? defaultValue : true;
  } else if (type === "input") {
    if (defaultValue) {
      promptConfig.default = defaultValue;
    }
  }

  const answer = await inquirer.prompt([promptConfig]);
  return answer.response;
}

/**
 * Prompts user for low-confidence step decisions.
 *
 * @param {Object} step - The proposed step with low confidence
 * @param {number} confidence - Confidence score (0-1)
 * @param {Object} browserContext - Current browser context
 * @param {Object} driver - WebDriver instance
 * @returns {Promise<Object>} Result object with action and potentially modified step
 * @returns {string} .action - 'continue', 'modify', 'skip', 'abort'
 * @returns {Object} .step - Modified step if action is 'continue' or 'modify'
 */
async function queryLowConfidenceStep(step, confidence, browserContext, driver = null) {
  console.log("\n" + "⚠".repeat(40));
  console.log("Next step...");
  console.log("⚠".repeat(40));
  console.log(`\nConfidence: ${(confidence * 100).toFixed(1)}%`);
  console.log(`Proposed Step: ${JSON.stringify(step, null, 2)}\n`);

  const action = await queryUser(
    "Doc Detective interpreted this step. What would you like to do?",
    {
      type: "list",
      choices: [
        "Continue with this step",
        "Insert a step before this one",
        "Edit the JSON manually",
        "Show me the JSON and browser context",
        "Skip this step",
        "Abort the analysis",
      ],
    }
  );

  if (action === "Edit the JSON manually") {
    const editedStep = await editJsonInteractive(JSON.parse(JSON.stringify(step)), ["Step"], driver);
    
    console.log("\nEdited step:");
    console.log(JSON.stringify(editedStep, null, 2));

    const confirm = await queryUser("Use this edited step?", {
      type: "confirm",
      defaultValue: true,
    });

    if (confirm) {
      return { action: "continue", step: editedStep };
    } else {
      // Recursive call to let them try again
      return queryLowConfidenceStep(step, confidence, browserContext);
    }
  } else if (action === "Insert a step before this one") {
    const insertedStep = await queryInsertStep(browserContext, driver);

    if (insertedStep.action === "abort") {
      return { action: "abort" };
    } else if (insertedStep.action === "continue") {
      // Return special action to indicate insertion
      return {
        action: "insert_before",
        insertedStep: insertedStep.step,
        currentStep: step,
      };
    } else {
      // User cancelled, ask again what to do with current step
      return queryLowConfidenceStep(step, confidence, browserContext);
    }
  } else if (action === "Show me the JSON and browser context") {
    console.log("\nProposed Step (JSON):");
    console.log(JSON.stringify(step, null, 2));
    console.log("\nBrowser Context:");
    console.log(JSON.stringify(browserContext, null, 2));

    // Ask again after showing details
    const secondAction = await queryUser(
      "What would you like to do with this step?",
      {
        type: "list",
        choices: [
          "Continue with this step",
          "Insert a step before this one",
          "Edit the JSON manually",
          "Skip this step",
          "Abort the analysis",
        ],
      }
    );

    if (secondAction === "Continue with this step") {
      return { action: "continue", step };
    } else if (secondAction === "Insert a step before this one") {
      const insertedStep = await queryInsertStep(browserContext, driver);

      if (insertedStep.action === "abort") {
        return { action: "abort" };
      } else if (insertedStep.action === "continue") {
        return {
          action: "insert_before",
          insertedStep: insertedStep.step,
          currentStep: step,
        };
      } else {
        return queryLowConfidenceStep(step, confidence, browserContext);
      }
    } else if (secondAction === "Edit the JSON manually") {
      // Recursive call to handle editing
      return queryLowConfidenceStep(step, confidence, browserContext);
    } else if (secondAction === "Skip this step") {
      return { action: "skip" };
    } else {
      return { action: "abort" };
    }
  } else if (action === "Continue with this step") {
    return { action: "continue", step };
  } else if (action === "Skip this step") {
    return { action: "skip" };
  } else {
    return { action: "abort" };
  }
}

/**
 * Prompts user to insert a new step before the current one.
 * Provides common step templates or allows custom JSON input.
 *
 * @param {Object} browserContext - Current browser context for reference
 * @param {Object} driver - Optional WebDriver instance for browser element selection
 * @returns {Promise<Object>} Result object with action and step
 * @returns {string} .action - 'continue', 'cancel', or 'abort'
 * @returns {Object} .step - The inserted step (if action is 'continue')
 */
async function queryInsertStep(browserContext, driver = null) {
  console.log("\n" + "➕".repeat(40));
  console.log("INSERT STEP BEFORE CURRENT ONE");
  console.log("➕".repeat(40));
  console.log("\nCurrent browser context:");
  console.log(JSON.stringify(browserContext, null, 2));
  console.log("");

  // Common step templates
  const templates = {
    "Type text": {
      type: {
        selector: "",
        keys: "",
      },
    },
    "Click element": {
      click: {
        selector: "",
      },
    },
    "Navigate to URL": {
      goTo: "url",
    },
    "Wait for element": {
      wait: 1000,
    },
    "Find element": {
      find: {
        selector: "",
      },
    },
    "Load variables": {
      loadVariables: ".env",
    },
    "Enter custom JSON": null,
  };

  const templateChoice = await queryUser(
    "Select a step template or enter custom JSON:",
    {
      type: "list",
      choices: Object.keys(templates),
    }
  );

  let stepObject;
  
  if (templateChoice === "Enter custom JSON") {
    stepObject = await editJsonInteractive({}, ["New Step"], driver);
  } else {
    const template = templates[templateChoice];
    stepObject = await editJsonInteractive(JSON.parse(JSON.stringify(template)), ["New Step"], driver);
  }

  // Display and confirm the step
  console.log("\nFinal step:");
  console.log(JSON.stringify(stepObject, null, 2));

  const confirm = await queryUser("Use this step?", {
    type: "confirm",
    defaultValue: true,
  });

  if (confirm) {
    return { action: "continue", step: stepObject };
  } else {
    const retry = await queryUser("Try again?", {
      type: "confirm",
      defaultValue: true,
    });

    if (retry) {
      return queryInsertStep(browserContext, driver);
    } else {
      return { action: "cancel" };
    }
  }
}

/**
 * Prompts user for credential information and provides .env file instructions.
 *
 * @param {Array<string>} credentialNames - Array of credential names needed (e.g., ['username', 'password'])
 * @param {string} envFilePath - Path to .env file where credentials should be stored
 * @returns {Promise<Object>} Result object with placeholders and instructions
 * @returns {Object} .placeholders - Map of credential names to placeholder variables (e.g., {username: '$USERNAME'})
 * @returns {string} .envFilePath - Path to .env file
 * @returns {Array<string>} .envInstructions - Lines to add to .env file
 */
async function queryCredentials(credentialNames, envFilePath = ".env") {
  console.log("\n" + "🔐".repeat(40));
  console.log("CREDENTIALS REQUIRED");
  console.log("🔐".repeat(40));
  console.log(
    `\nThe documentation references credentials: ${credentialNames.join(", ")}`
  );
  console.log("\nTo handle these securely, the analyzer will:");
  console.log(
    "1. Use placeholder variables in the test (e.g., $USERNAME, $PASSWORD)"
  );
  console.log("2. Add a loadVariables step to load from your .env file");
  console.log("3. Provide instructions for populating your .env file\n");

  // Generate placeholder variables
  const placeholders = {};
  const envInstructions = [];

  credentialNames.forEach((name) => {
    const varName = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    placeholders[name] = `$${varName}`;
    envInstructions.push(`${varName}=your_${name}_here`);
  });

  console.log("Placeholders that will be used:");
  Object.entries(placeholders).forEach(([name, placeholder]) => {
    console.log(`  ${name} -> ${placeholder}`);
  });
  console.log("");

  const proceed = await queryUser(
    "Do you want to proceed with placeholder credentials?",
    { type: "confirm", defaultValue: true }
  );

  if (!proceed) {
    return { action: "abort" };
  }

  // Provide .env file instructions
  console.log("\n" + "-".repeat(80));
  console.log(`INSTRUCTIONS: Add these lines to your ${envFilePath} file:`);
  console.log("-".repeat(80));
  envInstructions.forEach((line) => {
    console.log(line);
  });
  console.log("-".repeat(80));
  console.log("\nReplace the placeholder values with your actual credentials.");
  console.log(
    "The .env file should be in your project root or test directory.\n"
  );

  return {
    action: "continue",
    placeholders,
    envFilePath: path.resolve(envFilePath),
    envInstructions,
  };
}

/**
 * Asks user whether to continue after a step failure.
 *
 * @param {Object} step - The failed step
 * @param {Object} result - The failure result
 * @param {number} retryCount - Number of retries already attempted
 * @param {number} maxRetries - Maximum retries allowed
 * @returns {Promise<string>} Action: 'retry', 'skip', 'abort'
 */
async function queryStepFailure(step, result, retryCount, maxRetries) {
  console.log("\n" + "❌".repeat(40));
  console.log("STEP EXECUTION FAILED");
  console.log("❌".repeat(40));
  console.log(`\nFailed Step: ${step.description || JSON.stringify(step)}`);
  console.log(
    `Failure Reason: ${
      result.description || result.resultDescription || "Unknown"
    }`
  );

  const action = await queryUser("What would you like to do?", {
    type: "list",
    choices: [
      "Retry with adjustments",
      "Insert a step before this one",
      "Skip this step and continue",
      "Abort the analysis",
    ],
  });

  if (action === "Retry with adjustments") {
    return "retry";
  } else if (action === "Insert a step before this one") {
    return "insert_before";
  } else if (action === "Skip this step and continue") {
    return "skip";
  } else {
    return "abort";
  }
}

/**
 * Prompts user to confirm or modify the initial URL for navigation.
 *
 * @param {string} suggestedUrl - URL suggested by the analyzer
 * @param {string} instruction - Original instruction text
 * @returns {Promise<Object>} Result with confirmed/modified URL
 * @returns {string} .action - 'continue' or 'abort'
 * @returns {string} .url - Confirmed or modified URL
 */
async function queryInitialUrl(suggestedUrl, instruction) {
  console.log("\n" + "🌐".repeat(40));
  console.log("INITIAL URL REQUIRED");
  console.log("🌐".repeat(40));
  console.log(`\nInstruction: "${instruction}"`);
  console.log(`Suggested URL: ${suggestedUrl || "none detected"}\n`);

  if (!suggestedUrl) {
    let url = await queryUser("Enter the starting URL for this test:", {
      type: "input",
    });
    // If url doesn't begin with http/https, add https://
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    return { action: "continue", url };
  }

  const useUrl = await queryUser(`Use suggested URL: ${suggestedUrl}?`, {
    type: "confirm",
    defaultValue: true,
  });

  if (useUrl) {
    return { action: "continue", url: suggestedUrl };
  }

  const url = await queryUser("Please enter the correct starting URL:", {
    type: "input",
    defaultValue: suggestedUrl,
  });

  return { action: "continue", url };
}

module.exports = {
  queryUser,
  queryLowConfidenceStep,
  queryInsertStep,
  queryCredentials,
  queryStepFailure,
  queryInitialUrl,
  selectElementInBrowser,
  determineOptimalSelector,
  editJsonInteractive,
  editArrayInteractive,
};
