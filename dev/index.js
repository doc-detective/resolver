const { detectTests, resolveTests, detectAndResolveTests } = require("../src");
const { validate, schemas } = require("doc-detective-common");
const { execCommand, spawnCommand } = require("../src/utils");
const path = require("path");

main();

async function main() {
  const json = {
    input: "/home/hawkeyexl/Workspaces/resolver/dev/dev.spec.json",
    logLevel: "debug",
  };
  result = await detectAndResolveTests({ config: json });
  console.log(JSON.stringify(result, null, 2));
  // Output the result to a file
  const outputPath = path.join(__dirname, "output.json");
  const fs = require("fs");
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Output written to ${outputPath}`);
}