const { expect } = require("chai");
const sinon = require("sinon");
const path = require("path");
const { detectTests } = require("./index");

describe("OpenAPI YAML Integration Tests", () => {
  let sandbox;
  const yamlConfig = {
    input: path.resolve(__dirname, "../test/openapi-test-example.yaml"),
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

  it("should detect and parse OpenAPI YAML files", async () => {
    const result = await detectTests({ config: yamlConfig });
    
    // Check that the OpenAPI file was processed
    expect(result).to.be.an("array").that.has.lengthOf(1);
    
    // Verify the generated spec structure
    const spec = result[0];
    expect(spec.specId).to.include("openapi-openapi-test-example");
    expect(spec.openApi).to.be.an("array").that.has.lengthOf(1);
    expect(spec.openApi[0].name).to.equal("YAML Test API");
    expect(spec.tests).to.be.an("array");
    
    // We expect tests for all operations (GET /pets, POST /pets, GET /pets/{petId}, DELETE /pets/{petId})
    expect(spec.tests).to.have.lengthOf(4);
    
    // Verify each test has the expected format
    spec.tests.forEach(test => {
      expect(test.id).to.be.a("string");
      expect(test.description).to.be.a("string");
      expect(test.steps).to.be.an("array").that.has.lengthOf.at.least(1);
      
      // Each test should have an httpRequest step
      const httpStep = test.steps.find(step => step.action === "httpRequest");
      expect(httpStep).to.exist;
      expect(httpStep.action).to.equal("httpRequest");
      expect(httpStep.openApi).to.be.an("object");
    });
    
    // Find specific tests to verify
    const listPetsTest = spec.tests.find(t => t.id === "listPets");
    const createPetTest = spec.tests.find(t => t.id === "createPet");
    const getPetTest = spec.tests.find(t => t.id === "getPet");
    const deletePetTest = spec.tests.find(t => t.id === "deletePet");
    
    expect(listPetsTest).to.exist;
    expect(createPetTest).to.exist;
    expect(getPetTest).to.exist;
    expect(deletePetTest).to.exist;
    
    // Check root level x-doc-detective configuration is applied
    expect(listPetsTest.steps[0].openApi.server).to.equal("https://test-server.example.com");
    expect(listPetsTest.steps[0].openApi.validateSchema).to.equal(true);
    
    // Check operation-specific overrides work
    expect(createPetTest.steps.length).to.equal(2); // Main step + before steps
    expect(createPetTest.steps[1].openApi.validateSchema).to.equal(false); // Override from operation
    
    // Check for dependencies (before and after)
    expect(createPetTest.steps[0].openApi.operationId).to.equal("listPets");
    expect(deletePetTest.steps[1].openApi.operationId).to.equal("listPets");
  });
});