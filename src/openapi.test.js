const { expect } = require("chai");
const {
  isOpenApi3File,
  transformOpenApiToSpec,
  extractOperations,
  isOperationSafe,
  transformOperationToTest
} = require("./openapi");

describe("OpenAPI Utilities", () => {
  describe("isOpenApi3File", () => {
    it("should return true for valid OpenAPI 3.x files", () => {
      const validOpenApi = {
        openapi: "3.0.0",
        info: {
          title: "Test API",
          version: "1.0.0"
        },
        paths: {}
      };
      
      expect(isOpenApi3File(validOpenApi, "test.json")).to.be.true;
      expect(isOpenApi3File(validOpenApi, "test.yaml")).to.be.true;
      expect(isOpenApi3File(validOpenApi, "test.yml")).to.be.true;
    });
    
    it("should return false for invalid OpenAPI files", () => {
      const invalidOpenApi = {
        swagger: "2.0",
        info: {
          title: "Test API",
          version: "1.0.0"
        },
        paths: {}
      };
      
      expect(isOpenApi3File(invalidOpenApi, "test.json")).to.be.false;
      expect(isOpenApi3File(null, "test.json")).to.be.false;
      expect(isOpenApi3File({}, "test.json")).to.be.false;
      expect(isOpenApi3File(validOpenApi, "test.txt")).to.be.false;
    });
  });
  
  describe("extractOperations", () => {
    it("should extract operations from OpenAPI document", () => {
      const openApiDoc = {
        openapi: "3.0.0",
        info: {
          title: "Test API",
          version: "1.0.0"
        },
        paths: {
          "/users": {
            get: {
              operationId: "getUsers",
              summary: "Get Users"
            },
            post: {
              operationId: "createUser",
              summary: "Create User"
            }
          }
        }
      };
      
      const operations = extractOperations(openApiDoc);
      expect(operations).to.have.lengthOf(2);
      expect(operations[0].operationId).to.equal("getUsers");
      expect(operations[0].path).to.equal("/users");
      expect(operations[0].method).to.equal("get");
    });
    
    it("should merge x-doc-detective configurations", () => {
      const openApiDoc = {
        openapi: "3.0.0",
        "x-doc-detective": {
          safe: true,
          server: "https://api.example.com"
        },
        paths: {
          "/users": {
            get: {
              operationId: "getUsers",
              "x-doc-detective": {
                validateSchema: true
              }
            }
          }
        }
      };
      
      const operations = extractOperations(openApiDoc);
      expect(operations[0]["x-doc-detective"].safe).to.equal(true);
      expect(operations[0]["x-doc-detective"].server).to.equal("https://api.example.com");
      expect(operations[0]["x-doc-detective"].validateSchema).to.equal(true);
    });
  });
  
  describe("isOperationSafe", () => {
    it("should consider GET operations safe by default", () => {
      const operation = {
        method: "get"
      };
      expect(isOperationSafe(operation)).to.be.true;
    });
    
    it("should consider POST operations safe by default", () => {
      const operation = {
        method: "post"
      };
      expect(isOperationSafe(operation)).to.be.true;
    });
    
    it("should consider DELETE operations unsafe by default", () => {
      const operation = {
        method: "delete"
      };
      expect(isOperationSafe(operation)).to.be.false;
    });
    
    it("should consider operations with x-doc-detective safe regardless of method", () => {
      const safeDelete = {
        method: "delete",
        "x-doc-detective": {}
      };
      expect(isOperationSafe(safeDelete)).to.be.true;
    });
  });
  
  describe("transformOperationToTest", () => {
    it("should generate a proper test for safe operations", () => {
      const operation = {
        operationId: "getUsers",
        method: "get",
        path: "/users",
        summary: "Get Users"
      };
      
      const test = transformOperationToTest(operation, {}, {});
      expect(test).to.be.an("object");
      expect(test.id).to.equal("getUsers");
      expect(test.description).to.equal("Get Users");
      expect(test.steps).to.be.an("array").that.has.lengthOf(1);
      expect(test.steps[0].action).to.equal("httpRequest");
      expect(test.steps[0].openApi.operationId).to.equal("getUsers");
    });
    
    it("should return null for unsafe operations", () => {
      const operation = {
        operationId: "deleteUser",
        method: "delete",
        path: "/users/{id}"
      };
      
      const test = transformOperationToTest(operation, {}, {});
      expect(test).to.be.null;
    });
  });

  describe("transformOpenApiToSpec", () => {
    it("should transform OpenAPI document to Doc Detective test specification", () => {
      const openApiDoc = {
        openapi: "3.0.0",
        info: {
          title: "Test API",
          version: "1.0.0"
        },
        paths: {
          "/users": {
            get: {
              operationId: "getUsers",
              summary: "Get Users"
            },
            post: {
              operationId: "createUser",
              summary: "Create User"
            },
            delete: {
              operationId: "deleteUsers",
              summary: "Delete All Users"
            }
          }
        }
      };
      
      const spec = transformOpenApiToSpec(openApiDoc, "test.json", {});
      expect(spec).to.be.an("object");
      expect(spec.specId).to.include("openapi-test");
      expect(spec.tests).to.be.an("array");
      expect(spec.tests).to.have.lengthOf(3); // All operations with x-doc-detective are considered safe now
      expect(spec.openApi).to.be.an("array").that.has.lengthOf(1);
      expect(spec.openApi[0].definition).to.deep.equal(openApiDoc);
    });
  });
});

// Mock for global variable
const validOpenApi = {
  openapi: "3.0.0",
  info: {
    title: "Test API",
    version: "1.0.0"
  },
  paths: {}
};