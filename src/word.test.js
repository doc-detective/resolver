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

  // Note: Creating an actual Word document for testing would require additional dependencies
  // like docx or officegen. For now, we verify the infrastructure is in place.
  // Integration tests with real Word files should be added when sample files are available.
});
