import fs from "fs";
import os from "os";
import crypto from "crypto";
import YAML from "yaml";
import axios from "axios";
import path from "path";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { validate, resolvePaths, transformToSchemaKey, readFile } from "doc-detective-common";
import { loadHerettoContent } from "./heretto";
import { setReplaceEnvs } from "./openapi";
import { setLogFunction } from "./resolve";
import type {
  Config,
  FileType,
  DetectedSpec,
  DetectedTest,
  Step,
  LogLevel,
  MarkupPattern,
  QualifiedFile,
  SpawnResult,
} from "./types";

// Initialize circular dependency connections
// These will be called after module load to connect log and replaceEnvs

/**
 * Finds which Heretto integration a file belongs to based on its path.
 * @param config - Doc Detective config with _herettoPathMapping
 * @param filePath - Path to check
 * @returns Heretto integration name or null if not from Heretto
 */
export function findHerettoIntegration(config: Config, filePath: string): string | null {
  if (!config._herettoPathMapping) return null;

  const normalizedFilePath = path.resolve(filePath);

  for (const [outputPath, integrationName] of Object.entries(config._herettoPathMapping)) {
    const normalizedOutputPath = path.resolve(outputPath);
    if (normalizedFilePath.startsWith(normalizedOutputPath)) {
      return integrationName;
    }
  }

  return null;
}

/**
 * Checks if a URL is relative (not absolute).
 * @param url - The URL to check
 * @returns True if the URL is relative
 */
export function isRelativeUrl(url: string): boolean {
  try {
    new URL(url);
    // If no error is thrown, it's a complete URL
    return false;
  } catch (_error) {
    // If URL constructor throws an error, it's a relative URL
    return true;
  }
}

/**
 * Generates a unique specId from a file path that is safe for storage/URLs.
 * Uses relative path from cwd when possible to provide uniqueness while
 * avoiding collisions from files with the same basename in different directories.
 * @param filePath - Absolute or relative file path
 * @returns A safe specId derived from the file path
 */
function generateSpecId(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const cwd = process.cwd();

  let relativePath: string;
  if (absolutePath.startsWith(cwd)) {
    relativePath = path.relative(cwd, absolutePath);
  } else {
    relativePath = absolutePath;
  }

  const normalizedPath = relativePath
    .split(path.sep)
    .join("/")
    .replace(/^\.\//, "")
    .replace(/[^a-zA-Z0-9._\-\/]/g, "_");

  return normalizedPath;
}

/**
 * Parse XML-style attributes to an object
 * Example: 'wait=500' becomes { wait: 500 }
 * Example: 'testId="myTestId" detectSteps=false' becomes { testId: "myTestId", detectSteps: false }
 */
function parseXmlAttributes({ stringifiedObject }: { stringifiedObject: string }): Record<string, unknown> | null {
  if (typeof stringifiedObject !== "string") {
    return null;
  }

  // Trim the string
  const str = stringifiedObject.trim();

  // Check if it looks like JSON or YAML - if so, return null to let JSON/YAML parsers handle it
  if (str.startsWith("{") || str.startsWith("[")) {
    return null;
  }

  // Check if it looks like YAML (key: value pattern outside of quotes)
  const yamlPattern = /^\w+:\s/;
  if (yamlPattern.test(str)) {
    return null;
  }
  // Check if it looks like a YAML array (starts with '-')
  if (str.startsWith("-")) {
    return null;
  }

  // Parse XML-style attributes
  const result: Record<string, unknown> = {};
  const attrRegex = /([\w.]+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match: RegExpExecArray | null;
  let hasMatches = false;

  while ((match = attrRegex.exec(str)) !== null) {
    hasMatches = true;
    const keyPath = match[1];
    let value: unknown =
      match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];

    // Try to parse as boolean
    if (value === "true") {
      value = true;
    } else if (value === "false") {
      value = false;
    } else if (!isNaN(value as number) && value !== "") {
      // Try to parse as number
      value = Number(value);
    }

    // Handle dot notation for nested objects
    if (keyPath.includes(".")) {
      const keys = keyPath.split(".");
      let current: Record<string, unknown> = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!current[key] || typeof current[key] !== "object") {
          current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
      }

      current[keys[keys.length - 1]] = value;
    } else {
      result[keyPath] = value;
    }
  }

  return hasMatches ? result : null;
}

/**
 * Parse a JSON or YAML object from a string
 */
function parseObject({ stringifiedObject }: { stringifiedObject: unknown }): unknown {
  if (typeof stringifiedObject === "string") {
    // First, try to parse as XML attributes
    const xmlAttrs = parseXmlAttributes({ stringifiedObject });
    if (xmlAttrs !== null) {
      return xmlAttrs;
    }

    // Try to parse as JSON first
    try {
      const json = JSON.parse(stringifiedObject);
      return json;
    } catch (_jsonError) {
      // JSON parsing failed - check if this looks like escaped/double-encoded JSON
      const trimmedString = stringifiedObject.trim();
      const looksLikeEscapedJson =
        (trimmedString.startsWith("{") || trimmedString.startsWith("[")) &&
        trimmedString.includes('\\"');

      if (looksLikeEscapedJson) {
        let stringToParse: string;
        try {
          stringToParse = JSON.parse('"' + stringifiedObject + '"');
        } catch {
          stringToParse = stringifiedObject.replace(/\\"/g, '"');
        }
        try {
          const json = JSON.parse(stringToParse);
          return json;
        } catch {
          // Fall through to YAML parsing
        }
      }

      // Try YAML as final fallback
      try {
        const yaml = YAML.parse(stringifiedObject);
        return yaml;
      } catch (_yamlError) {
        throw new Error("Invalid JSON or YAML format");
      }
    }
  }
  return stringifiedObject;
}

/**
 * Delete all contents of doc-detective temp directory
 */
export function cleanTemp(): void {
  const tempDir = `${os.tmpdir()}/doc-detective`;
  if (fs.existsSync(tempDir)) {
    fs.readdirSync(tempDir).forEach((file) => {
      const curPath = `${tempDir}/${file}`;
      fs.unlinkSync(curPath);
    });
  }
}

interface FetchFileResult {
  result: "success" | "error";
  path?: string;
  message?: unknown;
}

/**
 * Fetch a file from a URL and save to a temp directory
 */
export async function fetchFile(fileURL: string): Promise<FetchFileResult> {
  try {
    const response = await axios.get(fileURL);
    let data: string;
    if (typeof response.data === "object") {
      data = JSON.stringify(response.data, null, 2);
    } else {
      data = response.data.toString();
    }
    const fileName = fileURL.split("/").pop() || "file";
    const hash = crypto.createHash("md5").update(data).digest("hex");
    const filePath = `${os.tmpdir()}/doc-detective/${hash}_${fileName}`;
    // If doc-detective temp directory doesn't exist, create it
    if (!fs.existsSync(`${os.tmpdir()}/doc-detective`)) {
      fs.mkdirSync(`${os.tmpdir()}/doc-detective`);
    }
    // If file doesn't exist, write it
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, data);
    }
    return { result: "success", path: filePath };
  } catch (error) {
    return { result: "error", message: error };
  }
}

/**
 * Inspect and qualify files as valid inputs
 */
export async function qualifyFiles({ config }: { config: Config }): Promise<string[]> {
  let dirs: string[] = [];
  let files: string[] = [];
  let sequence: string[] = [];

  // Determine source sequence
  const setup = (config as Record<string, unknown>).beforeAny as string[] | undefined;
  if (setup) sequence = sequence.concat(setup);
  const input = config.input;
  if (input) {
    if (Array.isArray(input)) {
      sequence = sequence.concat(input);
    } else {
      sequence.push(input);
    }
  }
  const cleanup = (config as Record<string, unknown>).afterAll as string[] | undefined;
  if (cleanup) sequence = sequence.concat(cleanup);

  if (sequence.length === 0) {
    log(config, "warning", "No input sources specified.");
    return [];
  }

  const ignoredDitaMaps: string[] = [];

  // Track Heretto output paths for sourceIntegration metadata
  if (!config._herettoPathMapping) {
    config._herettoPathMapping = {};
  }

  for (let i = 0; i < sequence.length; i++) {
    let source = sequence[i];
    log(config, "debug", `source: ${source}`);

    // Check if source is a heretto:<name> reference
    if (source.startsWith("heretto:")) {
      const herettoName = source.substring(8); // Remove "heretto:" prefix
      const herettoConfig = config?.integrations?.heretto?.find((h) => h.name === herettoName);

      if (!herettoConfig) {
        log(config, "warning", `Heretto integration "${herettoName}" not found in config. Skipping.`);
        continue;
      }

      // Load Heretto content if not already loaded
      const herettoConfigWithOutput = herettoConfig as typeof herettoConfig & { outputPath?: string };
      if (!herettoConfigWithOutput.outputPath) {
        try {
          const outputPath = await loadHerettoContent(herettoConfig, log, config);
          if (outputPath) {
            herettoConfigWithOutput.outputPath = outputPath;
            // Store mapping from output path to Heretto integration name
            config._herettoPathMapping![outputPath] = herettoName;
            log(config, "debug", `Adding Heretto output path: ${outputPath}`);
            // Insert the output path into the sequence for processing
            sequence.splice(i + 1, 0, outputPath);
            ignoredDitaMaps.push(outputPath);
          } else {
            log(config, "warning", `Failed to load Heretto content for "${herettoName}". Skipping.`);
          }
        } catch (error) {
          log(config, "warning", `Failed to load Heretto content from "${herettoName}": ${(error as Error).message}`);
        }
      } else {
        // Already loaded, add to sequence if not already there
        if (!sequence.includes(herettoConfigWithOutput.outputPath)) {
          sequence.splice(i + 1, 0, herettoConfigWithOutput.outputPath);
        }
      }
      continue;
    }

    // Check if source is a URL
    const isURL = source.startsWith("http://") || source.startsWith("https://");
    if (isURL) {
      const fetch = await fetchFile(source);
      if (fetch.result === "error") {
        log(config, "warning", fetch.message);
        continue;
      }
      source = fetch.path!;
    }

    // Check if source is a file or directory
    const stat = fs.statSync(source);
    const isFile = stat.isFile();
    const isDir = stat.isDirectory();

    // If ditamap, process with `dita` to build files, then add output directory to dirs array
    const configWithProcessDitaMaps = config as Config & { processDitaMaps?: boolean };
    if (
      isFile &&
      path.extname(source) === ".ditamap" &&
      !ignoredDitaMaps.some((ignored) => source.includes(ignored)) &&
      configWithProcessDitaMaps.processDitaMaps
    ) {
      const ditaOutput = await processDitaMap({ config, source });
      if (ditaOutput) {
        sequence.splice(i + 1, 0, ditaOutput);
        ignoredDitaMaps.push(ditaOutput);
      }
      continue;
    }

    // Parse input
    if (isFile && (await isValidSourceFile({ config, files, source }))) {
      files.push(path.resolve(source));
    } else if (isDir) {
      dirs = [];
      dirs[0] = source;
      for (const dir of dirs) {
        const objects = fs.readdirSync(dir);
        for (const object of objects) {
          const content = path.resolve(dir + "/" + object);
          // Exclude node_modules for local installs
          if (content.includes("node_modules")) continue;
          // Check if file or directory
          const contentStat = fs.statSync(content);
          const contentIsFile = contentStat.isFile();
          const contentIsDir = contentStat.isDirectory();
          // Add to files or dirs array
          if (contentIsFile && (await isValidSourceFile({ config, files, source: content }))) {
            files.push(path.resolve(content));
          } else if (contentIsDir && config.recursive) {
            dirs.push(content);
          }
        }
      }
    }
  }
  return files;
}

/**
 * Process dita map into a set of files
 */
async function processDitaMap({ config, source }: { config: Config; source: string }): Promise<string | null> {
  const hash = crypto.createHash("md5").update(source).digest("hex");
  const outputDir = `${os.tmpdir()}/doc-detective/ditamap_${hash}`;
  // If doc-detective temp directory doesn't exist, create it
  if (!fs.existsSync(`${os.tmpdir()}/doc-detective`)) {
    log(config, "debug", `Creating temp directory: ${os.tmpdir()}/doc-detective`);
    fs.mkdirSync(`${os.tmpdir()}/doc-detective`);
  }
  const ditaVersion = await spawnCommand("dita", ["--version"]);
  if (ditaVersion.exitCode !== 0) {
    log(config, "error", `'dita' command not found. Make sure it's installed. Error: ${ditaVersion.stderr}`);
    return null;
  }

  log(config, "info", `Processing DITA map: ${source}`);
  const ditaOutputDir = await spawnCommand("dita", ["-i", source, "-f", "dita", "-o", outputDir]);
  if (ditaOutputDir.exitCode !== 0) {
    log(config, "error", `Failed to process DITA map: ${ditaOutputDir.stderr}`);
    return null;
  }
  return outputDir;
}

/**
 * Check if a source file is valid based on fileType definitions
 */
async function isValidSourceFile({
  config,
  files,
  source,
}: {
  config: Config;
  files: string[];
  source: string;
}): Promise<boolean> {
  log(config, "debug", `validation: ${source}`);
  // Determine allowed extensions
  let allowedExtensions = ["json", "yaml", "yml"];
  const fileTypes = config.fileTypes as FileType[] | Record<string, FileType> | undefined;
  if (fileTypes) {
    if (Array.isArray(fileTypes)) {
      fileTypes.forEach((fileType) => {
        allowedExtensions = allowedExtensions.concat(fileType.extensions);
      });
    } else {
      Object.values(fileTypes).forEach((fileType) => {
        allowedExtensions = allowedExtensions.concat(fileType.extensions);
      });
    }
  }

  // Is present in files array already
  if (files.indexOf(source) >= 0) return false;

  // Is JSON or YAML but isn't a valid spec-formatted JSON object
  if (
    path.extname(source) === ".json" ||
    path.extname(source) === ".yaml" ||
    path.extname(source) === ".yml"
  ) {
    const content = await readFile({ fileURLOrPath: source });
    if (typeof content !== "object") {
      log(config, "debug", `${source} isn't a valid test specification. Skipping.`);
      return false;
    }
    const validation = validate({
      schemaKey: "spec_v3",
      object: content,
      addDefaults: false,
    });
    if (!validation.valid) {
      log(config, "warning", validation);
      log(config, "warning", `${source} isn't a valid test specification. Skipping.`);
      return false;
    }

    // Check before and after files exist
    const contentWithTests = content as { tests?: Array<{ before?: string; after?: string }> };
    const configWithRelPathBase = config as Config & { relativePathBase?: string };
    if (contentWithTests.tests) {
      for (const test of contentWithTests.tests) {
        if (test.before) {
          let beforePath = "";
          if (configWithRelPathBase.relativePathBase === "file") {
            beforePath = path.resolve(path.dirname(source), test.before);
          } else {
            beforePath = path.resolve(test.before);
          }
          if (!fs.existsSync(beforePath)) {
            log(
              config,
              "debug",
              `${beforePath} is specified to run before a test but isn't a valid file. Skipping ${source}.`
            );
            return false;
          }
        }
        if (test.after) {
          let afterPath = "";
          if (configWithRelPathBase.relativePathBase === "file") {
            afterPath = path.resolve(path.dirname(source), test.after);
          } else {
            afterPath = path.resolve(test.after);
          }
          if (!fs.existsSync(afterPath)) {
            log(
              config,
              "debug",
              `${afterPath} is specified to run after a test but isn't a valid file. Skipping ${source}.`
            );
            return false;
          }
        }
      }
    }
  }

  // If extension isn't in list of allowed extensions
  const extension = path.extname(source).substring(1);
  if (!allowedExtensions.includes(extension)) {
    log(config, "debug", `${source} extension isn't specified in a \`config.fileTypes\` object. Skipping.`);
    return false;
  }

  return true;
}

interface StatementMatch {
  type: string;
  sortIndex: number;
  markup?: MarkupPattern;
  [key: number]: string;
  [key: string]: unknown;
  index?: number;
}

/**
 * Parses raw test content into an array of structured test objects.
 */
async function parseContent({
  config,
  content,
  filePath,
  fileType,
}: {
  config: Config;
  content: string;
  filePath: string;
  fileType: FileType;
}): Promise<DetectedTest[]> {
  const statements: StatementMatch[] = [];
  const statementTypes = ["testStart", "testEnd", "ignoreStart", "ignoreEnd", "step"];

  function findTest({ tests, testId }: { tests: DetectedTest[]; testId: string }): DetectedTest {
    let test = tests.find((t) => t.testId === testId);
    if (!test) {
      test = { testId, steps: [] };
      tests.push(test);
    }
    return test;
  }

  function replaceNumericVariables(
    stringOrObjectSource: unknown,
    values: Record<string | number, unknown>
  ): unknown {
    let stringOrObject = JSON.parse(JSON.stringify(stringOrObjectSource));
    if (typeof stringOrObject !== "string" && typeof stringOrObject !== "object") {
      throw new Error("Invalid stringOrObject type");
    }
    if (typeof values !== "object") {
      throw new Error("Invalid values type");
    }

    if (typeof stringOrObject === "string") {
      const matches = stringOrObject.match(/\$[0-9]+/g);
      if (matches) {
        const allExist = matches.every((variable) => {
          const index = variable.substring(1);
          return Object.hasOwn(values, index) && typeof values[index] !== "undefined";
        });
        if (!allExist) {
          return null;
        } else {
          stringOrObject = stringOrObject.replace(/\$[0-9]+/g, (variable) => {
            const index = variable.substring(1);
            return String(values[index]);
          });
        }
      }
    }

    if (typeof stringOrObject === "object" && stringOrObject !== null) {
      Object.keys(stringOrObject).forEach((key) => {
        if (typeof stringOrObject[key] === "object") {
          stringOrObject[key] = replaceNumericVariables(stringOrObject[key], values);
        } else if (typeof stringOrObject[key] === "string") {
          const matches = stringOrObject[key].match(/\$[0-9]+/g);
          if (matches) {
            const allExist = matches.every((variable: string) => {
              const index = variable.substring(1);
              return Object.hasOwn(values, index) && typeof values[index] !== "undefined";
            });
            if (!allExist) {
              delete stringOrObject[key];
            } else {
              stringOrObject[key] = stringOrObject[key].replace(/\$[0-9]+/g, (variable: string) => {
                const index = variable.substring(1);
                return String(values[index]);
              });
            }
          }
        }
      });
    }
    return stringOrObject;
  }

  // Test for each statement type
  statementTypes.forEach((statementType) => {
    if (
      typeof fileType.inlineStatements === "undefined" ||
      typeof fileType.inlineStatements[statementType as keyof typeof fileType.inlineStatements] === "undefined"
    )
      return;

    const patterns = fileType.inlineStatements[statementType as keyof typeof fileType.inlineStatements];
    patterns.forEach((statementRegex) => {
      const regex = new RegExp(statementRegex, "g");
      const matches = [...content.matchAll(regex)];
      matches.forEach((match) => {
        const statementMatch: StatementMatch = {
          type: statementType,
          sortIndex: match[1] ? match.index! + match[1].length : match.index!,
          ...match,
        };
        statements.push(statementMatch);
      });
    });
  });

  if (config.detectSteps && fileType.markup) {
    fileType.markup.forEach((markup) => {
      markup.regex.forEach((pattern) => {
        const regex = new RegExp(pattern, "g");
        const matches = [...content.matchAll(regex)];
        const markupWithBatch = markup as MarkupPattern & { batchMatches?: boolean };
        if (matches.length > 0 && markupWithBatch.batchMatches) {
          const combinedMatch: StatementMatch = {
            1: matches.map((match) => match[1] || match[0]).join(os.EOL),
            type: "detectedStep",
            markup: markup,
            sortIndex: Math.min(...matches.map((match) => match.index!)),
          };
          statements.push(combinedMatch);
        } else if (matches.length > 0) {
          matches.forEach((match) => {
            const statementMatch: StatementMatch = {
              type: "detectedStep",
              markup: markup,
              sortIndex: match[1] ? match.index! + match[1].length : match.index!,
              ...match,
            };
            statements.push(statementMatch);
          });
        }
      });
    });
  }

  // Sort statements by index
  statements.sort((a, b) => a.sortIndex - b.sortIndex);

  // Process statements into tests and steps
  const tests: DetectedTest[] = [];
  let testId = `${crypto.randomUUID()}`;
  let ignore = false;

  statements.forEach((statement) => {
    let test: DetectedTest;
    let statementContent: string;
    let stepsCleanup = false;

    switch (statement.type) {
      case "testStart":
        statementContent = statement[1] || statement[0];
        test = parseObject({ stringifiedObject: statementContent }) as DetectedTest;

        // If v2 schema, convert to v3
        const testWithV2 = test as DetectedTest & { id?: string; file?: string; setup?: string; cleanup?: string };
        if (testWithV2.id || testWithV2.file || testWithV2.setup || testWithV2.cleanup) {
          if (!test.steps) {
            test.steps = [{ action: "goTo", url: "https://doc-detective.com" } as Step];
            stepsCleanup = true;
          }
          test = transformToSchemaKey({
            object: test,
            currentSchema: "test_v2",
            targetSchema: "test_v3",
          }) as DetectedTest;
          if (stepsCleanup) {
            test.steps = [];
            stepsCleanup = false;
          }
        }

        if (test.testId) {
          testId = `${test.testId}`;
        } else {
          test.testId = `${testId}`;
        }

        // Normalize detectSteps field
        const testWithDetectSteps = test as DetectedTest & { detectSteps?: boolean | string };
        if (testWithDetectSteps.detectSteps === "false") {
          testWithDetectSteps.detectSteps = false;
        } else if (testWithDetectSteps.detectSteps === "true") {
          testWithDetectSteps.detectSteps = true;
        }

        if (!test.steps) {
          test.steps = [];
        }
        tests.push(test);
        break;

      case "testEnd":
        testId = `${crypto.randomUUID()}`;
        ignore = false;
        break;

      case "ignoreStart":
        ignore = true;
        break;

      case "ignoreEnd":
        ignore = false;
        break;

      case "detectedStep":
        test = findTest({ tests, testId });
        const testWithDetect = test as DetectedTest & { detectSteps?: boolean };
        if (typeof testWithDetect.detectSteps !== "undefined" && !testWithDetect.detectSteps) {
          break;
        }
        const markupWithActions = statement.markup as MarkupPattern & { actions?: Array<string | Record<string, unknown>> };
        if (markupWithActions?.actions) {
          markupWithActions.actions.forEach((action) => {
            let step: Step = {};
            const configWithOrigin = config as Config & { origin?: string };
            if (typeof action === "string") {
              if (action === "runCode") return;
              step[action] = statement[1] || statement[0];
              if (configWithOrigin.origin && (action === "goTo" || action === "checkLink")) {
                (step[action] as Record<string, unknown>).origin = configWithOrigin.origin;
              }
              // Attach sourceIntegration metadata for screenshot steps from Heretto
              if (action === "screenshot" && config._herettoPathMapping) {
                const herettoIntegration = findHerettoIntegration(config, filePath);
                if (herettoIntegration) {
                  const screenshotPath = step[action] as string;
                  step[action] = {
                    path: screenshotPath,
                    sourceIntegration: {
                      type: "heretto",
                      integrationName: herettoIntegration,
                      filePath: screenshotPath,
                      contentPath: filePath,
                    },
                  };
                }
              }
            } else {
              step = replaceNumericVariables(action, statement) as Step;
              
              // Attach sourceIntegration metadata for screenshot steps from Heretto
              if (step.screenshot && config._herettoPathMapping) {
                const herettoIntegration = findHerettoIntegration(config, filePath);
                if (herettoIntegration) {
                  if (typeof step.screenshot === "string") {
                    step.screenshot = { path: step.screenshot };
                  } else if (typeof step.screenshot === "boolean") {
                    step.screenshot = {};
                  }
                  const screenshot = step.screenshot as Record<string, unknown>;
                  screenshot.sourceIntegration = {
                    type: "heretto",
                    integrationName: herettoIntegration,
                    filePath: screenshot.path || "",
                    contentPath: filePath,
                  };
                }
              }
            }

            // Normalize step field formats
            if (step.httpRequest) {
              const httpRequest = step.httpRequest as Record<string, unknown>;
              const request = httpRequest.request as Record<string, unknown> | undefined;
              if (request) {
                if (typeof request.headers === "string") {
                  try {
                    const headers: Record<string, string> = {};
                    (request.headers as string).split("\n").forEach((header) => {
                      const colonIndex = header.indexOf(":");
                      if (colonIndex === -1) return;
                      const key = header.substring(0, colonIndex).trim();
                      const value = header.substring(colonIndex + 1).trim();
                      if (key && value) {
                        headers[key] = value;
                      }
                    });
                    request.headers = headers;
                  } catch (_error) {}
                }
                if (
                  typeof request.body === "string" &&
                  ((request.body as string).trim().startsWith("{") ||
                    (request.body as string).trim().startsWith("["))
                ) {
                  try {
                    request.body = JSON.parse(request.body as string);
                  } catch (_error) {}
                }
              }
            }

            // Make sure is valid v3 step schema
            const valid = validate({
              schemaKey: "step_v3",
              object: step,
              addDefaults: false,
            });
            if (!valid) {
              log(config, "warning", `Step ${JSON.stringify(step)} isn't a valid step. Skipping.`);
              return;
            }
            step = valid.object as Step;
            test.steps.push(step);
          });
        }
        break;

      case "step":
        test = findTest({ tests, testId });
        statementContent = statement[1] || statement[0];
        let step = parseObject({ stringifiedObject: statementContent }) as Step;
        const validation = validate({
          schemaKey: "step_v3",
          object: step,
          addDefaults: false,
        });
        if (!validation.valid) {
          log(config, "warning", `Step ${JSON.stringify(step)} isn't a valid step. Skipping.`);
          return;
        }
        step = validation.object as Step;
        test.steps.push(step);
        break;

      default:
        break;
    }
  });

  tests.forEach((test) => {
    const validation = validate({
      schemaKey: "test_v3",
      object: test,
      addDefaults: false,
    });
    if (!validation.valid) {
      log(
        config,
        "warning",
        `Couldn't convert some steps in ${filePath} to a valid test. Skipping. Errors: ${validation.errors}`
      );
      return;
    }
  });

  return tests;
}

/**
 * Parse files for tests
 */
export async function parseTests({
  config,
  files,
}: {
  config: Config;
  files: string[];
}): Promise<DetectedSpec[]> {
  const specs: DetectedSpec[] = [];

  for (const file of files) {
    log(config, "debug", `file: ${file}`);
    const extension = path.extname(file).slice(1);
    let content = await readFile({ fileURLOrPath: file });

    if (typeof content === "object") {
      content = await resolvePaths({
        config: config,
        object: content,
        filePath: file,
      });

      const contentWithTests = content as { tests?: Array<{ before?: string; after?: string; steps: Step[] }> };
      if (contentWithTests.tests) {
        for (const test of contentWithTests.tests) {
          if (test.before) {
            const setup = await readFile({ fileURLOrPath: test.before });
            const setupWithTests = setup as { tests?: Array<{ steps: Step[] }> };
            if (setupWithTests.tests?.[0]?.steps) {
              test.steps = setupWithTests.tests[0].steps.concat(test.steps);
            }
          }
          if (test.after) {
            const cleanup = await readFile({ fileURLOrPath: test.after });
            const cleanupWithTests = cleanup as { tests?: Array<{ steps: Step[] }> };
            if (cleanupWithTests.tests?.[0]?.steps) {
              test.steps = test.steps.concat(cleanupWithTests.tests[0].steps);
            }
          }
        }

        for (const test of contentWithTests.tests) {
          test.steps.forEach((step) => {
            const validation = validate({
              schemaKey: `step_v3`,
              object: { ...step },
              addDefaults: false,
            });
            if (!validation.valid) {
              log(config, "warning", `Step ${step} isn't a valid step. Skipping.`);
              return false;
            }
            return true;
          });
        }
      }

      const validation = validate({
        schemaKey: "spec_v3",
        object: content,
        addDefaults: false,
      });
      if (!validation.valid) {
        log(config, "warning", validation);
        log(
          config,
          "warning",
          `After applying setup and cleanup steps, ${file} isn't a valid test specification. Skipping.`
        );
        continue;
      }

      content = validation.object;
      content = await resolvePaths({
        config: config,
        object: content,
        filePath: file,
      });
      specs.push(content as DetectedSpec);
    } else {
      const id = generateSpecId(file);
      let spec: DetectedSpec = { specId: id, file, tests: [] };
      
      const fileTypes = config.fileTypes as FileType[] | Record<string, FileType> | undefined;
      let fileType: FileType | undefined;
      if (fileTypes) {
        if (Array.isArray(fileTypes)) {
          fileType = fileTypes.find((ft) => ft.extensions.includes(extension));
        } else {
          fileType = Object.values(fileTypes).find((ft) => ft.extensions.includes(extension));
        }
      }

      if (!fileType) continue;

      // Process executables
      const fileTypeWithRunShell = fileType as FileType & { runShell?: Record<string, unknown> };
      if (fileTypeWithRunShell.runShell) {
        let runShell = JSON.stringify(fileTypeWithRunShell.runShell);
        runShell = runShell.replace(/\$1/g, file);
        const runShellParsed = JSON.parse(runShell);

        const test: DetectedTest = {
          steps: [{ runShell: runShellParsed }],
        };

        const validation = validate({
          schemaKey: "test_v3",
          object: test,
          addDefaults: false,
        });
        if (!validation.valid) {
          log(config, "warning", `Failed to convert ${file} to a runShell step: ${validation.errors}. Skipping.`);
          continue;
        }

        spec.tests.push(test);
        continue;
      }

      // Process content
      const tests = await parseContent({
        config: config,
        content: content as string,
        fileType: fileType,
        filePath: file,
      });
      spec.tests.push(...tests);

      // Remove tests with no steps
      spec.tests = spec.tests.filter((test) => test.steps && test.steps.length > 0);

      // Push spec to specs, if it is valid
      const validation = validate({
        schemaKey: "spec_v3",
        object: spec,
        addDefaults: false,
      });
      if (!validation.valid) {
        log(config, "warning", `Tests from ${file} don't create a valid test specification. Skipping.`);
      } else {
        spec = await resolvePaths({
          config: config,
          object: spec,
          filePath: file,
        }) as DetectedSpec;
        specs.push(spec);
      }
    }
  }
  return specs;
}

/**
 * Output results to a file
 */
export async function outputResults(outputPath: string, results: unknown, config: Config): Promise<void> {
  const data = JSON.stringify(results, null, 2);
  fs.writeFile(outputPath, data, (err) => {
    if (err) throw err;
  });
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", `See results at ${outputPath}`);
  log(config, "info", "Cleaning up and finishing post-processing.");
}

interface LoadEnvsResult {
  status: "PASS" | "FAIL";
  description: string;
}

/**
 * Loads environment variables from a specified .env file.
 */
export async function loadEnvs(envsFile: string): Promise<LoadEnvsResult> {
  const fileExists = fs.existsSync(envsFile);
  if (fileExists) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("dotenv").config({ path: envsFile, override: true });
    return { status: "PASS", description: "Envs set." };
  } else {
    return { status: "FAIL", description: "Invalid file." };
  }
}

/**
 * Log a message based on the configured log level
 */
export function log(config: Config, level: LogLevel, message: unknown): void {
  let logLevelMatch = false;
  if (config.logLevel === "error" && level === "error") {
    logLevelMatch = true;
  } else if (config.logLevel === "warning" && (level === "error" || level === "warning")) {
    logLevelMatch = true;
  } else if (config.logLevel === "info" && (level === "error" || level === "warning" || level === "info")) {
    logLevelMatch = true;
  } else if (
    config.logLevel === "debug" &&
    (level === "error" || level === "warning" || level === "info" || level === "debug")
  ) {
    logLevelMatch = true;
  }

  if (logLevelMatch) {
    if (typeof message === "string") {
      const logMessage = `(${level.toUpperCase()}) ${message}`;
      console.log(logMessage);
    } else if (typeof message === "object") {
      const logMessage = `(${level.toUpperCase()})`;
      console.log(logMessage);
      console.log(JSON.stringify(message, null, 2));
    }
  }
}

/**
 * Replace environment variables in a string or object
 */
export function replaceEnvs(stringOrObject: unknown): unknown {
  if (!stringOrObject) return stringOrObject;
  if (typeof stringOrObject === "object" && stringOrObject !== null) {
    const obj = stringOrObject as Record<string, unknown>;
    Object.keys(obj).forEach((key) => {
      obj[key] = replaceEnvs(obj[key]);
    });
  } else if (typeof stringOrObject === "string") {
    const variableRegex = new RegExp(/\$[a-zA-Z0-9_]+/, "g");
    const matches = stringOrObject.match(variableRegex);
    if (!matches) return stringOrObject;

    let result: unknown = stringOrObject;
    matches.forEach((match) => {
      const value = process.env[match.substring(1)];
      if (value) {
        let parsedValue: unknown = value;
        try {
          if (match.length === (result as string).length && typeof JSON.parse(result as string) === "object") {
            parsedValue = JSON.parse(value);
          }
        } catch {}
        parsedValue = replaceEnvs(parsedValue);
        if (typeof parsedValue === "string") {
          result = (result as string).replace(match, parsedValue);
        } else if (typeof parsedValue === "object") {
          result = parsedValue;
        }
      }
    });
    return result;
  }
  return stringOrObject;
}

/**
 * Generate a timestamp string
 */
export function timestamp(): string {
  const ts = new Date();
  return `${ts.getFullYear()}${("0" + (ts.getMonth() + 1)).slice(-2)}${("0" + ts.getDate()).slice(-2)}-${(
    "0" + ts.getHours()
  ).slice(-2)}${("0" + ts.getMinutes()).slice(-2)}${("0" + ts.getSeconds()).slice(-2)}`;
}

interface SpawnOptions {
  cwd?: string;
  debug?: boolean;
}

/**
 * Executes a command in a child process using spawn
 */
export async function spawnCommand(
  cmd: string,
  args: string[] = [],
  options?: SpawnOptions
): Promise<SpawnResult & { exitCode: number | null }> {
  if (!options) options = {};

  // Set shell (bash/cmd) based on OS
  let shell = "bash";
  let command: string[] = ["-c"];
  if (process.platform === "win32") {
    shell = "cmd";
    command = ["/c"];
  }

  // Combine command and arguments
  const fullCommand = [cmd, ...args].join(" ");
  command.push(fullCommand);

  // Set spawnOptions based on OS
  const spawnOptions: { shell?: boolean; windowsHide?: boolean; cwd?: string } = {};
  if (process.platform === "win32") {
    spawnOptions.shell = true;
    spawnOptions.windowsHide = true;
  }
  if (options.cwd) {
    spawnOptions.cwd = options.cwd;
  }

  const runCommand: ChildProcessWithoutNullStreams = spawn(shell, command, spawnOptions);
  runCommand.on("error", (_error) => {});

  // Capture stdout
  let stdout = "";
  for await (const chunk of runCommand.stdout) {
    stdout += chunk;
    if (options.debug) console.log(chunk.toString());
  }
  stdout = stdout.replace(/\n$/, "");

  // Capture stderr
  let stderr = "";
  for await (const chunk of runCommand.stderr) {
    stderr += chunk;
    if (options.debug) console.log(chunk.toString());
  }
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await new Promise<number | null>((resolve) => {
    runCommand.on("close", resolve);
  });

  return { stdout, stderr, code: exitCode, exitCode };
}

/**
 * Check if running inside a container
 */
export async function inContainer(): Promise<boolean> {
  if (process.env.IN_CONTAINER === "true") return true;
  if (process.platform === "linux") {
    const result = await spawnCommand(`grep -sq "docker\\|lxc\\|kubepods" /proc/1/cgroup`);
    if (result.exitCode === 0) return true;
  }
  return false;
}

/**
 * Calculate percentage difference between two strings using Levenshtein distance
 */
export function calculatePercentageDifference(text1: string, text2: string): string {
  const distance = levenshteinDistance(text1, text2);
  const maxLength = Math.max(text1.length, text2.length);
  const percentageDiff = (distance / maxLength) * 100;
  return percentageDiff.toFixed(2);
}

function levenshteinDistance(s: string, t: string): number {
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const arr: number[][] = [];

  for (let i = 0; i <= t.length; i++) {
    arr[i] = [i];
  }

  for (let j = 0; j <= s.length; j++) {
    arr[0][j] = j;
  }

  for (let i = 1; i <= t.length; i++) {
    for (let j = 1; j <= s.length; j++) {
      arr[i][j] = Math.min(
        arr[i - 1][j] + 1,
        arr[i][j - 1] + 1,
        arr[i - 1][j - 1] + (s[j - 1] === t[i - 1] ? 0 : 1)
      );
    }
  }

  return arr[t.length][s.length];
}

// Initialize circular dependencies after exports are defined
setReplaceEnvs(replaceEnvs);
setLogFunction(log);
