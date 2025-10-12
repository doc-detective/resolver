const fs = require("fs");
const path = require("path");
const { convertWordToMarkdown } = require("./utils");
const { detectAndResolveTests } = require("./index");
const { setConfig } = require("./config");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Word format support", function () {
  it("should have convertWordToMarkdown function", function () {
    expect(convertWordToMarkdown).to.be.a("function");
  });

  it("should include word file type in default config", async function () {
    const config = await setConfig({ config: {} });
    
    // Check that word file type exists
    const wordFileType = config.fileTypes.find(ft => ft.name === "word");
    expect(wordFileType).to.exist;
    expect(wordFileType.extensions).to.include("docx");
    expect(wordFileType.extensions).to.include("doc");
  });

  it("should handle Word file extension in file qualification", async function () {
    const config = await setConfig({ config: {} });
    
    // Verify that .docx and .doc extensions are registered
    const docxFileType = config.fileTypes.find(ft => 
      ft.extensions.includes("docx")
    );
    const docFileType = config.fileTypes.find(ft => 
      ft.extensions.includes("doc")
    );
    
    expect(docxFileType).to.exist;
    expect(docFileType).to.exist;
  });

  it("should process sample Word document and detect tests", async function () {
    const sampleDocPath = path.join(__dirname, "../test/artifacts/sample-test.docx");
    
    // Check if sample doc exists
    if (!fs.existsSync(sampleDocPath)) {
      this.skip(); // Skip test if sample doc doesn't exist
      return;
    }

    const results = await detectAndResolveTests({
      config: {
        input: sampleDocPath,
        logLevel: "error"
      }
    });

    // Verify that specs were detected
    expect(results).to.exist;
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    
    const spec = results.specs[0];
    expect(spec.tests).to.be.an("array").that.has.lengthOf(1);
    
    const test = spec.tests[0];
    expect(test.contexts).to.be.an("array").that.has.lengthOf(1);
    
    const context = test.contexts[0];
    expect(context.steps).to.be.an("array").that.is.not.empty;
    
    // Verify some expected steps were detected
    const stepActions = context.steps.map(step => Object.keys(step)[0]);
    expect(stepActions).to.include("find");
    expect(stepActions).to.include("click");
  });

  it("should support inline test specifications in Word documents", async function () {
    const sampleDocPath = path.join(__dirname, "../test/artifacts/sample-with-inline-specs.docx");
    
    // Check if sample doc exists
    if (!fs.existsSync(sampleDocPath)) {
      this.skip(); // Skip test if sample doc doesn't exist
      return;
    }

    const results = await detectAndResolveTests({
      config: {
        input: sampleDocPath,
        logLevel: "error"
      }
    });

    // Verify that specs were detected
    expect(results).to.exist;
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    
    const spec = results.specs[0];
    expect(spec.tests).to.be.an("array");
    
    // Find the test with the explicit ID from the inline spec
    const testWithId = spec.tests.find(t => t.testId === "word-inline-test");
    expect(testWithId).to.exist;
    
    // Verify the inline step specification was parsed
    const context = testWithId.contexts[0];
    expect(context.steps).to.be.an("array");
    
    // Check that the goTo step from inline spec is present
    const goToStep = context.steps.find(step => step.goTo);
    expect(goToStep).to.exist;
    expect(goToStep.goTo).to.equal("https://example.com");
  });

  // Note: Creating an actual Word document for testing would require additional dependencies
  // like docx or officegen. For now, we verify the infrastructure is in place.
  // Integration tests with real Word files should be added when sample files are available.
});
