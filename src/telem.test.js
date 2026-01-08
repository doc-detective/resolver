const { expect } = require("chai");
const sinon = require("sinon");
const { telemetryNotice, sendTelemetry } = require("./telem");

describe("Telemetry Module", function () {
  let consoleLogStub;
  let originalEnv;

  beforeEach(function () {
    consoleLogStub = sinon.stub(console, "log");
    originalEnv = process.env.DOC_DETECTIVE_META;
    delete process.env.DOC_DETECTIVE_META;
  });

  afterEach(function () {
    consoleLogStub.restore();
    if (originalEnv !== undefined) {
      process.env.DOC_DETECTIVE_META = originalEnv;
    } else {
      delete process.env.DOC_DETECTIVE_META;
    }
  });

  describe("telemetryNotice", function () {
    it("should log disabled message when telemetry.send is false", function () {
      const config = {
        logLevel: "info",
        telemetry: { send: false },
      };

      telemetryNotice(config);

      expect(consoleLogStub.calledOnce).to.be.true;
      const loggedMessage = consoleLogStub.firstCall.args[0];
      expect(loggedMessage).to.include("Telemetry is disabled");
      expect(loggedMessage).to.include("To enable telemetry");
    });

    it("should log enabled message when telemetry.send is true", function () {
      const config = {
        logLevel: "info",
        telemetry: { send: true },
      };

      telemetryNotice(config);

      expect(consoleLogStub.calledOnce).to.be.true;
      const loggedMessage = consoleLogStub.firstCall.args[0];
      expect(loggedMessage).to.include(
        "Doc Detective collects basic anonymous telemetry"
      );
      expect(loggedMessage).to.include("To disable telemetry");
    });

    it("should log enabled message when telemetry is not configured", function () {
      const config = {
        logLevel: "info",
      };

      telemetryNotice(config);

      expect(consoleLogStub.calledOnce).to.be.true;
      const loggedMessage = consoleLogStub.firstCall.args[0];
      expect(loggedMessage).to.include(
        "Doc Detective collects basic anonymous telemetry"
      );
    });

    it("should handle undefined config", function () {
      // When config is undefined, log() will not output anything (logLevel check fails)
      // But the function should not throw
      expect(() => telemetryNotice(undefined)).to.not.throw();
    });
  });

  describe("sendTelemetry", function () {
    it("should return early when telemetry.send is false", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: false },
      };

      // This should not throw and should return undefined
      const result = sendTelemetry(config, "runTests", {});
      expect(result).to.be.undefined;
    });

    it("should send telemetry when telemetry.send is true", function () {
      // This test verifies the function runs without errors when telemetry is enabled
      // We can't easily mock PostHog, but we can verify it doesn't throw
      const config = {
        logLevel: "error",
        telemetry: { send: true, userId: "test-user-123" },
      };

      const results = {
        summary: {
          tests: { total: 5, passed: 4, failed: 1 },
          specs: { total: 2 },
        },
      };

      // Should not throw
      expect(() => sendTelemetry(config, "runTests", results)).to.not.throw();
    });

    it("should send telemetry for runCoverage command", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {
          coverage: { percentage: 85 },
          files: { covered: 10, uncovered: 2 },
        },
      };

      expect(() => sendTelemetry(config, "runCoverage", results)).to.not.throw();
    });

    it("should use DOC_DETECTIVE_META environment variable when set", function () {
      process.env.DOC_DETECTIVE_META = JSON.stringify({
        distribution: "custom-dist",
        dist_platform: "linux",
        dist_version: "1.0.0",
      });

      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {},
      };

      // Should not throw and should use env var data
      expect(() =>
        sendTelemetry(config, "customCommand", results)
      ).to.not.throw();
    });

    it("should handle results with nested summary objects", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {
          level1: {
            level2: {
              level3: "deep value",
            },
            simple: "value",
          },
          topLevel: 42,
        },
      };

      expect(() => sendTelemetry(config, "runTests", results)).to.not.throw();
    });

    it("should handle results with spaces in summary keys", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {
          "test results": {
            "passed tests": 5,
            "failed tests": 1,
          },
        },
      };

      expect(() => sendTelemetry(config, "runTests", results)).to.not.throw();
    });

    it("should use anonymous as distinctId when userId is not provided", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {},
      };

      // The distinctId should default to "anonymous" - we can't easily verify
      // this without mocking PostHog, but we can verify it runs without error
      expect(() => sendTelemetry(config, "runTests", results)).to.not.throw();
    });

    it("should handle commands other than runTests and runCoverage", function () {
      const config = {
        logLevel: "error",
        telemetry: { send: true },
      };

      const results = {
        summary: {
          someData: "value",
        },
      };

      // Other commands should not process summary the same way
      expect(() =>
        sendTelemetry(config, "otherCommand", results)
      ).to.not.throw();
    });
  });
});
