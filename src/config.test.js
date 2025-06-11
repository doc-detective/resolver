const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("setConfig", function () {
  let setConfig;
  let validStub, logStub, loadEnvsStub, replaceEnvsStub;
  let originalEnv;

  beforeEach(function () {
    // Save original environment
    originalEnv = process.env.DOC_DETECTIVE;
    
    // Create stubs
    validStub = sinon.stub().returns({ valid: true, object: {} });
    logStub = sinon.stub();
    loadEnvsStub = sinon.stub().resolves();
    replaceEnvsStub = sinon.stub().returnsArg(0);

    // Setup proxyquire
    setConfig = proxyquire("./config", {
      "doc-detective-common": { validate: validStub },
      "./utils": { log: logStub, loadEnvs: loadEnvsStub, replaceEnvs: replaceEnvsStub },
      "./openapi": { loadDescription: sinon.stub().resolves({}) }
    }).setConfig;
  });

  afterEach(function () {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.DOC_DETECTIVE = originalEnv;
    } else {
      delete process.env.DOC_DETECTIVE;
    }
    sinon.restore();
  });

  it("should process config normally without DOC_DETECTIVE environment variable", async function () {
    delete process.env.DOC_DETECTIVE;
    
    const inputConfig = { input: ["test.md"], logLevel: "info", fileTypes: [] };
    validStub.returns({ valid: true, object: inputConfig });
    
    const result = await setConfig({ config: inputConfig });
    
    expect(result).to.have.property("environment");
    expect(validStub.calledOnce).to.be.true;
  });

  it("should override config with DOC_DETECTIVE environment variable", async function () {
    const envConfig = { logLevel: "debug", recursive: true };
    process.env.DOC_DETECTIVE = JSON.stringify({ config: envConfig });
    
    const inputConfig = { input: ["test.md"], logLevel: "info", fileTypes: [] };
    const expectedMergedConfig = { ...inputConfig, ...envConfig };
    validStub.returns({ valid: true, object: expectedMergedConfig });
    
    await setConfig({ config: inputConfig });
    
    // Verify that the config was merged with environment overrides
    expect(validStub.calledOnce).to.be.true;
    const calledConfig = validStub.getCall(0).args[0].object;
    expect(calledConfig.logLevel).to.equal("debug");
    expect(calledConfig.recursive).to.equal(true);
    expect(calledConfig.input).to.deep.equal(["test.md"]);
  });

  it("should handle invalid JSON in DOC_DETECTIVE environment variable", async function () {
    process.env.DOC_DETECTIVE = "invalid json";
    
    const inputConfig = { input: ["test.md"], logLevel: "info", fileTypes: [] };
    validStub.returns({ valid: true, object: inputConfig });
    
    await setConfig({ config: inputConfig });
    
    // Should continue normally without applying overrides
    expect(validStub.calledOnce).to.be.true;
    expect(logStub.calledWith(sinon.match.any, "warn", sinon.match.string)).to.be.true;
  });

  it("should handle DOC_DETECTIVE environment variable without config property", async function () {
    process.env.DOC_DETECTIVE = JSON.stringify({ other: "data" });
    
    const inputConfig = { input: ["test.md"], logLevel: "info", fileTypes: [] };
    validStub.returns({ valid: true, object: inputConfig });
    
    await setConfig({ config: inputConfig });
    
    // Should continue normally without applying overrides
    expect(validStub.calledOnce).to.be.true;
  });

  it("should only override present config fields", async function () {
    const envConfig = { logLevel: "debug" }; // Only override logLevel
    process.env.DOC_DETECTIVE = JSON.stringify({ config: envConfig });
    
    const inputConfig = { input: ["test.md"], logLevel: "info", recursive: false, fileTypes: [] };
    const expectedMergedConfig = { 
      input: ["test.md"], 
      logLevel: "debug",  // overridden
      recursive: false,   // preserved
      fileTypes: [] 
    };
    validStub.returns({ valid: true, object: expectedMergedConfig });
    
    await setConfig({ config: inputConfig });
    
    const calledConfig = validStub.getCall(0).args[0].object;
    expect(calledConfig.logLevel).to.equal("debug"); // overridden
    expect(calledConfig.recursive).to.equal(false);  // preserved
    expect(calledConfig.input).to.deep.equal(["test.md"]); // preserved
  });

  it("should deep merge nested objects without losing properties", async function () {
    const envConfig = { 
      integrations: { 
        openApi: [{ name: "newApi", descriptionPath: "new.yaml" }] 
      } 
    };
    process.env.DOC_DETECTIVE = JSON.stringify({ config: envConfig });
    
    const inputConfig = { 
      input: ["test.md"], 
      logLevel: "info", 
      integrations: { 
        openApi: [{ name: "oldApi", descriptionPath: "old.yaml" }],
        database: { connectionString: "should-be-preserved" }
      },
      fileTypes: [] 
    };
    
    const expectedMergedConfig = { 
      input: ["test.md"], 
      logLevel: "info",
      integrations: { 
        openApi: [{ name: "newApi", descriptionPath: "new.yaml" }], // overridden
        database: { connectionString: "should-be-preserved" } // preserved
      },
      fileTypes: [] 
    };
    validStub.returns({ valid: true, object: expectedMergedConfig });
    
    await setConfig({ config: inputConfig });
    
    const calledConfig = validStub.getCall(0).args[0].object;
    expect(calledConfig.integrations.openApi).to.deep.equal([{ name: "newApi", descriptionPath: "new.yaml" }]);
    expect(calledConfig.integrations.database).to.deep.equal({ connectionString: "should-be-preserved" });
    expect(calledConfig.logLevel).to.equal("info"); // preserved
  });

  it("should handle deep merge when override creates new nested objects", async function () {
    const envConfig = { 
      newSection: {
        newProperty: "value",
        nested: { deep: "property" }
      }
    };
    process.env.DOC_DETECTIVE = JSON.stringify({ config: envConfig });
    
    const inputConfig = { 
      input: ["test.md"], 
      logLevel: "info",
      fileTypes: [] 
    };
    
    const expectedMergedConfig = { 
      input: ["test.md"], 
      logLevel: "info",
      newSection: {
        newProperty: "value",
        nested: { deep: "property" }
      },
      fileTypes: [] 
    };
    validStub.returns({ valid: true, object: expectedMergedConfig });
    
    await setConfig({ config: inputConfig });
    
    const calledConfig = validStub.getCall(0).args[0].object;
    expect(calledConfig.newSection).to.deep.equal({
      newProperty: "value",
      nested: { deep: "property" }
    });
    expect(calledConfig.logLevel).to.equal("info"); // preserved
  });

  it("should handle deep merge with multiple nested levels", async function () {
    const envConfig = { 
      level1: {
        level2: {
          level3: {
            overridden: "new_value"
          }
        }
      }
    };
    process.env.DOC_DETECTIVE = JSON.stringify({ config: envConfig });
    
    const inputConfig = { 
      input: ["test.md"], 
      level1: {
        level2: {
          level3: {
            overridden: "old_value",
            preserved: "should_stay"
          },
          otherProp: "also_preserved"
        }
      },
      fileTypes: [] 
    };
    
    const expectedMergedConfig = { 
      input: ["test.md"], 
      level1: {
        level2: {
          level3: {
            overridden: "new_value",
            preserved: "should_stay"
          },
          otherProp: "also_preserved"
        }
      },
      fileTypes: [] 
    };
    validStub.returns({ valid: true, object: expectedMergedConfig });
    
    await setConfig({ config: inputConfig });
    
    const calledConfig = validStub.getCall(0).args[0].object;
    expect(calledConfig.level1.level2.level3.overridden).to.equal("new_value");
    expect(calledConfig.level1.level2.level3.preserved).to.equal("should_stay");
    expect(calledConfig.level1.level2.otherProp).to.equal("also_preserved");
  });
});