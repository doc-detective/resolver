import { setConfig } from "./config";
import { qualifyFiles, parseTests, log } from "./utils";
import { resolveDetectedTests } from "./resolve";
import type { Config, DetectedSpec, ResolvedTests } from "./types";

// Re-export types for consumers
export type {
  Config,
  DetectedSpec,
  DetectedTest,
  ResolvedSpec,
  ResolvedTest,
  ResolvedTests,
  FileType,
  Step,
  OpenApiDefinition,
} from "./types";

// Re-export functions from other modules
export { setConfig, resolveConcurrentRunners } from "./config";
export { resolveDetectedTests } from "./resolve";
export { qualifyFiles, parseTests, log, loadEnvs, replaceEnvs } from "./utils";
export { loadDescription, getOperation } from "./openapi";
export { workflowToTest } from "./arazzo";
export { telemetryNotice, sendTelemetry } from "./telem";
export { sanitizeUri, sanitizePath } from "./sanitize";

// const supportMessage = `
// ##########################################################################
// # Thanks for using Doc Detective! If this project was helpful to you,    #
// # please consider starring the repo on GitHub or sponsoring the project: #
// # - GitHub Sponsors: https://github.com/sponsors/doc-detective           #
// # - Open Collective: https://opencollective.com/doc-detective            #
// ##########################################################################`;

/**
 * Detects and resolves tests based on the provided configuration.
 *
 * This function performs the following steps:
 * 1. Sets and validates the configuration
 * 2. Detects tests according to the configuration
 * 3. Resolves the detected tests
 *
 * @async
 * @param options - The options object
 * @param options.config - The configuration object for test detection and resolution
 * @returns A promise that resolves to an object of resolved tests, or null if no tests detected
 */
export async function detectAndResolveTests({
  config,
}: {
  config: Config;
}): Promise<ResolvedTests | null> {
  // Set config
  config = await setConfig({ config });
  // Detect tests
  const detectedTests = await detectTests({ config });
  if (!detectedTests || detectedTests.length === 0) {
    log(config, "warning", "No tests detected.");
    return null;
  }
  // Resolve tests
  const resolvedTests = await resolveTests({ config, detectedTests });
  return resolvedTests;
}

/**
 * Resolves test configurations by first ensuring the environment is set in the config,
 * then processing the detected tests to resolve them according to the configuration.
 *
 * @async
 * @param params - The parameters object.
 * @param params.config - The configuration object, which may need to be resolved if environment isn't set.
 * @param params.detectedTests - The tests that have been detected and need to be resolved.
 * @returns A promise that resolves to an object of resolved test configurations.
 */
export async function resolveTests({
  config,
  detectedTests,
}: {
  config: Config;
  detectedTests: DetectedSpec[];
}): Promise<ResolvedTests> {
  if (!config.environment) {
    // If environment isn't set, config hasn't been resolved
    config = await setConfig({ config });
    log(config, "debug", `CONFIG:`);
    log(config, "debug", config);
  }
  // Resolve detected tests
  const resolvedTests = await resolveDetectedTests({ config, detectedTests });
  return resolvedTests;
}

/**
 * Detects and processes test specifications based on provided configuration.
 *
 * This function performs the following steps:
 * 1. Resolves configuration if not already done
 * 2. Qualifies files based on configuration
 * 3. Parses test specifications from the qualified files
 *
 * @async
 * @param options - The options object
 * @param options.config - Configuration object, may be unresolved
 * @returns Promise resolving to an array of test specifications
 */
export async function detectTests({
  config,
}: {
  config: Config;
}): Promise<DetectedSpec[]> {
  if (!config.environment) {
    // If environment isn't set, config hasn't been resolved
    config = await setConfig({ config });
    log(config, "debug", `CONFIG:`);
    log(config, "debug", config);
  }
  // // Telemetry notice
  // telemetryNotice(config);

  // Set files
  const files = await qualifyFiles({ config });
  log(config, "debug", `FILES:`);
  log(config, "debug", files);

  // Set test specs
  const specs = await parseTests({ config, files });
  log(config, "debug", `SPECS:`);
  log(config, "info", specs);

  // Run test specs
  // const results = await runSpecs(config, specs);
  // log(config, "info", "RESULTS:");
  // log(config, "info", results);
  // log(config, "info", "Cleaning up and finishing post-processing.");

  // Send telemetry
  // sendTelemetry(config, "detect", results);
  // log(config, "info", supportMessage);

  return specs;
}
