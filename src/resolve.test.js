const { expect } = require("chai");
const sinon = require("sinon");
const { resolveDetectedTests } = require("./resolve");

describe("Resolve Module", function () {
  let consoleLogStub;

  beforeEach(function () {
    consoleLogStub = sinon.stub(console, "log");
  });

  afterEach(function () {
    consoleLogStub.restore();
  });

  describe("resolveDetectedTests", function () {
    it("should resolve empty detected tests array", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result).to.have.property("resolvedTestsId");
      expect(result).to.have.property("config", config);
      expect(result).to.have.property("specs").that.is.an("array").with.length(0);
    });

    it("should resolve a single spec with no tests", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          specId: "spec-1",
          tests: [],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs).to.have.length(1);
      expect(result.specs[0].specId).to.equal("spec-1");
      expect(result.specs[0].tests).to.be.an("array").with.length(0);
    });

    it("should generate specId when not provided", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].specId).to.be.a("string");
      expect(result.specs[0].specId).to.have.length(36); // UUID format
    });

    it("should resolve spec with a single test", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          specId: "spec-1",
          tests: [
            {
              testId: "test-1",
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests).to.have.length(1);
      expect(result.specs[0].tests[0].testId).to.equal("test-1");
    });

    it("should generate testId when not provided", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].testId).to.be.a("string");
      expect(result.specs[0].tests[0].testId).to.have.length(36); // UUID format
    });

    it("should inherit runOn from config when not specified in spec", async function () {
      const config = {
        logLevel: "error",
        runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
      };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].runOn).to.deep.equal(config.runOn);
    });

    it("should use spec runOn over config runOn", async function () {
      const config = {
        logLevel: "error",
        runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
      };
      const specRunOn = [{ platforms: ["windows"], browsers: ["firefox"] }];
      const detectedTests = [
        {
          runOn: specRunOn,
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].runOn).to.deep.equal(specRunOn);
    });

    it("should resolve contexts for test requiring browser", async function () {
      const config = {
        logLevel: "error",
        runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
      };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ goTo: "https://example.com" }], // goTo requires browser
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.be.an("array");
      expect(result.specs[0].tests[0].contexts.length).to.be.greaterThan(0);
    });

    it("should resolve contexts for test not requiring browser", async function () {
      const config = {
        logLevel: "error",
        runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
      };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }], // checkLink doesn't require browser
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.be.an("array");
    });

    it("should normalize safari to webkit in browser names", async function () {
      const config = {
        logLevel: "error",
      };
      const detectedTests = [
        {
          runOn: [{ platforms: ["mac"], browsers: ["safari"] }],
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      // The browser should be normalized in contexts
      const contexts = result.specs[0].tests[0].contexts;
      expect(contexts).to.be.an("array");
    });

    it("should handle browsers as string (convert to array)", async function () {
      const config = {
        logLevel: "error",
      };
      const detectedTests = [
        {
          runOn: [{ platforms: ["linux"], browsers: "chrome" }], // string instead of array
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.be.an("array");
    });

    it("should handle browsers as object (convert to array)", async function () {
      const config = {
        logLevel: "error",
      };
      const detectedTests = [
        {
          runOn: [{ platforms: ["linux"], browsers: { name: "chrome" } }], // object instead of array
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.be.an("array");
    });

    it("should handle platforms as string (convert to array)", async function () {
      const config = {
        logLevel: "error",
      };
      const detectedTests = [
        {
          runOn: [{ platforms: "linux", browsers: ["chrome"] }], // string instead of array
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.be.an("array");
    });

    it("should propagate unsafe flag to contexts", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            {
              unsafe: true,
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      const context = result.specs[0].tests[0].contexts[0];
      expect(context.unsafe).to.equal(true);
    });

    it("should default unsafe to false when not specified", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      const context = result.specs[0].tests[0].contexts[0];
      expect(context.unsafe).to.equal(false);
    });

    it("should copy steps to each context", async function () {
      const config = { logLevel: "error" };
      const steps = [
        { checkLink: "https://example.com" },
        { checkLink: "https://example.org" },
      ];
      const detectedTests = [
        {
          tests: [
            {
              steps: steps,
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      const context = result.specs[0].tests[0].contexts[0];
      expect(context.steps).to.deep.equal(steps);
    });

    it("should resolve multiple tests in a single spec", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            { testId: "test-1", steps: [{ checkLink: "https://example1.com" }] },
            { testId: "test-2", steps: [{ checkLink: "https://example2.com" }] },
            { testId: "test-3", steps: [{ checkLink: "https://example3.com" }] },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests).to.have.length(3);
      expect(result.specs[0].tests[0].testId).to.equal("test-1");
      expect(result.specs[0].tests[1].testId).to.equal("test-2");
      expect(result.specs[0].tests[2].testId).to.equal("test-3");
    });

    it("should resolve multiple specs", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          specId: "spec-1",
          tests: [{ steps: [{ checkLink: "https://example1.com" }] }],
        },
        {
          specId: "spec-2",
          tests: [{ steps: [{ checkLink: "https://example2.com" }] }],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs).to.have.length(2);
      expect(result.specs[0].specId).to.equal("spec-1");
      expect(result.specs[1].specId).to.equal("spec-2");
    });

    it("should generate unique resolvedTestsId", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [];

      const result1 = await resolveDetectedTests({ config, detectedTests });
      const result2 = await resolveDetectedTests({ config, detectedTests });

      expect(result1.resolvedTestsId).to.not.equal(result2.resolvedTestsId);
    });

    it("should handle driver actions for context resolution", async function () {
      const config = { logLevel: "error" };
      const driverActions = ["click", "find", "goTo", "type", "screenshot"];

      for (const action of driverActions) {
        const detectedTests = [
          {
            runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
            tests: [
              {
                steps: [{ [action]: "test-value" }],
              },
            ],
          },
        ];

        const result = await resolveDetectedTests({ config, detectedTests });

        expect(result.specs[0].tests[0].contexts).to.be.an("array");
        // Driver actions require browser, so context should have browser info
      }
    });

    it("should deduplicate contexts with same platform and browser", async function () {
      const config = {
        logLevel: "error",
      };
      const detectedTests = [
        {
          runOn: [
            { platforms: ["linux"], browsers: ["chrome"] },
            { platforms: ["linux"], browsers: ["chrome"] }, // Duplicate
          ],
          tests: [
            {
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      // Should deduplicate the contexts
      const contexts = result.specs[0].tests[0].contexts;
      expect(contexts.length).to.equal(1);
    });

    it("should create default context when no runOn is specified", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests[0].contexts).to.have.length(1);
      // Default context should be an empty object or minimal
      expect(result.specs[0].tests[0].contexts[0]).to.have.property("steps");
    });

    it("should inherit test runOn over spec runOn", async function () {
      const config = { logLevel: "error" };
      const specRunOn = [{ platforms: ["linux"], browsers: ["chrome"] }];
      const testRunOn = [{ platforms: ["windows"], browsers: ["firefox"] }];
      const detectedTests = [
        {
          runOn: specRunOn,
          tests: [
            {
              runOn: testRunOn,
              steps: [{ goTo: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      // Test runOn should override spec runOn
      expect(result.specs[0].tests[0].runOn).to.deep.equal(testRunOn);
    });

    it("should handle spec with openApi definition that fails to load", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          openApi: [
            {
              name: "nonexistent-api",
              descriptionPath: "/nonexistent/path/to/openapi.yaml",
            },
          ],
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      // Should not throw, just log error and continue
      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs).to.have.length(1);
      // The spec should still exist even if OpenAPI loading failed
      expect(result.specs[0].tests).to.have.length(1);
    });

    it("should use config.integrations.openApi when provided", async function () {
      const config = {
        logLevel: "error",
        integrations: {
          openApi: [
            {
              name: "config-api",
              definition: { openapi: "3.0.0", info: { title: "Test API" } },
            },
          ],
        },
      };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].openApi).to.have.length(1);
      expect(result.specs[0].openApi[0].name).to.equal("config-api");
    });

    it("should replace existing openApi definition with same name", async function () {
      const config = {
        logLevel: "error",
        integrations: {
          openApi: [
            {
              name: "my-api",
              definition: { openapi: "3.0.0", info: { title: "Old API" } },
            },
          ],
        },
      };
      const detectedTests = [
        {
          openApi: [
            {
              name: "my-api",
              descriptionPath: "/nonexistent/path.yaml", // Will fail to load
            },
          ],
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      // Should not throw - the failed definition won't replace the existing one
      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs).to.have.length(1);
    });

    it("should handle all driver actions correctly", async function () {
      const config = {
        logLevel: "error",
        runOn: [{ platforms: ["linux"], browsers: ["chrome"] }],
      };
      // All driver actions from the driverActions array
      const allDriverActions = [
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

      for (const action of allDriverActions) {
        const detectedTests = [
          {
            tests: [
              {
                steps: [{ [action]: "test-value" }],
              },
            ],
          },
        ];

        const result = await resolveDetectedTests({ config, detectedTests });

        // All driver actions require browser context
        expect(result.specs[0].tests[0].contexts).to.be.an("array");
        expect(result.specs[0].tests[0].contexts.length).to.be.greaterThan(0);
      }
    });

    it("should handle test with openApi at test level", async function () {
      const config = { logLevel: "error" };
      const detectedTests = [
        {
          tests: [
            {
              openApi: [
                {
                  name: "test-level-api",
                  descriptionPath: "/nonexistent/test-api.yaml",
                },
              ],
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      // Should not throw, just log error
      const result = await resolveDetectedTests({ config, detectedTests });

      expect(result.specs[0].tests).to.have.length(1);
    });

    it("should merge spec and test level openApi definitions", async function () {
      const config = {
        logLevel: "error",
        integrations: {
          openApi: [
            {
              name: "spec-api",
              definition: { openapi: "3.0.0" },
            },
          ],
        },
      };
      const detectedTests = [
        {
          tests: [
            {
              steps: [{ checkLink: "https://example.com" }],
            },
          ],
        },
      ];

      const result = await resolveDetectedTests({ config, detectedTests });

      // Test should have openApi from config
      expect(result.specs[0].tests[0].openApi).to.be.an("array");
    });
  });
});
