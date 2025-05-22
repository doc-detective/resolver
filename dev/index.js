const { detectTests, resolveTests, detectAndResolveTests } = require("../src");
const { validate, schemas } = require("doc-detective-common");
const { execCommand, spawnCommand } = require("../src/utils");
const path = require("path");

main();

async function main() {
  const json = {
    input: "/home/hawkeyexl/Workspaces/resolver/dev/doc-content copy.md",
    fileTypes: [
      {
        name: "markdown",
        extensions: ["md", "markdown", "mdx"],
        inlineStatements: {
          testStart: [
            "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
            "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
            "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
          ],
          testEnd: [
            "{\\/\\*\\s*test end\\s*\\*\\/}",
            "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(test end\\)",
          ],
          ignoreStart: [
            "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
            "<!--\\s*test ignore start\\s*-->",
          ],
          ignoreEnd: [
            "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
            "<!--\\s*test ignore end\\s*-->",
          ],
          step: [
            "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
            "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
            "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
          ],
        },
        markup: [
          {
            name: "runPython",
            regex: ["```(?:python)\\b\\s*\\n(?<code>.*?)(?=\\n```)"],
            batchMatches: true,
            actions: [
              {
                runCode: {
                  language: "python",
                  code: "$1",
                },
              },
            ],
          },
        ],
      },
    ],
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
