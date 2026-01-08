const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("OpenAPI Module", function () {
  let openapi;
  let readFileStub;
  let parserStub;
  let replaceEnvsStub;

  beforeEach(function () {
    readFileStub = sinon.stub();
    parserStub = {
      dereference: sinon.stub(),
    };
    replaceEnvsStub = sinon.stub().callsFake((obj) => obj);

    openapi = proxyquire("./openapi", {
      "doc-detective-common": { readFile: readFileStub },
      "@apidevtools/json-schema-ref-parser": parserStub,
      "./utils": { replaceEnvs: replaceEnvsStub },
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("loadDescription", function () {
    it("should throw error when descriptionPath is not provided", async function () {
      try {
        await openapi.loadDescription();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal("Description is required.");
      }
    });

    it("should throw error when descriptionPath is empty string", async function () {
      try {
        await openapi.loadDescription("");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal("Description is required.");
      }
    });

    it("should load and dereference a description file", async function () {
      const mockDefinition = { openapi: "3.0.0", info: { title: "Test API" } };
      const mockDereferenced = { ...mockDefinition, dereferenced: true };

      readFileStub.resolves(mockDefinition);
      parserStub.dereference.resolves(mockDereferenced);

      const result = await openapi.loadDescription("/path/to/openapi.yaml");

      expect(readFileStub.calledOnceWith({ fileURLOrPath: "/path/to/openapi.yaml" })).to.be.true;
      expect(parserStub.dereference.calledOnceWith(mockDefinition)).to.be.true;
      expect(result).to.deep.equal(mockDereferenced);
    });

    it("should load description from URL", async function () {
      const mockDefinition = { openapi: "3.0.0" };
      const mockDereferenced = { ...mockDefinition };

      readFileStub.resolves(mockDefinition);
      parserStub.dereference.resolves(mockDereferenced);

      const result = await openapi.loadDescription("https://example.com/api.yaml");

      expect(readFileStub.calledOnceWith({ fileURLOrPath: "https://example.com/api.yaml" })).to.be.true;
      expect(result).to.deep.equal(mockDereferenced);
    });
  });

  describe("getOperation", function () {
    const mockDefinition = {
      openapi: "3.0.0",
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/users": {
          get: {
            operationId: "getUsers",
            parameters: [],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "array" },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createUser",
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object" },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
        "/users/{id}": {
          get: {
            operationId: "getUserById",
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
                example: "123",
              },
            ],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    };

    it("should throw error when definition is not provided", function () {
      try {
        openapi.getOperation(null, "getUsers");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal("OpenAPI definition is required.");
      }
    });

    it("should throw error when operationId is not provided", function () {
      try {
        openapi.getOperation(mockDefinition, "");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal("OperationId is required.");
      }
    });

    it("should return null when operationId is not found", function () {
      const result = openapi.getOperation(mockDefinition, "nonExistentOperation");
      expect(result).to.be.null;
    });

    it("should find and return operation by operationId", function () {
      const result = openapi.getOperation(mockDefinition, "getUsers");

      expect(result).to.not.be.null;
      expect(result.path).to.equal("/users");
      expect(result.method).to.equal("get");
      expect(result.definition.operationId).to.equal("getUsers");
    });

    it("should use server URL from definition when not provided", function () {
      const result = openapi.getOperation(mockDefinition, "getUsers");

      expect(result.example.url).to.equal("https://api.example.com/users");
    });

    it("should use provided server URL over definition servers", function () {
      const result = openapi.getOperation(
        mockDefinition,
        "getUsers",
        "",
        "",
        "https://custom.example.com"
      );

      expect(result.example.url).to.equal("https://custom.example.com/users");
    });

    it("should throw error when no server URL provided and none in definition", function () {
      const definitionWithoutServers = {
        ...mockDefinition,
        servers: undefined,
      };

      try {
        openapi.getOperation(definitionWithoutServers, "getUsers");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal(
          "No server URL provided and no servers defined in the OpenAPI definition."
        );
      }
    });

    it("should replace path parameters in URL", function () {
      const result = openapi.getOperation(mockDefinition, "getUserById");

      expect(result.example.url).to.equal("https://api.example.com/users/123");
    });

    it("should include schemas in result", function () {
      const result = openapi.getOperation(mockDefinition, "createUser");

      expect(result.schemas).to.have.property("request");
      expect(result.schemas).to.have.property("response");
      expect(result.schemas.request.type).to.equal("object");
    });

    it("should use specified response code", function () {
      const result = openapi.getOperation(mockDefinition, "createUser", "201");

      expect(result.schemas.response.type).to.equal("object");
    });
  });

  describe("getOperation with complex parameters", function () {
    const definitionWithParams = {
      openapi: "3.0.0",
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/search": {
          get: {
            operationId: "search",
            parameters: [
              {
                name: "q",
                in: "query",
                schema: { type: "string" },
                example: "test query",
              },
              {
                name: "limit",
                in: "query",
                schema: { type: "integer" },
                example: 10,
              },
              {
                name: "X-Api-Key",
                in: "header",
                schema: { type: "string" },
                example: "api-key-123",
              },
            ],
            responses: {
              "200": {
                headers: {
                  "X-Rate-Limit": {
                    schema: { type: "integer" },
                    example: 100,
                  },
                },
                content: {
                  "application/json": {
                    schema: { type: "object" },
                    example: { results: [] },
                  },
                },
              },
            },
          },
        },
      },
    };

    it("should extract query parameters into request.parameters", function () {
      const result = openapi.getOperation(definitionWithParams, "search");

      expect(result.example.request.parameters).to.have.property("q", "test query");
      expect(result.example.request.parameters).to.have.property("limit", 10);
    });

    it("should extract header parameters into request.headers", function () {
      const result = openapi.getOperation(definitionWithParams, "search");

      expect(result.example.request.headers).to.have.property("X-Api-Key", "api-key-123");
    });

    it("should extract response headers", function () {
      const result = openapi.getOperation(definitionWithParams, "search");

      expect(result.example.response.headers).to.have.property("X-Rate-Limit", 100);
    });

    it("should extract response body example", function () {
      const result = openapi.getOperation(definitionWithParams, "search");

      expect(result.example.response.body).to.deep.equal({ results: [] });
    });
  });

  describe("getOperation with examples", function () {
    const definitionWithExamples = {
      openapi: "3.0.0",
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/items": {
          post: {
            operationId: "createItem",
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object" },
                  examples: {
                    basic: {
                      value: { name: "Basic Item" },
                    },
                    advanced: {
                      value: { name: "Advanced Item", options: {} },
                    },
                  },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                    examples: {
                      basic: {
                        value: { id: 1, name: "Basic Item" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    it("should use named example when exampleKey is provided", function () {
      const result = openapi.getOperation(
        definitionWithExamples,
        "createItem",
        "201",
        "basic"
      );

      expect(result.example.request.body).to.deep.equal({ name: "Basic Item" });
      expect(result.example.response.body).to.deep.equal({ id: 1, name: "Basic Item" });
    });
  });

  describe("getOperation with nested schemas", function () {
    const definitionWithNestedSchema = {
      openapi: "3.0.0",
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/orders": {
          post: {
            operationId: "createOrder",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      customer: {
                        type: "object",
                        properties: {
                          name: { type: "string", example: "John Doe" },
                          email: { type: "string", example: "john@example.com" },
                        },
                      },
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            productId: { type: "string", example: "prod-123" },
                            quantity: { type: "integer", example: 2 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    };

    it("should generate examples from nested object schemas", function () {
      const result = openapi.getOperation(definitionWithNestedSchema, "createOrder");

      expect(result.example.request.body).to.have.property("customer");
      expect(result.example.request.body.customer).to.have.property("name", "John Doe");
      expect(result.example.request.body.customer).to.have.property("email", "john@example.com");
    });

    it("should generate examples from array schemas", function () {
      const result = openapi.getOperation(definitionWithNestedSchema, "createOrder");

      expect(result.example.request.body).to.have.property("items");
      expect(result.example.request.body.items).to.be.an("array");
      expect(result.example.request.body.items[0]).to.have.property("productId", "prod-123");
    });
  });

  describe("getOperation edge cases", function () {
    it("should handle definition with empty servers array", function () {
      const definitionEmptyServers = {
        openapi: "3.0.0",
        servers: [],
        paths: {
          "/test": {
            get: {
              operationId: "test",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      try {
        openapi.getOperation(definitionEmptyServers, "test");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error.message).to.equal(
          "No server URL provided and no servers defined in the OpenAPI definition."
        );
      }
    });

    it("should handle operation without parameters", function () {
      const definitionNoParams = {
        openapi: "3.0.0",
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/health": {
            get: {
              operationId: "healthCheck",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openapi.getOperation(definitionNoParams, "healthCheck");

      expect(result.example.request.parameters).to.deep.equal({});
      expect(result.example.request.headers).to.deep.equal({});
    });

    it("should handle operation without requestBody", function () {
      const definitionNoBody = {
        openapi: "3.0.0",
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/items": {
            get: {
              operationId: "getItems",
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openapi.getOperation(definitionNoBody, "getItems");

      expect(result.example.request.body).to.deep.equal({});
    });

    it("should throw when response has no content (current behavior)", function () {
      const definitionNoContent = {
        openapi: "3.0.0",
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/items/{id}": {
            delete: {
              operationId: "deleteItem",
              parameters: [
                { name: "id", in: "path", schema: { type: "string" }, example: "123" },
              ],
              responses: {
                "204": {
                  description: "No Content",
                },
              },
            },
          },
        },
      };

      // Current behavior: throws when response has no content
      // This documents a known limitation that could be fixed in the future
      try {
        openapi.getOperation(definitionNoContent, "deleteItem");
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError);
      }
    });
  });
});
