const { setConfig } = require("./config");
const { qualityFiles, parseTests, log } = require("./utils");
const { resolveDetectedTests } = require("./resolve");
// const { telemetryNotice, sendTelemetry } = require("./telem");

exports.detectTests = detectTests;
exports.resolveTests = resolveTests;
exports.detectAndResolveTests = detectAndResolveTests;

// const supportMessage = `
// ##########################################################################
// # Thanks for using Doc Detective! If this project was helpful to you,    #
// # please consider starring the repo on GitHub or sponsoring the project: #
// # - GitHub Sponsors: https://github.com/sponsors/doc-detective           #
// # - Open Collective: https://opencollective.com/doc-detective            #
// ##########################################################################`;

async function detectAndResolveTests({ config }) {
  // Set config
  config = await setConfig({ config });
  // Detect tests
  const detectedTests = await detectTests({ config });
  // Resolve tests
  const resolvedTests = await resolveTests({ config, detectedTests });
  return resolvedTests;
}

async function resolveTests({ config, detectedTests }) {
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

// Run tests defined in specifications and documentation source files.
async function detectTests({ config }) {
  if (!config.environment) {
    // If environment isn't set, config hasn't been resolved
    config = await setConfig({ config });
    log(config, "debug", `CONFIG:`);
    log(config, "debug", config);
  }
  // // Telemetry notice
  // telemetryNotice(config);

  // Set files
  const files = await qualityFiles({ config });
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
