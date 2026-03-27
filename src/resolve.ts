import crypto from "crypto";
import type {
  Config,
  DetectedSpec,
  DetectedTest,
  ResolvedTests,
  ResolvedSpec,
  ResolvedTest,
  TestContext,
  RunOnContext,
  OpenApiDefinition,
  Step,
  BrowserConfig,
  LogLevel,
} from "./types";
import { loadDescription } from "./openapi";

// Type for log function
type LogFunction = (config: Config, level: LogLevel, message: unknown) => void;

// Forward declaration for log function - will be set during initialization
let log: LogFunction;

/**
 * Sets the log function from utils module
 * This is called during module initialization to avoid circular dependencies
 */
export function setLogFunction(fn: LogFunction): void {
  log = fn;
}

// Doc Detective actions that require a driver.
const driverActions: string[] = [
  "click",
  "dragAndDrop",
  "find",
  "goTo",
  "loadCookie",
  "record",
  "saveCookie",
  "screenshot",
  "stopRecord",
  "type",
];

/**
 * Checks if a test requires a browser driver.
 * @param test - The test to check
 * @returns True if the test requires a driver
 */
function isDriverRequired({ test }: { test: DetectedTest }): boolean {
  let driverRequired = false;
  test.steps.forEach((step) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
  });
  return driverRequired;
}

interface StaticContext {
  platform?: string;
  browser?: BrowserConfig;
}

/**
 * Resolves test contexts based on platforms and browser requirements.
 * @param contexts - Array of context configurations
 * @param test - The test to resolve contexts for
 * @param config - Doc Detective configuration
 * @returns Array of resolved contexts
 */
function resolveContexts({
  contexts,
  test,
  config,
}: {
  contexts: RunOnContext[];
  test: DetectedTest;
  config: Config;
}): TestContext[] {
  if (log) {
    log(config, "debug", `Determining required contexts for test: ${test.testId}`);
  }
  const resolvedContexts: TestContext[] = [];

  // Check if current test requires a browser
  let browserRequired = false;
  test.steps.forEach((step) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") browserRequired = true;
    });
  });

  // Standardize context format
  contexts.forEach((context) => {
    if (context.browsers) {
      if (
        typeof context.browsers === "string" ||
        (typeof context.browsers === "object" && !Array.isArray(context.browsers))
      ) {
        // If browsers is a string or an object, convert to array
        context.browsers = [context.browsers as BrowserConfig | string] as BrowserConfig[];
      }
      context.browsers = (context.browsers as (BrowserConfig | string)[]).map((browser) => {
        if (typeof browser === "string") {
          const browserName = browser === "safari" ? "webkit" : browser;
          return { name: browserName } as BrowserConfig;
        }
        if (browser.name === "safari") browser.name = "webkit" as BrowserConfig["name"];
        return browser as BrowserConfig;
      });
    }
    if (context.platforms) {
      if (typeof context.platforms === "string") {
        context.platforms = [context.platforms];
      }
    }
  });

  // Resolve to final contexts. Each context should include a single platform and at most a single browser.
  // If no browsers are required, filter down to platform-based contexts
  // If browsers are required, create contexts for each specified combination of platform and browser
  contexts.forEach((context) => {
    const staticContexts: StaticContext[] = [];
    const platforms = context.platforms || [];
    
    platforms.forEach((platform) => {
      if (!browserRequired) {
        const staticContext: StaticContext = { platform: platform as string };
        staticContexts.push(staticContext);
      } else {
        const browsers = context.browsers as BrowserConfig[] | undefined;
        if (browsers) {
          browsers.forEach((browser) => {
            const staticContext: StaticContext = { platform: platform as string, browser };
            staticContexts.push(staticContext);
          });
        }
      }
    });

    // For each static context, check if a matching object already exists in resolvedContexts. If not, push to resolvedContexts.
    staticContexts.forEach((staticContext) => {
      const existingContext = resolvedContexts.find((resolvedContext) => {
        return (
          resolvedContext.platform === staticContext.platform &&
          JSON.stringify(resolvedContext.browser) === JSON.stringify(staticContext.browser)
        );
      });
      if (!existingContext) {
        resolvedContexts.push(staticContext as TestContext);
      }
    });
  });

  // If no contexts are defined, use default contexts
  if (resolvedContexts.length === 0) {
    resolvedContexts.push({});
  }

  if (log) {
    log(config, "debug", `Resolved contexts for test ${test.testId}:\n${JSON.stringify(resolvedContexts, null, 2)}`);
  }
  return resolvedContexts;
}

/**
 * Fetches OpenAPI documents and merges with config-level definitions.
 * @param config - Doc Detective configuration
 * @param documentArray - Array of OpenAPI definitions to fetch
 * @returns Array of fetched OpenAPI definitions
 */
async function fetchOpenApiDocuments({
  config,
  documentArray,
}: {
  config: Config;
  documentArray?: OpenApiDefinition[];
}): Promise<OpenApiDefinition[]> {
  if (log) {
    log(config, "debug", `Fetching OpenAPI documents:\n${JSON.stringify(documentArray, null, 2)}`);
  }
  const openApiDocuments: OpenApiDefinition[] = [];
  
  if (config?.integrations?.openApi && config.integrations.openApi.length > 0) {
    openApiDocuments.push(...config.integrations.openApi);
  }
  
  if (documentArray && documentArray.length > 0) {
    for (const definition of documentArray) {
      try {
        if (definition.descriptionPath) {
          const openApiDefinition = await loadDescription(definition.descriptionPath);
          definition.definition = openApiDefinition;
        }
      } catch (error) {
        if (log) {
          log(
            config,
            "error",
            `Failed to load OpenAPI definition from ${definition.descriptionPath}: ${(error as Error).message}`
          );
        }
        continue; // Skip this definition
      }
      const existingDefinitionIndex = openApiDocuments.findIndex(
        (def) => def.name === definition.name
      );
      if (existingDefinitionIndex > -1) {
        openApiDocuments.splice(existingDefinitionIndex, 1);
      }
      openApiDocuments.push(definition);
    }
  }
  
  if (log) {
    log(config, "debug", `Fetched OpenAPI documents:\n${JSON.stringify(openApiDocuments, null, 2)}`);
  }
  return openApiDocuments;
}

/**
 * Resolves detected test specifications into execution-ready format.
 * @param config - Doc Detective configuration
 * @param detectedTests - Array of detected test specifications
 * @returns Resolved tests object
 */
export async function resolveDetectedTests({
  config,
  detectedTests,
}: {
  config: Config;
  detectedTests: DetectedSpec[];
}): Promise<ResolvedTests> {
  if (log) {
    log(config, "debug", `RESOLVING DETECTED TEST SPECS:\n${JSON.stringify(detectedTests, null, 2)}`);
  }
  
  // Set initial shorthand values
  const resolvedTests: ResolvedTests = {
    resolvedTestsId: crypto.randomUUID(),
    config: config,
    specs: [],
  };

  // Iterate specs
  if (log) {
    log(config, "info", "Resolving test specs.");
  }
  for (const spec of detectedTests) {
    const resolvedSpec = await resolveSpec({ config, spec });
    resolvedTests.specs.push(resolvedSpec);
  }

  if (log) {
    log(config, "debug", `RESOLVED TEST SPECS:\n${JSON.stringify(resolvedTests, null, 2)}`);
  }
  return resolvedTests;
}

/**
 * Resolves a single test specification.
 * @param config - Doc Detective configuration
 * @param spec - The spec to resolve
 * @returns Resolved specification
 */
async function resolveSpec({
  config,
  spec,
}: {
  config: Config;
  spec: DetectedSpec;
}): Promise<ResolvedSpec> {
  const specId = spec.specId || crypto.randomUUID();
  if (log) {
    log(config, "debug", `RESOLVING SPEC ID ${specId}:\n${JSON.stringify(spec, null, 2)}`);
  }
  
  const resolvedSpec: ResolvedSpec = {
    ...spec,
    specId: specId,
    runOn: spec.runOn || config.runOn || [],
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: spec.openApi,
    }),
    tests: [],
  };
  
  for (const test of spec.tests) {
    const resolvedTest = await resolveTest({
      config,
      spec: resolvedSpec,
      test,
    });
    resolvedSpec.tests.push(resolvedTest);
  }
  
  if (log) {
    log(config, "debug", `RESOLVED SPEC ${specId}:\n${JSON.stringify(resolvedSpec, null, 2)}`);
  }
  return resolvedSpec;
}

/**
 * Resolves a single test within a specification.
 * @param config - Doc Detective configuration
 * @param spec - The parent spec
 * @param test - The test to resolve
 * @returns Resolved test
 */
async function resolveTest({
  config,
  spec,
  test,
}: {
  config: Config;
  spec: ResolvedSpec;
  test: DetectedTest;
}): Promise<ResolvedTest> {
  const testId = test.testId || crypto.randomUUID();
  if (log) {
    log(config, "debug", `RESOLVING TEST ID ${testId}:\n${JSON.stringify(test, null, 2)}`);
  }
  
  const resolvedTest: ResolvedTest = {
    ...test,
    testId: testId,
    runOn: test.runOn || spec.runOn,
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: [...spec.openApi, ...(test.openApi || [])],
    }),
    contexts: [],
  };
  delete (resolvedTest as { steps?: Step[] }).steps;

  const testContexts = resolveContexts({
    test: test,
    contexts: resolvedTest.runOn,
    config: config,
  });

  for (const context of testContexts) {
    const resolvedContext = await resolveContext({
      config,
      test: test,
      context,
    });
    resolvedTest.contexts.push(resolvedContext);
  }
  
  if (log) {
    log(config, "debug", `RESOLVED TEST ${testId}:\n${JSON.stringify(resolvedTest, null, 2)}`);
  }
  return resolvedTest;
}

/**
 * Resolves a single context within a test.
 * @param config - Doc Detective configuration
 * @param test - The parent test
 * @param context - The context to resolve
 * @returns Resolved context
 */
async function resolveContext({
  config,
  test,
  context,
}: {
  config: Config;
  test: DetectedTest;
  context: TestContext;
}): Promise<TestContext> {
  const contextId = context.contextId || crypto.randomUUID();
  if (log) {
    log(config, "debug", `RESOLVING CONTEXT ID ${contextId}:\n${JSON.stringify(context, null, 2)}`);
  }
  
  const resolvedContext: TestContext = {
    ...context,
    unsafe: test.unsafe || false,
    openApi: test.openApi || [],
    steps: [...test.steps],
    contextId: contextId,
  };
  
  if (log) {
    log(config, "debug", `RESOLVED CONTEXT ${contextId}:\n${JSON.stringify(resolvedContext, null, 2)}`);
  }
  return resolvedContext;
}

export { resolveDetectedTests as default };
