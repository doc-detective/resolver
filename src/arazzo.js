const crypto = require("crypto");
const { log } = require("./utils");

/**
 * Translates an Arazzo description into a Doc Detective test specification
 * @param {Object} arazzoDescription - The Arazzo description object
 * @param {string} workflowId - The ID of the workflow to translate
 * @param {Object} inputs - Input parameters for the workflow
 * @param {Object} [config] - Optional config object for logging
 * @returns {Object} - The Doc Detective test specification object
 */
function workflowToTest(arazzoDescription, workflowId, inputs, config) {
  // Initialize the Doc Detective test specification
  const test = {
    id: arazzoDescription.info.title || `${crypto.randomUUID()}`,
    description:
      arazzoDescription.info.description || arazzoDescription.info.summary,
    steps: [],
    openApi: [],
  };

  arazzoDescription.sourceDescriptions.forEach((source) => {
    // Translate OpenAPI definitions to Doc Detective format
    if (source.type === "openapi") {
      const openApiDefinition = {
        name: source.name,
        descriptionPath: source.url,
      };
      test.openApi.push(openApiDefinition);
    }
  });

  // Find workflow by ID
  const workflow = arazzoDescription.workflows.find(
    (workflow) => workflow.workflowId === workflowId
  );

  if (!workflow) {
    if (config) {
      log(config, "warning", `Workflow with ID ${workflowId} not found.`);
    } else {
      console.warn(`Workflow with ID ${workflowId} not found.`);
    }
    return;
  }

  // Translate each step in the workflow to a Doc Detective step
  workflow.steps.forEach((workflowStep) => {
    const docDetectiveStep = {
      action: "httpRequest",
    };

    if (workflowStep.operationId) {
      // Translate API operation steps
      docDetectiveStep.openApi = { operationId: workflowStep.operationId };
    } else if (workflowStep.operationPath) {
      // Handle operation path references (not yet supported in Doc Detective)
      const message = `Operation path references aren't yet supported in Doc Detective: ${workflowStep.operationPath}`;
      if (config) {
        log(config, "warning", message);
      } else {
        console.warn(message);
      }
      return;
    } else if (workflowStep.workflowId) {
      // Handle workflow references (not yet supported in Doc Detective)
      const message = `Workflow references aren't yet supported in Doc Detective: ${workflowStep.workflowId}`;
      if (config) {
        log(config, "warning", message);
      } else {
        console.warn(message);
      }
      return;
    } else {
      // Handle unsupported step types
      const message = `Unsupported step type: ${JSON.stringify(workflowStep)}`;
      if (config) {
        log(config, "warning", message);
      } else {
        console.warn(message);
      }
      return;
    }

    // Add parameters
    if (workflowStep.parameters) {
      docDetectiveStep.requestParams = {};
      workflowStep.parameters.forEach((param) => {
        if (param.in === "query") {
          docDetectiveStep.requestParams[param.name] = param.value;
        } else if (param.in === "header") {
          if (!docDetectiveStep.requestHeaders)
            docDetectiveStep.requestHeaders = {};
          docDetectiveStep.requestHeaders[param.name] = param.value;
        }
        // Note: path parameters would require modifying the URL, which is not handled in this simple translation
      });
    }

    // Add request body if present
    if (workflowStep.requestBody) {
      docDetectiveStep.requestData = workflowStep.requestBody.payload;
    }

    // Translate success criteria to response validation
    if (workflowStep.successCriteria) {
      docDetectiveStep.responseData = {};
      workflowStep.successCriteria.forEach((criterion) => {
        if (criterion.condition.startsWith("$statusCode")) {
          docDetectiveStep.statusCodes = [
            parseInt(criterion.condition.split("==")[1].trim()),
          ];
        } else if (criterion.context === "$response.body") {
          // This is a simplification; actual JSONPath translation would be more complex
          docDetectiveStep.responseData[criterion.condition] = true;
        }
      });
    }

    test.steps.push(docDetectiveStep);
  });

  return test;
}

module.exports = { workflowToTest };

