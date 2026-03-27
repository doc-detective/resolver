import os from "os";
import type { Config, TelemetryData, TestResults, LogLevel } from "./types";

// PostHog client type
interface PostHogClient {
  capture(event: { distinctId: string; event: string; properties: TelemetryData }): void;
  shutdown(): void;
}

// Import PostHog dynamically to avoid issues with ESM/CJS
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PostHog } = require("posthog-node") as { PostHog: new (apiKey: string, options: { host: string }) => PostHogClient };

// Import log from utils - we'll use a simple console.log for now to avoid circular deps
// The actual log function will be imported when the module is used
type LogFunction = (config: Config, level: LogLevel, message: unknown) => void;

const platformMap: Record<string, string> = {
  win32: "windows",
  darwin: "mac",
  linux: "linux",
};

/**
 * Displays a telemetry notice to the user based on their configuration.
 * @param config - Doc Detective configuration object
 * @param log - Logging function
 */
export function telemetryNotice(config: Config, log: LogFunction): void {
  if (config?.telemetry?.send === false) {
    log(
      config,
      "info",
      "Telemetry is disabled. Basic anonymous telemetry helps Doc Detective understand product issues and usage. To enable telemetry, set 'telemetry.send' to 'true' in your .doc-detective.json config file."
    );
  } else {
    log(
      config,
      "info",
      "Doc Detective collects basic anonymous telemetry to understand product issues and usage. To disable telemetry, set 'telemetry.send' to 'false' in your .doc-detective.json config file."
    );
  }
}

/**
 * Sends telemetry data to PostHog.
 * @param config - Doc Detective configuration object
 * @param command - The command being executed (e.g., "runTests", "runCoverage", "detect")
 * @param results - Test results object (optional)
 */
export function sendTelemetry(config: Config, command: string, results?: TestResults): void {
  // Exit early if telemetry is disabled
  if (config?.telemetry?.send === false) return;

  // Assemble telemetry data
  const telemetryData: TelemetryData =
    process.env["DOC_DETECTIVE_META"] !== undefined
      ? JSON.parse(process.env["DOC_DETECTIVE_META"])
      : {};

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const packageJson = require("../package.json") as { version: string };

  telemetryData.distribution = telemetryData.distribution || "doc-detective-core";
  telemetryData.dist_interface = telemetryData.dist_interface || "package";
  telemetryData.core_version = packageJson.version;
  telemetryData.dist_version = telemetryData.dist_version || telemetryData.core_version;
  telemetryData.core_platform = platformMap[os.platform()] || os.platform();
  telemetryData.dist_platform = telemetryData.dist_platform || telemetryData.core_platform;
  telemetryData.core_platform_version = os.release();
  telemetryData.dist_platform_version = telemetryData.dist_platform_version || telemetryData.core_platform_version;
  telemetryData.core_platform_arch = os.arch();
  telemetryData.dist_platform_arch = telemetryData.dist_platform_arch || telemetryData.core_platform_arch;
  telemetryData.core_deployment = telemetryData.core_deployment || "node";
  telemetryData.dist_deployment = telemetryData.dist_deployment || telemetryData.core_deployment;
  telemetryData.core_deployment_version = telemetryData.core_deployment_version || process.version;
  telemetryData.dist_deployment_version = telemetryData.dist_deployment_version || telemetryData.core_deployment_version;

  const distinctId = config?.telemetry?.userId || "anonymous";

  // Parse results to assemble flat list of properties for runTests and runCoverage actions
  if ((command === "runTests" || command === "runCoverage") && results?.summary) {
    Object.entries(results.summary).forEach(([parentKey, value]) => {
      if (typeof value === "object" && value !== null) {
        Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
          if (typeof val === "object" && val !== null) {
            Object.entries(val as Record<string, unknown>).forEach(([key2, value2]) => {
              telemetryData[`${parentKey.replace(" ", "_")}_${key.replace(" ", "_")}_${key2.replace(" ", "_")}`] = value2;
            });
          } else {
            telemetryData[`${parentKey.replace(" ", "_")}_${key.replace(" ", "_")}`] = val;
          }
        });
      } else {
        telemetryData[parentKey.replace(" ", "_")] = value;
      }
    });
  }

  const event = { distinctId, event: command, properties: telemetryData };

  // Send telemetry
  const client = new PostHog(
    "phc_rjV0MH3nsAd45zFISLgaKAdAXbgDeXt2mOBV2EBHomB",
    { host: "https://app.posthog.com" }
  );
  client.capture(event);
  client.shutdown();
}
