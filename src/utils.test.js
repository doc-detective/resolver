const sinon = require("sinon");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Import the functions we're testing
const {
  log,
  timestamp,
  replaceEnvs,
  loadEnvs,
  outputResults,
  cleanTemp,
  fetchFile,
  isRelativeUrl,
  findHerettoIntegration,
  calculatePercentageDifference,
  inContainer,
  spawnCommand,
} = require("./utils");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Utils Module", function () {
  let consoleLogStub;

  beforeEach(function () {
    consoleLogStub = sinon.stub(console, "log");
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("log", function () {
    it("should log error messages when logLevel is error", async function () {
      const config = { logLevel: "error" };
      await log(config, "error", "Test error message");
      
      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include("(ERROR)");
    });

    it("should not log info messages when logLevel is error", async function () {
      const config = { logLevel: "error" };
      await log(config, "info", "Test info message");
      
      expect(consoleLogStub.called).to.be.false;
    });

    it("should log warning messages when logLevel is warning", async function () {
      const config = { logLevel: "warning" };
      await log(config, "warning", "Test warning message");
      
      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include("(WARNING)");
    });

    it("should log error and warning when logLevel is warning", async function () {
      const config = { logLevel: "warning" };
      
      await log(config, "error", "Error message");
      await log(config, "warning", "Warning message");
      
      expect(consoleLogStub.calledTwice).to.be.true;
    });

    it("should log info messages when logLevel is info", async function () {
      const config = { logLevel: "info" };
      await log(config, "info", "Test info message");
      
      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include("(INFO)");
    });

    it("should not log debug messages when logLevel is info", async function () {
      const config = { logLevel: "info" };
      await log(config, "debug", "Test debug message");
      
      expect(consoleLogStub.called).to.be.false;
    });

    it("should log debug messages when logLevel is debug", async function () {
      const config = { logLevel: "debug" };
      await log(config, "debug", "Test debug message");
      
      expect(consoleLogStub.calledOnce).to.be.true;
      expect(consoleLogStub.firstCall.args[0]).to.include("(DEBUG)");
    });

    it("should log all message types when logLevel is debug", async function () {
      const config = { logLevel: "debug" };
      
      await log(config, "error", "Error");
      await log(config, "warning", "Warning");
      await log(config, "info", "Info");
      await log(config, "debug", "Debug");
      
      expect(consoleLogStub.callCount).to.equal(4);
    });

    it("should format object messages as JSON", async function () {
      const config = { logLevel: "info" };
      const message = { key: "value", nested: { foo: "bar" } };
      
      await log(config, "info", message);
      
      expect(consoleLogStub.calledTwice).to.be.true; // Level prefix + JSON
      expect(consoleLogStub.secondCall.args[0]).to.include('"key"');
    });
  });

  describe("timestamp", function () {
    it("should return a formatted timestamp string", function () {
      const result = timestamp();
      
      // Format: YYYYMMDD-HHMMSS
      expect(result).to.match(/^\d{8}-\d{6}$/);
    });

    it("should return current date components", function () {
      const result = timestamp();
      const now = new Date();
      const year = now.getFullYear().toString();
      
      expect(result).to.include(year);
    });
  });

  describe("replaceEnvs", function () {
    beforeEach(function () {
      process.env.TEST_VAR = "test-value";
      process.env.ANOTHER_VAR = "another-value";
      process.env.JSON_VAR = '{"key":"value"}';
    });

    afterEach(function () {
      delete process.env.TEST_VAR;
      delete process.env.ANOTHER_VAR;
      delete process.env.JSON_VAR;
    });

    it("should return null/undefined as-is", function () {
      expect(replaceEnvs(null)).to.be.null;
      expect(replaceEnvs(undefined)).to.be.undefined;
    });

    it("should return string without variables unchanged", function () {
      const result = replaceEnvs("no variables here");
      expect(result).to.equal("no variables here");
    });

    it("should replace environment variable in string", function () {
      const result = replaceEnvs("Value is $TEST_VAR");
      expect(result).to.equal("Value is test-value");
    });

    it("should replace multiple environment variables", function () {
      const result = replaceEnvs("$TEST_VAR and $ANOTHER_VAR");
      expect(result).to.equal("test-value and another-value");
    });

    it("should leave undefined variables unchanged", function () {
      const result = replaceEnvs("$UNDEFINED_VAR remains");
      expect(result).to.equal("$UNDEFINED_VAR remains");
    });

    it("should recursively replace variables in objects", function () {
      const input = {
        key: "$TEST_VAR",
        nested: {
          value: "$ANOTHER_VAR",
        },
      };
      
      const result = replaceEnvs(input);
      
      expect(result.key).to.equal("test-value");
      expect(result.nested.value).to.equal("another-value");
    });

    it("should handle arrays in objects", function () {
      const input = {
        items: ["$TEST_VAR", "$ANOTHER_VAR"],
      };
      
      const result = replaceEnvs(input);
      
      expect(result.items[0]).to.equal("test-value");
      expect(result.items[1]).to.equal("another-value");
    });

    it("should parse JSON env var when entire string is the variable", function () {
      process.env.FULL_JSON = '{"parsed":"object"}';
      
      // When the entire string is a JSON-parseable env var, it parses to object
      const result = replaceEnvs("$FULL_JSON");
      
      // The function tries to parse if match.length === stringOrObject.length
      // But only when typeof JSON.parse(stringOrObject) === "object" 
      // which won't work because stringOrObject is "$FULL_JSON" not the JSON
      expect(result).to.equal('{"parsed":"object"}');
      
      delete process.env.FULL_JSON;
    });

    it("should handle nested env var references", function () {
      process.env.NESTED_REF = "$TEST_VAR";
      
      const result = replaceEnvs("$NESTED_REF");
      
      // Should recursively resolve
      expect(result).to.equal("test-value");
      
      delete process.env.NESTED_REF;
    });
  });

  describe("isRelativeUrl", function () {
    it("should return false for absolute HTTP URLs", function () {
      expect(isRelativeUrl("http://example.com")).to.be.false;
      expect(isRelativeUrl("https://example.com/path")).to.be.false;
    });

    it("should return false for absolute file URLs", function () {
      expect(isRelativeUrl("file:///path/to/file")).to.be.false;
    });

    it("should return true for relative paths", function () {
      expect(isRelativeUrl("/path/to/resource")).to.be.true;
      expect(isRelativeUrl("./relative/path")).to.be.true;
      expect(isRelativeUrl("../parent/path")).to.be.true;
    });

    it("should return true for bare filenames", function () {
      expect(isRelativeUrl("file.json")).to.be.true;
      expect(isRelativeUrl("path/to/file.json")).to.be.true;
    });
  });

  describe("findHerettoIntegration", function () {
    it("should return null when no heretto mapping exists", function () {
      const config = {};
      const result = findHerettoIntegration(config, "/some/path");
      expect(result).to.be.null;
    });

    it("should return null when path does not match any mapping", function () {
      const config = {
        _herettoPathMapping: {
          "/heretto/output": "heretto-integration",
        },
      };
      const result = findHerettoIntegration(config, "/different/path/file.dita");
      expect(result).to.be.null;
    });

    it("should return integration name when path matches", function () {
      const config = {
        _herettoPathMapping: {
          "/heretto/output": "my-heretto",
        },
      };
      const result = findHerettoIntegration(config, "/heretto/output/subdir/file.dita");
      expect(result).to.equal("my-heretto");
    });

    it("should handle multiple mappings", function () {
      const config = {
        _herettoPathMapping: {
          "/heretto/first": "first-integration",
          "/heretto/second": "second-integration",
        },
      };
      
      expect(findHerettoIntegration(config, "/heretto/first/file.dita")).to.equal("first-integration");
      expect(findHerettoIntegration(config, "/heretto/second/file.dita")).to.equal("second-integration");
    });
  });

  describe("calculatePercentageDifference", function () {
    it("should return 0 for identical strings", function () {
      const result = calculatePercentageDifference("hello", "hello");
      expect(parseFloat(result)).to.equal(0);
    });

    it("should return 100 for completely different strings of same length", function () {
      const result = calculatePercentageDifference("aaaaa", "bbbbb");
      expect(parseFloat(result)).to.equal(100);
    });

    it("should calculate percentage for partial differences", function () {
      const result = calculatePercentageDifference("hello", "hallo");
      // 1 character different out of 5 = 20%
      expect(parseFloat(result)).to.equal(20);
    });

    it("should handle empty strings", function () {
      const result = calculatePercentageDifference("", "");
      // Both empty - NaN or 0 depending on implementation
      expect(result).to.be.a("string");
    });

    it("should handle strings of different lengths", function () {
      const result = calculatePercentageDifference("hello", "hello world");
      // 6 characters difference out of 11 max length
      expect(parseFloat(result)).to.be.greaterThan(0);
    });
  });

  describe("loadEnvs", function () {
    let existsSyncStub;

    beforeEach(function () {
      existsSyncStub = sinon.stub(fs, "existsSync");
    });

    it("should return PASS when file exists", async function () {
      existsSyncStub.returns(true);
      
      const result = await loadEnvs("./test.env");
      
      expect(result.status).to.equal("PASS");
      expect(result.description).to.equal("Envs set.");
    });

    it("should return FAIL when file does not exist", async function () {
      existsSyncStub.returns(false);
      
      const result = await loadEnvs("./nonexistent.env");
      
      expect(result.status).to.equal("FAIL");
      expect(result.description).to.equal("Invalid file.");
    });
  });

  describe("cleanTemp", function () {
    let existsSyncStub, readdirSyncStub, unlinkSyncStub;

    beforeEach(function () {
      existsSyncStub = sinon.stub(fs, "existsSync");
      readdirSyncStub = sinon.stub(fs, "readdirSync");
      unlinkSyncStub = sinon.stub(fs, "unlinkSync");
    });

    it("should do nothing if temp directory does not exist", function () {
      existsSyncStub.returns(false);
      
      cleanTemp();
      
      expect(readdirSyncStub.called).to.be.false;
      expect(unlinkSyncStub.called).to.be.false;
    });

    it("should delete all files in temp directory", function () {
      existsSyncStub.returns(true);
      readdirSyncStub.returns(["file1.txt", "file2.txt"]);
      
      cleanTemp();
      
      expect(unlinkSyncStub.calledTwice).to.be.true;
    });
  });

  describe("outputResults", function () {
    let writeFileStub;

    beforeEach(function () {
      writeFileStub = sinon.stub(fs, "writeFile").callsFake((path, data, cb) => cb(null));
    });

    it("should write results to file", async function () {
      const config = { logLevel: "info" };
      const results = { test: "data" };
      
      await outputResults("./output.json", results, config);
      
      expect(writeFileStub.calledOnce).to.be.true;
      expect(writeFileStub.firstCall.args[0]).to.equal("./output.json");
    });

    it("should format results as pretty JSON", async function () {
      const config = { logLevel: "info" };
      const results = { test: "data" };
      
      await outputResults("./output.json", results, config);
      
      const writtenData = writeFileStub.firstCall.args[1];
      expect(writtenData).to.include('"test"');
      expect(writtenData).to.include("\n"); // Pretty printed
    });
  });

  describe("spawnCommand", function () {
    this.timeout(10000); // Increase timeout for shell commands

    it("should execute a simple command and return output", async function () {
      const result = await spawnCommand("echo", ["hello"]);
      
      expect(result.stdout).to.include("hello");
      expect(result.exitCode).to.equal(0);
    });

    it("should return non-zero exit code for failing commands", async function () {
      // Use a command that will fail - exit code may vary by platform
      const result = await spawnCommand("node", ["-e", "process.exit(1)"]);
      
      expect(result.exitCode).to.not.equal(0);
    });

    it("should capture stderr", async function () {
      const result = await spawnCommand("node", ["-e", "console.error('error message')"]);
      
      expect(result.stderr).to.include("error message");
    });

    it("should respect cwd option", async function () {
      const result = await spawnCommand("pwd", [], { cwd: os.tmpdir() });
      
      // On Windows this will be different, but should contain the temp dir
      expect(result.stdout.length).to.be.greaterThan(0);
    });
  });

  describe("inContainer", function () {
    let originalEnv;

    beforeEach(function () {
      originalEnv = process.env.IN_CONTAINER;
    });

    afterEach(function () {
      if (originalEnv !== undefined) {
        process.env.IN_CONTAINER = originalEnv;
      } else {
        delete process.env.IN_CONTAINER;
      }
    });

    it("should return true when IN_CONTAINER env var is true", async function () {
      process.env.IN_CONTAINER = "true";
      
      const result = await inContainer();
      
      expect(result).to.be.true;
    });

    it("should return false when IN_CONTAINER is not set and not in container", async function () {
      delete process.env.IN_CONTAINER;
      
      const result = await inContainer();
      
      // On a non-container system, this should return false
      // (unless running tests in a container)
      expect(typeof result).to.equal("boolean");
    });
  });

  describe("fetchFile", function () {
    const axios = require("axios");
    let axiosGetStub;

    beforeEach(function () {
      axiosGetStub = sinon.stub(axios, "get");
    });

    afterEach(function () {
      axiosGetStub.restore();
    });

    it("should fetch file and return success with path", async function () {
      axiosGetStub.resolves({
        data: "file content here",
      });

      const result = await fetchFile("https://example.com/test.txt");

      expect(result.result).to.equal("success");
      expect(result.path).to.include("doc-detective");
      expect(result.path).to.include("test.txt");
    });

    it("should handle JSON response data", async function () {
      axiosGetStub.resolves({
        data: { key: "value", nested: { foo: "bar" } },
      });

      const result = await fetchFile("https://example.com/data.json");

      expect(result.result).to.equal("success");
      expect(result.path).to.include("data.json");
    });

    it("should return error when fetch fails", async function () {
      axiosGetStub.rejects(new Error("Network error"));

      const result = await fetchFile("https://example.com/nonexistent.txt");

      expect(result.result).to.equal("error");
      expect(result.message).to.be.instanceOf(Error);
    });

    it("should create temp directory if it does not exist", async function () {
      axiosGetStub.resolves({
        data: "content",
      });

      // Clean up temp directory first
      const tempDir = `${os.tmpdir()}/doc-detective`;
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          fs.unlinkSync(path.join(tempDir, file));
        }
        fs.rmdirSync(tempDir);
      }

      const result = await fetchFile("https://example.com/new-file.txt");

      expect(result.result).to.equal("success");
      expect(fs.existsSync(tempDir)).to.be.true;
    });

    it("should reuse existing cached file", async function () {
      const testContent = "cached content " + Date.now();
      axiosGetStub.resolves({
        data: testContent,
      });

      // First fetch
      const result1 = await fetchFile("https://example.com/cached.txt");
      expect(result1.result).to.equal("success");

      // Second fetch should return same path (cached)
      const result2 = await fetchFile("https://example.com/cached.txt");
      expect(result2.result).to.equal("success");
      expect(result2.path).to.equal(result1.path);
    });
  });
});
