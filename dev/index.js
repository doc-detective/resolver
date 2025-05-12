const { detectTests, resolveTests } = require("../src");
const { validate, schemas } = require("doc-detective-common");
const { execCommand, spawnCommand } = require("../src/utils");
const path = require("path");

main();

async function main() {
  const json = {
    input: "./dev/dev.spec.yaml",
    logLevel: "debug",
  };
  result = await detectTests({config: json});
  console.log(JSON.stringify(result, null, 2));
}