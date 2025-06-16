const { setConfig } = require("./config");
const path = require("path");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Config tests", function () {
  // Test that config is resolved correctly
  it("Config is resolved correctly", async function () {
    const configSets = [
        // {
        //   config: { input: "input.spec.json" },
        //   expected: { input: ["input.spec.json"] },
        // },
        // {
        //   config: { input: ["input.spec.json", "input2.spec.json"] },
        //   expected: {
        //     input: [
        //       "input.spec.json",
        //       "input2.spec.json",
        //     ],
        //   },
        // },
        // {
        //   config: { input: ["input.spec.json", "input2.spec.json"], output: "." },
        //   expected: {
        //     input: [
        //       "input.spec.json",
        //       "input2.spec.json",
        //     ],
        //     output: ".",
        //   },
        // },
      {
        config: {
          fileTypes: [
            {
              extends: "markdown",
            },
          ],
        },
        expected: {
          fileTypes: [
            {
              name: "markdown",
            },
          ],
        },
      },
    ];

    for (const configSet of configSets) {
      // Set config with the configSet
      console.log(`Config test: ${JSON.stringify(configSet, null, 2)}`);
      const config = await setConfig({ config: configSet.config });
      expect(config).to.be.an("object");
      console.log(`Config result: ${JSON.stringify(config, null, 2)}\n`);
      // Deeply compare the config result with the expected result
      deepObjectExpect(config, configSet.expected);
    }
  });
});

describe("File type tests", function () {
  // Test that file types are resolved correctly
  it("File types resolve correctly", async function () {
    const customConfig = {
      fileTypes: [
        {
          name: "myMarkdown",
          extends: "markdown",
          extensions: ["md", "markdown", "mkd"], // "mkd" isn't a standard extension, but included for testing
          inlineStatements: {
            testStart: [".*?"],
            testEnd: ".*?",
          },
          markup: [
            {
              name: "runBash",
              regex: ["```(?:bash)\\b\\s*\\n(?<code>.*?)(?=\\n```)"],
              batchMatches: true,
              actions: [
                {
                  runCode: {
                    language: "bash",
                    code: "$1",
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    console.log(
      `Custom config: ${JSON.stringify(customConfig, null, 2)}`
    );
    const config = await setConfig({ config: customConfig });
    console.log(`Config result: ${JSON.stringify(config, null, 2)}\n`);
    // Check that the config has the expected structure
    expect(config).to.be.an("object");
    expect(config.fileTypes).to.be.an("array").that.is.not.empty;
    const markdownType = config.fileTypes.find(
      (type) => type.name === "myMarkdown"
    );
    expect(markdownType).to.exist;
    expect(markdownType).to.have.property("name").that.equals("myMarkdown");
    expect(markdownType)
      .to.have.property("extensions")
      .that.includes.members(["md", "markdown", "mkd"]);
    expect(markdownType).to.have.property("inlineStatements").that.has.property("testStart").that.includes.members([".*?"]);
    expect(markdownType).to.have.property("inlineStatements").that.has.property("testEnd").that.includes.members([".*?"]);
    expect(markdownType.markup).to.be.an("array").that.is.not.empty;
    const runBash = markdownType.markup.find(
      (markup) => markup.name === "runBash"
    );
    expect(runBash).to.be.an("object");
    expect(runBash).to.have.property("regex").that.is.an("array").that.is.not
      .empty;
    expect(runBash.regex[0]).to.equal(
      "```(?:bash)\\b\\s*\\n(?<code>.*?)(?=\\n```)"
    );
  });
});

// Deeply compares two objects
function deepObjectExpect(actual, expected) {
  // Check that actual has all the keys of expected
  Object.entries(expected).forEach(([key, value]) => {
    // Make sure the property exists in actual
    expect(actual).to.have.property(key);

    // If value is null, check directly
    if (value === null) {
      expect(actual[key]).to.equal(null);
    }
    // If value is an array, check each item
    else if (Array.isArray(value)) {
      expect(Array.isArray(actual[key])).to.equal(
        true,
        `Expected ${key} to be an array. Expected: ${expected[key]}. Actual: ${actual[key]}.`
      );
      expect(actual[key].length).to.equal(
        value.length,
        `Expected ${key} array to have length ${value.length}. Actual: ${actual[key].length}`
      );

      // Check each array item
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          deepObjectExpect(actual[key][index], item);
        } else {
          expect(actual[key][index]).to.equal(item);
        }
      });
    }
    // If value is an object but not null, recursively check it
    else if (typeof value === "object") {
      deepObjectExpect(actual[key], expected[key]);
    }
    // Otherwise, check that the value is correct
    else {
      const expectedObject = {};
      expectedObject[key] = value;
      expect(actual).to.deep.include(expectedObject);
    }
  });
}
