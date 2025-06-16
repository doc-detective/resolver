const { log } = require("./utils");
const uuid = require("uuid");
const { loadDescription } = require("./openapi");

exports.resolveDetectedTests = resolveDetectedTests;

// Doc Detective actions that require a driver.
const driverActions = [
  "click",
  "find",
  "goTo",
  "record",
  "screenshot",
  "stopRecord",
  "type",
];

function isDriverRequired({ test }) {
  let driverRequired = false;
  test.steps.forEach((step) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
  });
  return driverRequired;
}

function resolveContexts({ contexts, test, config }) {
  const resolvedContexts = [];

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
        (typeof context.browsers === "object" &&
          !Array.isArray(context.browsers))
      ) {
        // If browsers is a string or an object, convert to array
        context.browsers = [context.browsers];
      }
      context.browsers = context.browsers.map((browser) => {
        if (typeof browser === "string") {
          browser = { name: browser };
        }
        if (browser.name === "safari") browser.name = "webkit";
        return browser;
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
    const staticContexts = [];
    context.platforms.forEach((platform) => {
      if (!browserRequired) {
        const staticContext = { platform };
        staticContexts.push(staticContext);
      } else {
        context.browsers.forEach((browser) => {
          const staticContext = { platform, browser };
          staticContexts.push(staticContext);
        });
      }
    });
    // For each static context, check if a matching object already exists in resolvedContexts. If not, push to resolvedContexts.
    staticContexts.forEach((staticContext) => {
      const existingContext = resolvedContexts.find((resolvedContext) => {
        return (
          resolvedContext.platform === staticContext.platform &&
          JSON.stringify(resolvedContext.browser) ===
            JSON.stringify(staticContext.browser)
        );
      });
      if (!existingContext) {
        resolvedContexts.push(staticContext);
      }
    });
  });

  // If no contexts are defined, use default contexts
  if (resolvedContexts.length === 0) {
    resolvedContexts.push({});
  }

  return resolvedContexts;
}

async function fetchOpenApiDocuments({ config, documentArray }) {
  const openApiDocuments = [];
  if (config?.integrations?.openApi?.length > 0)
    openApiDocuments.push(...config.integrations.openApi);
  if (documentArray?.length > 0) {
    for (const definition of documentArray) {
      try {
        const openApiDefinition = await loadDescription(
          definition.descriptionPath
        );
        definition.definition = openApiDefinition;
      } catch (error) {
        log(
          config,
          "error",
          `Failed to load OpenAPI definition from ${definition.descriptionPath}: ${error.message}`
        );
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
  return openApiDocuments;
}

// Iterate through and resolve test specifications and contained tests.
async function resolveDetectedTests({ config, detectedTests }) {
  // Set initial shorthand values
  const resolvedTests = {
    config: config,
    specs: [],
  };

  // Iterate specs
  log(config, "info", "Resolving test specs.");
  for (const spec of detectedTests) {
    const resolvedSpec = await resolveSpec({ config, spec });
    resolvedTests.specs.push(resolvedSpec);
  }

  return resolvedTests;
}

async function resolveSpec({ config, spec }) {
  const specId = spec.specId || uuid.v4();
  log(config, "debug", `SPEC: ${specId}`);
  const resolvedSpec = {
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
  return resolvedSpec;
}

async function resolveTest({ config, spec, test }) {
  const testId = test.testId || uuid.v4();
  log(config, "debug", `TEST: ${testId}`);
  const resolvedTest = {
    ...test,
    testId: testId,
    runOn: test.runOn || spec.runOn,
    openApi: await fetchOpenApiDocuments({
      config,
      documentArray: [...spec.openApi, ...(test.openApi || [])],
    }),
    contexts: [],
  };
  delete resolvedTest.steps;

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

  return resolvedTest;
}

async function resolveContext({ config, test, context }) {
  const contextId = context.contextId || uuid.v4();
  log(config, "debug", `CONTEXT: ${contextId}`);
  const resolvedContext = {
    ...context,
    unsafe: test.unsafe || false,
    openApi: test.openApi || [],
    steps: [...test.steps],
    contextId: contextId,
  };
  return resolvedContext;
}
