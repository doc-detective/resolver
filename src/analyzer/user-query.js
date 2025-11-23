/**
 * User interaction utilities for dynamic analysis.
 * Prompts users for input when confidence is low or additional information is needed.
 */

const inquirer = require("inquirer");
const path = require("path");

/**
 * Interactive JSON editor that allows navigating and editing JSON objects.
 *
 * @param {Object} jsonObject - The JSON object to edit
 * @param {Array<string>} breadcrumb - Current path in the object (for display)
 * @returns {Promise<Object>} The edited JSON object
 */
async function editJsonInteractive(jsonObject, breadcrumb = []) {
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
      newValue = await editJsonInteractive(newValue, [...breadcrumb, keyName]);
    } else if (valueType === "array") {
      newValue = [];
      newValue = await editArrayInteractive(newValue, [...breadcrumb, keyName]);
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
          [...breadcrumb, keyName]
        );
      } else {
        jsonObject[keyName] = await editJsonInteractive(
          currentValue,
          [...breadcrumb, keyName]
        );
      }
    } else {
      // Edit primitive value
      const valueType = typeof currentValue;
      let newValue;

      if (valueType === "boolean") {
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
 * @returns {Promise<Array>} The edited array
 */
async function editArrayInteractive(arrayObject, breadcrumb = []) {
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
      ]);
    } else if (valueType === "array") {
      newValue = [];
      newValue = await editArrayInteractive(newValue, [
        ...breadcrumb,
        `[${arrayObject.length}]`,
      ]);
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
        ]);
      } else {
        arrayObject[index] = await editJsonInteractive(currentValue, [
          ...breadcrumb,
          `[${index}]`,
        ]);
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
 * @returns {Promise<Object>} Result object with action and potentially modified step
 * @returns {string} .action - 'continue', 'modify', 'skip', 'abort'
 * @returns {Object} .step - Modified step if action is 'continue' or 'modify'
 */
async function queryLowConfidenceStep(step, confidence, browserContext) {
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
    const editedStep = await editJsonInteractive(JSON.parse(JSON.stringify(step)), ["Step"]);
    
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
    const insertedStep = await queryInsertStep(browserContext);

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
      const insertedStep = await queryInsertStep(browserContext);

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
 * @returns {Promise<Object>} Result object with action and step
 * @returns {string} .action - 'continue', 'cancel', or 'abort'
 * @returns {Object} .step - The inserted step (if action is 'continue')
 */
async function queryInsertStep(browserContext) {
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
    stepObject = await editJsonInteractive({}, ["New Step"]);
  } else {
    const template = templates[templateChoice];
    stepObject = await editJsonInteractive(JSON.parse(JSON.stringify(template)), ["New Step"]);
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
      return queryInsertStep(browserContext);
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
};
