const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { sanitizePath, sanitizeUri } = require("./sanitize");

describe("Sanitize Module", function () {
  describe("sanitizeUri", function () {
    it("should add https:// to URI without protocol", function () {
      const result = sanitizeUri("example.com");
      expect(result).to.equal("https://example.com");
    });

    it("should keep existing https:// protocol", function () {
      const result = sanitizeUri("https://example.com");
      expect(result).to.equal("https://example.com");
    });

    it("should keep existing http:// protocol", function () {
      const result = sanitizeUri("http://example.com");
      expect(result).to.equal("http://example.com");
    });

    it("should trim whitespace from URI", function () {
      const result = sanitizeUri("  example.com  ");
      expect(result).to.equal("https://example.com");
    });

    it("should handle URIs with paths", function () {
      const result = sanitizeUri("example.com/path/to/resource");
      expect(result).to.equal("https://example.com/path/to/resource");
    });

    it("should preserve query strings", function () {
      const result = sanitizeUri("example.com?foo=bar&baz=qux");
      expect(result).to.equal("https://example.com?foo=bar&baz=qux");
    });

    it("should handle file:// protocol", function () {
      const result = sanitizeUri("file:///path/to/file");
      expect(result).to.equal("file:///path/to/file");
    });
  });

  describe("sanitizePath", function () {
    let tempDir;
    let tempFile;

    beforeEach(function () {
      // Create a temporary directory and file for testing
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sanitize-test-"));
      tempFile = path.join(tempDir, "test-file.txt");
      fs.writeFileSync(tempFile, "test content");
    });

    afterEach(function () {
      // Clean up temporary files
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    });

    it("should return resolved path for existing file", function () {
      const result = sanitizePath(tempFile);
      expect(result).to.equal(path.resolve(tempFile));
    });

    it("should return resolved path for existing directory", function () {
      const result = sanitizePath(tempDir);
      expect(result).to.equal(path.resolve(tempDir));
    });

    it("should return null for non-existent path", function () {
      const result = sanitizePath("/nonexistent/path/to/file.txt");
      expect(result).to.be.null;
    });

    it("should resolve relative paths", function () {
      // Use the current test file as a reference (we know it exists)
      const result = sanitizePath("./src/sanitize.test.js");
      expect(result).to.equal(path.resolve("./src/sanitize.test.js"));
    });

    it("should return null for relative path that does not exist", function () {
      const result = sanitizePath("./nonexistent/path.txt");
      expect(result).to.be.null;
    });
  });
});
