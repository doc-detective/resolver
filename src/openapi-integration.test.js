const { expect } = require("chai");
const sinon = require("sinon");
const path = require("path");
const { detectTests } = require("./index");

describe("OpenAPI Integration Tests", () => {
  let sandbox;
  const minimalConfig = {
    input: path.resolve(__dirname, "../test/openapi-test-example.json"),
    environment: {
      platform: "test"
    },
    fileTypes: []
  };

  const configWithExtensions = {
    input: path.resolve(__dirname, "../test/openapi-test-with-extensions.json"),
    environment: {
      platform: "test"
    },
    fileTypes: []
  };

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(console, "log"); // Mute console logs for tests
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should detect and parse OpenAPI files", async () => {
    const result = await detectTests({ config: minimalConfig });
    
    // Check that the OpenAPI file was processed
    expect(result).to.be.an("array").that.has.lengthOf(1);
    
    // Verify the generated spec structure
    const spec = result[0];
    expect(spec.specId).to.include("openapi-openapi-test-example");
    expect(spec.openApi).to.be.an("array").that.has.lengthOf(1);
    expect(spec.openApi[0].name).to.equal("Test API");
    expect(spec.tests).to.be.an("array");
    
    // We expect 3 tests (GET /users, POST /users, GET /users/{userId}, PUT /users/{userId} with safe override)
    // DELETE is now included because it has an x-doc-detective extension
    expect(spec.tests).to.have.lengthOf(5);
    
    // Verify each test has the expected format
    spec.tests.forEach(test => {
      expect(test.id).to.be.a("string");
      expect(test.description).to.be.a("string");
      expect(test.steps).to.be.an("array").that.has.lengthOf.at.least(1);
      
      // Each test should have an httpRequest step
      const httpStep = test.steps[0];
      expect(httpStep.action).to.equal("httpRequest");
      expect(httpStep.openApi).to.be.an("object");
      expect(httpStep.openApi.operationId).to.be.a("string");
    });
    
    // Find specific tests to verify
    const getUsersTest = spec.tests.find(t => t.id === "getUsers");
    const createUserTest = spec.tests.find(t => t.id === "createUser");
    const getUserTest = spec.tests.find(t => t.id === "getUser");
    const updateUserTest = spec.tests.find(t => t.id === "updateUser");
    
    expect(getUsersTest).to.exist;
    expect(createUserTest).to.exist;
    expect(getUserTest).to.exist;
    expect(updateUserTest).to.exist;
  });

  it("should support x-doc-detective extensions", async () => {
    const result = await detectTests({ config: configWithExtensions });
    
    // Check that the OpenAPI file was processed
    expect(result).to.be.an("array").that.has.lengthOf(1);
    
    // Verify the generated spec structure
    const spec = result[0];
    expect(spec.specId).to.include("openapi-openapi-test-with-extensions");
    expect(spec.tests).to.be.an("array");
    
    // We expect 3 tests (getProducts, createProduct, deleteProduct with safe override)
    expect(spec.tests).to.have.lengthOf(3);
    
    // Find specific tests to verify
    const getProductsTest = spec.tests.find(t => t.id === "getProducts");
    const createProductTest = spec.tests.find(t => t.id === "createProduct");
    const deleteProductTest = spec.tests.find(t => t.id === "deleteProduct");
    
    expect(getProductsTest).to.exist;
    expect(createProductTest).to.exist;
    expect(deleteProductTest).to.exist;
    
    // Check that root extensions are applied
    expect(getProductsTest.steps[0].openApi.server).to.equal("https://testing.example.com/v1");
    expect(getProductsTest.steps[0].openApi.validateSchema).to.equal(true);
    
    // Check that operation level overrides work
    expect(createProductTest.steps[1].openApi.validateSchema).to.equal(false);
    
    // Check for dependencies (before and after)
    expect(createProductTest.steps).to.have.lengthOf(2);
    expect(createProductTest.steps[0].openApi.operationId).to.equal("getProducts");
    
    expect(deleteProductTest.steps).to.have.lengthOf(2);
    expect(deleteProductTest.steps[1].openApi.operationId).to.equal("getProducts");
  });
});