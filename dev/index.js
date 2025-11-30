const { detectTests, resolveTests, detectAndResolveTests } = require("../src");
const { analyze, dynamicAnalyze } = require("../src/analyzer/dynamic-analyzer");
const { getRunner } = require("../../doc-detective-core");
const { validate, schemas } = require("doc-detective-common");
const { execCommand, spawnCommand } = require("../src/utils");
const path = require("path");

//Load .env
require("dotenv").config();

main();

/**
 * Detects and resolves test cases in a specified markdown file using configured patterns and actions, then outputs the results to a JSON file.
 *
 * The function analyzes the input markdown file for test-related statements and code blocks according to the provided configuration, processes detected tests, and writes the structured results to "output.json" in the current directory.
 */
async function main() {
  const json = {
    input: "dev/doc-content.dita",
    logLevel: "debug",
    runOn: [
      {
        platforms: ["linux", "mac", "windows"],
        browsers: ["chrome", "firefox"],
      },
    ],
  };
  // result = await detectTests({ config: json });
  const documentation =
    "Sign in to Heretto CCMS with the credentials provided to you. In the left pane, in the Browse tab, click the Content folder. Click Create a new folder and add a new folder named Testing. In the Testing folder, create a personal testing folder. Follow this naming convention Surname_Name.";
  const DocDetectiveRunner = await getRunner({
    headless: false,
  });
  const result = await dynamicAnalyze({
    document: documentation,
    config: {
      provider: "anthropic",
      // baseUrl: "http://localhost:1234/v1",
      // model: "qwen3-vl:4b",
      apiKey: process.env.ANTHROPIC_API_KEY,
      userQueryThreshold: 0.7,
      maxRetries: 3,
    },
    DocDetectiveRunner: DocDetectiveRunner,
  });
  await DocDetectiveRunner.cleanup();

  console.log(JSON.stringify(result, null, 2));
  // Output the result to a file
  const outputPath = path.join(__dirname, "output.json");
  const fs = require("fs");
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Output written to ${outputPath}`);
}
