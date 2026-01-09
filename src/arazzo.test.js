const sinon = require("sinon");
const { workflowToTest } = require("./arazzo");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Arazzo Module", function () {
  let consoleWarnStub;

  beforeEach(function () {
    consoleWarnStub = sinon.stub(console, "warn");
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("workflowToTest", function () {
    describe("basic translation", function () {
      const basicArazzoDescription = {
        info: {
          title: "Test API Workflow",
          description: "A test workflow description",
        },
        sourceDescriptions: [
          {
            name: "petstore",
            type: "openapi",
            url: "https://petstore.swagger.io/v3/openapi.json",
          },
        ],
        workflows: [
          {
            workflowId: "get-pets",
            steps: [
              {
                operationId: "getPets",
              },
            ],
          },
        ],
      };

      it("should create a test with correct id from title", function () {
        const result = workflowToTest(basicArazzoDescription, "get-pets");
        
        expect(result.id).to.equal("Test API Workflow");
      });

      it("should create a test with description from info", function () {
        const result = workflowToTest(basicArazzoDescription, "get-pets");
        
        expect(result.description).to.equal("A test workflow description");
      });

      it("should use summary when description is not available", function () {
        const descWithSummary = {
          ...basicArazzoDescription,
          info: {
            title: "Test",
            summary: "A summary",
          },
        };
        
        const result = workflowToTest(descWithSummary, "get-pets");
        
        expect(result.description).to.equal("A summary");
      });

      it("should translate OpenAPI source descriptions", function () {
        const result = workflowToTest(basicArazzoDescription, "get-pets");
        
        expect(result.openApi).to.have.lengthOf(1);
        expect(result.openApi[0].name).to.equal("petstore");
        expect(result.openApi[0].descriptionPath).to.equal(
          "https://petstore.swagger.io/v3/openapi.json"
        );
      });

      it("should skip non-OpenAPI source descriptions", function () {
        const descWithMixedSources = {
          ...basicArazzoDescription,
          sourceDescriptions: [
            { name: "api", type: "openapi", url: "https://api.example.com/openapi.json" },
            { name: "other", type: "arazzo", url: "https://example.com/arazzo.json" },
          ],
        };
        
        const result = workflowToTest(descWithMixedSources, "get-pets");
        
        expect(result.openApi).to.have.lengthOf(1);
        expect(result.openApi[0].name).to.equal("api");
      });
    });

    describe("workflow not found", function () {
      it("should return undefined and warn when workflow is not found", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [{ workflowId: "existing", steps: [] }],
        };
        
        const result = workflowToTest(desc, "non-existent");
        
        expect(result).to.be.undefined;
        expect(consoleWarnStub.calledOnce).to.be.true;
        expect(consoleWarnStub.firstCall.args[0]).to.include("non-existent");
      });
    });

    describe("step translation", function () {
      it("should translate operationId steps", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [{ operationId: "getUser" }],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps).to.have.lengthOf(1);
        expect(result.steps[0].action).to.equal("httpRequest");
        expect(result.steps[0].openApi.operationId).to.equal("getUser");
      });

      it("should warn and skip operationPath steps (unsupported)", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [{ operationPath: "/users/{id}" }],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps).to.have.lengthOf(0);
        expect(consoleWarnStub.calledOnce).to.be.true;
        expect(consoleWarnStub.firstCall.args[0]).to.include("Operation path references");
      });

      it("should warn and skip workflowId steps (unsupported)", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [{ workflowId: "nested-workflow" }],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps).to.have.lengthOf(0);
        expect(consoleWarnStub.calledOnce).to.be.true;
        expect(consoleWarnStub.firstCall.args[0]).to.include("Workflow references");
      });

      it("should warn and skip unsupported step types", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [{ unknownField: "value" }],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps).to.have.lengthOf(0);
        expect(consoleWarnStub.calledOnce).to.be.true;
        expect(consoleWarnStub.firstCall.args[0]).to.include("Unsupported step type");
      });
    });

    describe("parameter translation", function () {
      it("should translate query parameters", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "searchUsers",
                  parameters: [
                    { name: "q", in: "query", value: "test" },
                    { name: "limit", in: "query", value: 10 },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].requestParams).to.deep.equal({
          q: "test",
          limit: 10,
        });
      });

      it("should translate header parameters", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  parameters: [
                    { name: "Authorization", in: "header", value: "Bearer token" },
                    { name: "X-Custom", in: "header", value: "custom-value" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].requestHeaders).to.deep.equal({
          Authorization: "Bearer token",
          "X-Custom": "custom-value",
        });
      });

      it("should handle mixed query and header parameters", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  parameters: [
                    { name: "id", in: "query", value: "123" },
                    { name: "Authorization", in: "header", value: "Bearer token" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].requestParams).to.deep.equal({ id: "123" });
        expect(result.steps[0].requestHeaders).to.deep.equal({
          Authorization: "Bearer token",
        });
      });

      it("should ignore path parameters (not handled)", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  parameters: [
                    { name: "id", in: "path", value: "123" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        // Path parameters are not added to requestParams or requestHeaders
        expect(result.steps[0].requestParams).to.deep.equal({});
      });
    });

    describe("request body translation", function () {
      it("should translate request body", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "createUser",
                  requestBody: {
                    payload: { name: "John", email: "john@example.com" },
                  },
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].requestData).to.deep.equal({
          name: "John",
          email: "john@example.com",
        });
      });
    });

    describe("success criteria translation", function () {
      it("should translate status code criteria", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  successCriteria: [{ condition: "$statusCode == 200" }],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].statusCodes).to.deep.equal([200]);
      });

      it("should translate response body criteria", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  successCriteria: [
                    { context: "$response.body", condition: "$.name" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].responseData).to.have.property("$.name", true);
      });

      it("should handle multiple success criteria", function () {
        const desc = {
          info: { title: "Test" },
          sourceDescriptions: [],
          workflows: [
            {
              workflowId: "test-workflow",
              steps: [
                {
                  operationId: "getUser",
                  successCriteria: [
                    { condition: "$statusCode == 200" },
                    { context: "$response.body", condition: "$.id" },
                    { context: "$response.body", condition: "$.name" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "test-workflow");
        
        expect(result.steps[0].statusCodes).to.deep.equal([200]);
        expect(result.steps[0].responseData).to.have.property("$.id", true);
        expect(result.steps[0].responseData).to.have.property("$.name", true);
      });
    });

    describe("complete workflow translation", function () {
      it("should translate a complete workflow with multiple steps", function () {
        const desc = {
          info: {
            title: "User Management Workflow",
            description: "Create and retrieve users",
          },
          sourceDescriptions: [
            { name: "users-api", type: "openapi", url: "https://api.example.com/openapi.json" },
          ],
          workflows: [
            {
              workflowId: "user-crud",
              steps: [
                {
                  operationId: "createUser",
                  requestBody: {
                    payload: { name: "John", email: "john@example.com" },
                  },
                  successCriteria: [{ condition: "$statusCode == 201" }],
                },
                {
                  operationId: "getUser",
                  parameters: [{ name: "id", in: "query", value: "1" }],
                  successCriteria: [
                    { condition: "$statusCode == 200" },
                    { context: "$response.body", condition: "$.name" },
                  ],
                },
              ],
            },
          ],
        };
        
        const result = workflowToTest(desc, "user-crud");
        
        expect(result.id).to.equal("User Management Workflow");
        expect(result.description).to.equal("Create and retrieve users");
        expect(result.openApi).to.have.lengthOf(1);
        expect(result.steps).to.have.lengthOf(2);
        
        // First step
        expect(result.steps[0].openApi.operationId).to.equal("createUser");
        expect(result.steps[0].requestData).to.deep.equal({
          name: "John",
          email: "john@example.com",
        });
        expect(result.steps[0].statusCodes).to.deep.equal([201]);
        
        // Second step
        expect(result.steps[1].openApi.operationId).to.equal("getUser");
        expect(result.steps[1].requestParams).to.deep.equal({ id: "1" });
        expect(result.steps[1].statusCodes).to.deep.equal([200]);
      });
    });
  });
});
