import crypto from "crypto";
import type { ArazzoDescription, ArazzoWorkflowStep, DetectedTest, Step, OpenApiDefinition } from "./types";

/**
 * Doc Detective test specification created from Arazzo workflow
 */
interface ArazzoTestSpec extends DetectedTest {
  id: string;
  description?: string;
  steps: Step[];
  openApi: OpenApiDefinition[];
}

/**
 * Translates an Arazzo description into a Doc Detective test specification
 * @param arazzoDescription - The Arazzo description object
 * @param workflowId - The ID of the workflow to translate
 * @param _inputs - Optional inputs for the workflow (currently unused)
 * @returns The Doc Detective test specification object, or undefined if workflow not found
 */
export function workflowToTest(
  arazzoDescription: ArazzoDescription,
  workflowId: string,
  _inputs?: unknown
): ArazzoTestSpec | undefined {
  // Initialize the Doc Detective test specification
  const test: ArazzoTestSpec = {
    id: arazzoDescription.info.title || `${crypto.randomUUID()}`,
    description: arazzoDescription.info.description || arazzoDescription.info.summary,
    steps: [],
    openApi: [],
  };

  arazzoDescription.sourceDescriptions.forEach((source) => {
    // Translate OpenAPI definitions to Doc Detective format
    if (source.type === "openapi") {
      const openApiDefinition: OpenApiDefinition = {
        name: source.name,
        descriptionPath: source.url,
      };
      test.openApi.push(openApiDefinition);
    }
  });

  // Find workflow by ID
  const workflow = arazzoDescription.workflows.find(
    (w) => w.workflowId === workflowId
  );

  if (!workflow) {
    console.warn(`Workflow with ID ${workflowId} not found.`);
    return undefined;
  }

  // Translate each step in the workflow to a Doc Detective step
  workflow.steps.forEach((workflowStep: ArazzoWorkflowStep) => {
    const docDetectiveStep: Step = {
      action: "httpRequest",
    };

    if (workflowStep.operationId) {
      // Translate API operation steps
      docDetectiveStep.openApi = { operationId: workflowStep.operationId };
    } else if (workflowStep.operationPath) {
      // Handle operation path references (not yet supported in Doc Detective)
      console.warn(
        `Operation path references aren't yet supported in Doc Detective: ${workflowStep.operationPath}`
      );
      return;
    } else if (workflowStep.workflowId) {
      // Handle workflow references (not yet supported in Doc Detective)
      console.warn(
        `Workflow references aren't yet supported in Doc Detective: ${workflowStep.workflowId}`
      );
      return;
    } else {
      // Handle unsupported step types
      console.warn(`Unsupported step type: ${JSON.stringify(workflowStep)}`);
      return;
    }

    // Add parameters
    if (workflowStep.parameters) {
      docDetectiveStep.requestParams = {} as Record<string, unknown>;
      workflowStep.parameters.forEach((param) => {
        if (param.in === "query") {
          (docDetectiveStep.requestParams as Record<string, unknown>)[param.name] = param.value;
        } else if (param.in === "header") {
          if (!docDetectiveStep.requestHeaders) {
            docDetectiveStep.requestHeaders = {} as Record<string, unknown>;
          }
          (docDetectiveStep.requestHeaders as Record<string, unknown>)[param.name] = param.value;
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
      docDetectiveStep.responseData = {} as Record<string, unknown>;
      workflowStep.successCriteria.forEach((criterion) => {
        if (criterion.condition.startsWith("$statusCode")) {
          docDetectiveStep.statusCodes = [
            parseInt(criterion.condition.split("==")[1].trim()),
          ];
        } else if (criterion.context === "$response.body") {
          // This is a simplification; actual JSONPath translation would be more complex
          (docDetectiveStep.responseData as Record<string, unknown>)[criterion.condition] = true;
        }
      });
    }

    test.steps.push(docDetectiveStep);
  });

  return test;
}
