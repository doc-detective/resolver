import axios, { AxiosInstance, AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import type { Config, HerettoConfig, HerettoResourceInfo, HerettoFileMapping, LogLevel } from "./types";

// Type for log function
type LogFunction = (config: Config, level: LogLevel, message: unknown) => void;

// Internal constants - not exposed to users
export const POLLING_INTERVAL_MS = 5000;
export const POLLING_TIMEOUT_MS = 300000; // 5 minutes
const API_REQUEST_TIMEOUT_MS = 30000; // 30 seconds for individual API requests
const DOWNLOAD_TIMEOUT_MS = 300000; // 5 minutes for downloads
export const DEFAULT_SCENARIO_NAME = "Doc Detective";
// Base URL for REST API (different from publishing API)
const REST_API_PATH = "/rest/all-files";

// Publishing scenario types
interface PublishingScenario {
  id: string;
  name: string;
}

interface ScenarioParameter {
  name: string;
  type: string;
  value?: string;
  options?: Array<{ value: string }>;
}

interface ScenarioParameters {
  content: ScenarioParameter[];
}

interface PublishingJob {
  jobId: string;
  status?: {
    status: string;
    result?: string;
  };
}

interface JobAsset {
  filePath?: string;
}

interface JobAssetsResponse {
  content: JobAsset[];
  totalPages?: number;
}

interface ScenarioResult {
  scenarioId: string;
  fileId: string;
}

interface UploadResult {
  status: "PASS" | "FAIL";
  description: string;
}

interface FileSearchResult {
  fileId: string;
  filePath: string;
  name: string;
}

/**
 * Creates a Base64-encoded Basic Auth header from username and API token.
 * @param username - Heretto CCMS username (email)
 * @param apiToken - API token generated in Heretto CCMS
 * @returns Base64-encoded authorization header value
 */
export function createAuthHeader(username: string, apiToken: string): string {
  const credentials = `${username}:${apiToken}`;
  return Buffer.from(credentials).toString("base64");
}

/**
 * Builds the base URL for Heretto CCMS API.
 * @param organizationId - The organization subdomain
 * @returns Base API URL
 */
function getBaseUrl(organizationId: string): string {
  return `https://${organizationId}.heretto.com/ezdnxtgen/api/v2`;
}

/**
 * Creates an axios instance configured for Heretto API requests.
 * @param herettoConfig - Heretto integration configuration
 * @returns Configured axios instance
 */
export function createApiClient(herettoConfig: HerettoConfig): AxiosInstance {
  const authHeader = createAuthHeader(
    herettoConfig.username,
    herettoConfig.apiToken
  );
  return axios.create({
    baseURL: getBaseUrl(herettoConfig.organizationId),
    timeout: API_REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Creates an axios instance configured for Heretto REST API requests (different base URL).
 * @param herettoConfig - Heretto integration configuration
 * @returns Configured axios instance for REST API
 */
export function createRestApiClient(herettoConfig: HerettoConfig): AxiosInstance {
  const authHeader = createAuthHeader(
    herettoConfig.username,
    herettoConfig.apiToken
  );
  return axios.create({
    baseURL: `https://${herettoConfig.organizationId}.heretto.com`,
    timeout: API_REQUEST_TIMEOUT_MS,
    headers: {
      Authorization: `Basic ${authHeader}`,
      Accept: "application/xml, text/xml, */*",
    },
  });
}

/**
 * Fetches all available publishing scenarios from Heretto.
 * @param client - Configured axios instance
 * @returns Array of publishing scenarios
 */
async function getPublishingScenarios(client: AxiosInstance): Promise<PublishingScenario[]> {
  const response: AxiosResponse<{ content?: PublishingScenario[] }> = await client.get("/publishes/scenarios");
  return response.data.content || [];
}

/**
 * Fetches parameters for a specific publishing scenario.
 * @param client - Configured axios instance
 * @param scenarioId - ID of the publishing scenario
 * @returns Scenario parameters object
 */
async function getPublishingScenarioParameters(
  client: AxiosInstance,
  scenarioId: string
): Promise<ScenarioParameters> {
  const response: AxiosResponse<ScenarioParameters> = await client.get(
    `/publishes/scenarios/${scenarioId}/parameters`
  );
  return response.data;
}

/**
 * Finds an existing publishing scenario by name and validates its configuration.
 * @param client - Configured axios instance
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @param scenarioName - Name of the scenario to find
 * @returns Object with scenarioId and fileId, or null if not found or invalid
 */
export async function findScenario(
  client: AxiosInstance,
  log: LogFunction,
  config: Config,
  scenarioName: string
): Promise<ScenarioResult | null> {
  try {
    const scenarios = await getPublishingScenarios(client);
    const foundScenario = scenarios.find((s) => s.name === scenarioName);

    if (!foundScenario) {
      log(config, "error", `No existing "${scenarioName}" scenario found.`);
      return null;
    }

    const scenarioParameters = await getPublishingScenarioParameters(
      client,
      foundScenario.id
    );

    if (!scenarioParameters) {
      log(
        config,
        "error",
        `Failed to retrieve scenario details for ID: ${foundScenario.id}`
      );
      return null;
    }

    // Make sure that scenarioParameters.content has an object with name="transtype" and options[0].value="dita"
    const transtypeParam = scenarioParameters.content.find(
      (param) => param.name === "transtype"
    );
    if (!transtypeParam || transtypeParam.value !== "dita") {
      log(
        config,
        "error",
        `Existing "${scenarioName}" scenario has incorrect "transtype" parameter settings. Make sure it is set to "dita".`
      );
      return null;
    }

    // Make sure that scenarioParameters.content has an object with name="tool-kit-name" and value="default/dita-ot-3.6.1"
    const toolKitParam = scenarioParameters.content.find(
      (param) => param.name === "tool-kit-name"
    );
    if (!toolKitParam || !toolKitParam.value) {
      log(
        config,
        "error",
        `Existing "${scenarioName}" scenario has incorrect "tool-kit-name" parameter settings.`
      );
      return null;
    }

    // Make sure that scenarioParameters.content has an object with type="file_uuid_picker" and a value
    const fileUuidPickerParam = scenarioParameters.content.find(
      (param) => param.type === "file_uuid_picker"
    );
    if (!fileUuidPickerParam || !fileUuidPickerParam.value) {
      log(
        config,
        "error",
        `Existing "${scenarioName}" scenario has incorrect "file_uuid_picker" parameter settings. Make sure it has a valid value.`
      );
      return null;
    }

    log(
      config,
      "debug",
      `Found existing "${scenarioName}" scenario: ${foundScenario.id}`
    );
    return {
      scenarioId: foundScenario.id,
      fileId: fileUuidPickerParam.value,
    };
  } catch (error) {
    log(
      config,
      "error",
      `Failed to find publishing scenario: ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * Triggers a publishing job for a DITA map.
 * @param client - Configured axios instance
 * @param fileId - UUID of the DITA map
 * @param scenarioId - ID of the publishing scenario to use
 * @returns Publishing job object
 */
export async function triggerPublishingJob(
  client: AxiosInstance,
  fileId: string,
  scenarioId: string
): Promise<PublishingJob> {
  const response: AxiosResponse<PublishingJob> = await client.post(`/files/${fileId}/publishes`, {
    scenario: scenarioId,
    parameters: [],
  });
  return response.data;
}

/**
 * Gets the status of a publishing job.
 * @param client - Configured axios instance
 * @param fileId - UUID of the DITA map
 * @param jobId - ID of the publishing job
 * @returns Job status object
 */
export async function getJobStatus(
  client: AxiosInstance,
  fileId: string,
  jobId: string
): Promise<PublishingJob> {
  const response: AxiosResponse<PublishingJob> = await client.get(
    `/files/${fileId}/publishes/${jobId}`
  );
  return response.data;
}

/**
 * Gets all asset file paths from a completed publishing job.
 * Handles pagination to retrieve all assets.
 * @param client - Configured axios instance
 * @param fileId - UUID of the DITA map
 * @param jobId - ID of the publishing job
 * @returns Array of asset file paths
 */
export async function getJobAssetDetails(
  client: AxiosInstance,
  fileId: string,
  jobId: string
): Promise<string[]> {
  const allAssets: string[] = [];
  let page = 0;
  const pageSize = 100;
  let hasMorePages = true;

  while (hasMorePages) {
    const response: AxiosResponse<JobAssetsResponse> = await client.get(
      `/files/${fileId}/publishes/${jobId}/assets`,
      {
        params: {
          page,
          size: pageSize,
        },
      }
    );

    const data = response.data;
    const content = data.content || [];

    for (const asset of content) {
      if (asset.filePath) {
        allAssets.push(asset.filePath);
      }
    }

    // Check if there are more pages
    const totalPages = data.totalPages || 1;
    page++;
    hasMorePages = page < totalPages;
  }

  return allAssets;
}

/**
 * Validates that a .ditamap file exists in the job assets.
 * Checks for any .ditamap file in the ot-output/dita/ directory.
 * @param assets - Array of asset file paths
 * @returns True if a .ditamap is found in ot-output/dita/
 */
export function validateDitamapInAssets(assets: string[]): boolean {
  return assets.some(
    (assetPath) =>
      assetPath.startsWith("ot-output/dita/") && assetPath.endsWith(".ditamap")
  );
}

/**
 * Polls a publishing job until completion or timeout.
 * After job completes, validates that a .ditamap file exists in the output.
 * @param client - Configured axios instance
 * @param fileId - UUID of the DITA map
 * @param jobId - ID of the publishing job
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Completed job object or null on timeout/failure
 */
export async function pollJobStatus(
  client: AxiosInstance,
  fileId: string,
  jobId: string,
  log: LogFunction,
  config: Config
): Promise<PublishingJob | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < POLLING_TIMEOUT_MS) {
    try {
      const job = await getJobStatus(client, fileId, jobId);
      log(config, "debug", `Job ${jobId} status: ${job?.status?.status}`);

      // Check if job has reached a terminal state (result is set)
      if (job?.status?.result) {
        log(
          config,
          "debug",
          `Job ${jobId} completed with result: ${job.status.result}`
        );

        // Validate that a .ditamap file exists in the output
        try {
          const assets = await getJobAssetDetails(client, fileId, jobId);
          log(config, "debug", `Job ${jobId} has ${assets.length} assets`);

          if (validateDitamapInAssets(assets)) {
            log(config, "debug", `Found .ditamap file in ot-output/dita/`);
            return job;
          }

          log(
            config,
            "warning",
            `Publishing job ${jobId} completed but no .ditamap file found in ot-output/dita/`
          );
          return null;
        } catch (assetError) {
          log(
            config,
            "warning",
            `Failed to validate job assets: ${(assetError as Error).message}`
          );
          return null;
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, POLLING_INTERVAL_MS));
    } catch (error) {
      log(config, "warning", `Error polling job status: ${(error as Error).message}`);
      return null;
    }
  }

  log(
    config,
    "warning",
    `Publishing job ${jobId} timed out after ${POLLING_TIMEOUT_MS / 1000} seconds`
  );
  return null;
}

/**
 * Downloads the publishing job output and extracts it to temp directory.
 * @param client - Configured axios instance
 * @param fileId - UUID of the DITA map
 * @param jobId - ID of the publishing job
 * @param herettoName - Name of the Heretto integration for directory naming
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Path to extracted content or null on failure
 */
export async function downloadAndExtractOutput(
  client: AxiosInstance,
  fileId: string,
  jobId: string,
  herettoName: string,
  log: LogFunction,
  config: Config
): Promise<string | null> {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = `${os.tmpdir()}/doc-detective`;
    fs.mkdirSync(tempDir, { recursive: true });

    // Create unique output directory based on heretto name and job ID
    const hash = crypto
      .createHash("md5")
      .update(`${herettoName}_${jobId}`)
      .digest("hex");
    const outputDir = path.join(tempDir, `heretto_${hash}`);

    // Download the output file
    log(config, "debug", `Downloading publishing job output for ${herettoName}...`);
    const response: AxiosResponse<ArrayBuffer> = await client.get(
      `/files/${fileId}/publishes/${jobId}/assets-all`,
      {
        responseType: "arraybuffer",
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: {
          Accept: "application/octet-stream",
        },
      }
    );

    // Save ZIP to temp file
    const zipPath = path.join(tempDir, `heretto_${hash}.zip`);
    fs.writeFileSync(zipPath, Buffer.from(response.data));

    // Extract ZIP contents with path traversal protection
    log(config, "debug", `Extracting output to ${outputDir}...`);
    const zip = new AdmZip(zipPath);
    const resolvedOutputDir = path.resolve(outputDir);

    // Validate and extract entries safely to prevent zip slip attacks
    for (const entry of zip.getEntries()) {
      const entryPath = path.join(outputDir, entry.entryName);
      const resolvedPath = path.resolve(entryPath);

      // Ensure the resolved path is within outputDir
      if (
        !resolvedPath.startsWith(resolvedOutputDir + path.sep) &&
        resolvedPath !== resolvedOutputDir
      ) {
        log(config, "warning", `Skipping potentially malicious ZIP entry: ${entry.entryName}`);
        continue;
      }

      if (entry.isDirectory) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, entry.getData());
      }
    }

    // Clean up ZIP file
    fs.unlinkSync(zipPath);

    log(config, "info", `Heretto content "${herettoName}" extracted to ${outputDir}`);
    return outputDir;
  } catch (error) {
    log(config, "warning", `Failed to download or extract output: ${(error as Error).message}`);
    return null;
  }
}

/**
 * Retrieves resource dependencies (all files) for a ditamap from Heretto REST API.
 * This provides the complete file structure with UUIDs and paths.
 * @param restClient - Configured axios instance for REST API
 * @param ditamapId - UUID of the ditamap file
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Object mapping relative paths to UUIDs and parent folder info
 */
export async function getResourceDependencies(
  restClient: AxiosInstance,
  ditamapId: string,
  log: LogFunction,
  config: Config
): Promise<Record<string, HerettoResourceInfo | string>> {
  const pathToUuidMap: Record<string, HerettoResourceInfo | string> = {};

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  // First, try to get the ditamap's own info (this is more reliable than the dependencies endpoint)
  try {
    log(config, "debug", `Fetching ditamap info for: ${ditamapId}`);
    const ditamapInfo = await restClient.get(`${REST_API_PATH}/${ditamapId}`);
    const ditamapParsed = xmlParser.parse(ditamapInfo.data);

    const resource = ditamapParsed.resource as Record<string, unknown> | undefined;
    const ditamapUri = resource?.["xmldb-uri"] || ditamapParsed["@_uri"];
    const ditamapName = resource?.name || ditamapParsed["@_name"];
    const ditamapParentFolder =
      resource?.["folder-uuid"] ||
      resource?.["@_folder-uuid"] ||
      ditamapParsed["@_folder-uuid"];

    log(
      config,
      "debug",
      `Ditamap info: uri=${ditamapUri}, name=${ditamapName}, parentFolder=${ditamapParentFolder}`
    );

    if (ditamapUri) {
      let relativePath = ditamapUri as string;
      const orgPathMatch = relativePath?.match(/\/db\/organizations\/[^/]+\/(.+)/);
      if (orgPathMatch) {
        relativePath = orgPathMatch[1];
      }

      pathToUuidMap[relativePath] = {
        uuid: ditamapId,
        fullPath: ditamapUri as string,
        name: ditamapName as string,
        parentFolderId: ditamapParentFolder as string,
        isDitamap: true,
      };

      // Store the ditamap info as reference points for creating new files
      pathToUuidMap._ditamapPath = relativePath;
      pathToUuidMap._ditamapId = ditamapId;
      pathToUuidMap._ditamapParentFolderId = ditamapParentFolder as string;

      log(config, "debug", `Ditamap path: ${relativePath}, parent folder: ${ditamapParentFolder}`);
    }
  } catch (ditamapError) {
    log(config, "warning", `Could not get ditamap info: ${(ditamapError as Error).message}`);
  }

  // Then try to get the full dependencies list (this endpoint may not be available)
  try {
    log(config, "debug", `Fetching resource dependencies for ditamap: ${ditamapId}`);

    const response = await restClient.get(`${REST_API_PATH}/${ditamapId}/dependencies`);
    const xmlData = response.data;

    const parsed = xmlParser.parse(xmlData);

    // Extract dependencies from the response
    interface DependencyNode {
      "@_id"?: string;
      "@_uuid"?: string;
      "@_uri"?: string;
      "@_path"?: string;
      "@_name"?: string;
      "@_folder-uuid"?: string;
      "@_parent"?: string;
      id?: string;
      uuid?: string;
      uri?: string;
      path?: string;
      name?: string;
      "xmldb-uri"?: string;
      "folder-uuid"?: string;
      dependencies?: { dependency?: DependencyNode | DependencyNode[] };
      dependency?: DependencyNode | DependencyNode[];
    }

    const extractDependencies = (obj: DependencyNode | Record<string, unknown>): void => {
      if (!obj) return;

      const node = obj as DependencyNode;
      // Handle single dependency or array of dependencies
      let dependencies: DependencyNode | DependencyNode[] | undefined =
        node.dependencies?.dependency || node.dependency;
      if (!dependencies) {
        // Try to extract from root-level response
        if (node["@_id"] && node["@_uri"]) {
          dependencies = [node];
        } else if (Array.isArray(obj)) {
          dependencies = obj as DependencyNode[];
        }
      }

      if (!dependencies) return;
      if (!Array.isArray(dependencies)) {
        dependencies = [dependencies];
      }

      for (const dep of dependencies) {
        const uuid = dep["@_id"] || dep["@_uuid"] || dep.id || dep.uuid;
        const uri = dep["@_uri"] || dep["@_path"] || dep.uri || dep.path || dep["xmldb-uri"];
        const name = dep["@_name"] || dep.name;
        const parentFolderId = dep["@_folder-uuid"] || dep["@_parent"] || dep["folder-uuid"];

        if (uuid && (uri || name)) {
          // Extract the relative path from the full URI
          // URI format: /db/organizations/{org}/{path}
          let relativePath = (uri || name) as string;
          const orgPathMatch = relativePath?.match(/\/db\/organizations\/[^/]+\/(.+)/);
          if (orgPathMatch) {
            relativePath = orgPathMatch[1];
          }

          pathToUuidMap[relativePath] = {
            uuid: uuid as string,
            fullPath: uri as string,
            name: (name || path.basename(relativePath || "")) as string,
            parentFolderId: parentFolderId as string,
          };

          log(config, "debug", `Mapped: ${relativePath} -> ${uuid}`);
        }

        // Recursively process nested dependencies
        if (dep.dependencies || dep.dependency) {
          extractDependencies(dep);
        }
      }
    };

    extractDependencies(parsed as Record<string, unknown>);

    log(config, "info", `Retrieved ${Object.keys(pathToUuidMap).length} resource dependencies from Heretto`);
  } catch (error) {
    // Log more details about the error for debugging
    const axiosError = error as { response?: { status?: number } };
    const statusCode = axiosError.response?.status;
    log(
      config,
      "debug",
      `Dependencies endpoint not available (${statusCode}), will use ditamap info as fallback`
    );
    // Continue with ditamap info only - the fallback will create files in the ditamap's parent folder
  }

  return pathToUuidMap;
}

/**
 * Main function to load content from a Heretto CMS instance.
 * Triggers a publishing job, waits for completion, and downloads the output.
 * @param herettoConfig - Heretto integration configuration
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Path to extracted content or null on failure
 */
export async function loadHerettoContent(
  herettoConfig: HerettoConfig,
  log: LogFunction,
  config: Config
): Promise<string | null> {
  log(config, "info", `Loading content from Heretto "${herettoConfig.name}"...`);

  try {
    const client = createApiClient(herettoConfig);
    const restClient = createRestApiClient(herettoConfig);

    // Find the Doc Detective publishing scenario
    const scenarioName = herettoConfig.scenarioName || DEFAULT_SCENARIO_NAME;
    const scenario = await findScenario(client, log, config, scenarioName);
    if (!scenario) {
      log(
        config,
        "warning",
        `Skipping Heretto "${herettoConfig.name}" - could not find or create publishing scenario`
      );
      return null;
    }

    // Fetch resource dependencies to build path-to-UUID mapping
    // This gives us the complete file structure with UUIDs before we even run the job
    if (herettoConfig.uploadOnChange) {
      log(config, "debug", `Fetching resource dependencies for ditamap ${scenario.fileId}...`);
      const resourceDependencies = await getResourceDependencies(
        restClient,
        scenario.fileId,
        log,
        config
      );
      herettoConfig.resourceDependencies = resourceDependencies as Record<string, HerettoResourceInfo>;
    }

    // Trigger publishing job
    log(config, "debug", `Triggering publishing job for file ${scenario.fileId}...`);
    const job = await triggerPublishingJob(client, scenario.fileId, scenario.scenarioId);
    log(config, "debug", `Publishing job started: ${job.jobId}`);

    // Poll for completion
    log(config, "info", `Waiting for publishing job to complete...`);
    const completedJob = await pollJobStatus(client, scenario.fileId, job.jobId, log, config);
    if (!completedJob) {
      log(
        config,
        "warning",
        `Skipping Heretto "${herettoConfig.name}" - publishing job failed or timed out`
      );
      return null;
    }

    // Download and extract output
    const outputPath = await downloadAndExtractOutput(
      client,
      scenario.fileId,
      job.jobId,
      herettoConfig.name,
      log,
      config
    );

    // Build file mapping from extracted content (legacy approach, still useful as fallback)
    if (outputPath && herettoConfig.uploadOnChange) {
      const fileMapping = await buildFileMapping(outputPath, herettoConfig, log, config);
      herettoConfig.fileMapping = fileMapping;
    }

    return outputPath;
  } catch (error) {
    log(config, "warning", `Failed to load Heretto "${herettoConfig.name}": ${(error as Error).message}`);
    return null;
  }
}

/**
 * Builds a mapping of local file paths to Heretto file metadata.
 * Parses DITA files to extract file references and attempts to resolve UUIDs.
 * @param outputPath - Path to extracted Heretto content
 * @param herettoConfig - Heretto integration configuration
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Mapping of local paths to {fileId, filePath}
 */
export async function buildFileMapping(
  outputPath: string,
  _herettoConfig: HerettoConfig,
  log: LogFunction,
  config: Config
): Promise<Record<string, HerettoFileMapping>> {
  const fileMapping: Record<string, HerettoFileMapping> = {};
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
  });

  try {
    // Recursively find all DITA/XML files
    const ditaFiles = findFilesWithExtensions(outputPath, [".dita", ".ditamap", ".xml"]);

    for (const ditaFile of ditaFiles) {
      try {
        const content = fs.readFileSync(ditaFile, "utf-8");
        const parsed = xmlParser.parse(content);

        // Extract image references from DITA content
        const imageRefs = extractImageReferences(parsed);

        for (const imageRef of imageRefs) {
          // Resolve relative path to absolute local path
          const absoluteLocalPath = path.resolve(path.dirname(ditaFile), imageRef);

          if (!fileMapping[absoluteLocalPath]) {
            fileMapping[absoluteLocalPath] = {
              filePath: imageRef,
              sourceFile: ditaFile,
            };
          }
        }
      } catch (parseError) {
        log(
          config,
          "debug",
          `Failed to parse ${ditaFile} for file mapping: ${(parseError as Error).message}`
        );
      }
    }

    log(config, "debug", `Built file mapping with ${Object.keys(fileMapping).length} entries`);
  } catch (error) {
    log(config, "warning", `Failed to build file mapping: ${(error as Error).message}`);
  }

  return fileMapping;
}

/**
 * Recursively finds files with specified extensions.
 * @param dir - Directory to search
 * @param extensions - File extensions to match (e.g., ['.dita', '.xml'])
 * @returns Array of matching file paths
 */
function findFilesWithExtensions(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  try {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results.push(...findFilesWithExtensions(fullPath, extensions));
      } else if (extensions.some((ext) => fullPath.toLowerCase().endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (_error) {
    // Ignore read errors for inaccessible directories
  }

  return results;
}

/**
 * Extracts image references from parsed DITA XML content.
 * Looks for <image> elements with href attributes.
 * @param parsedXml - Parsed XML object
 * @returns Array of image href values
 */
function extractImageReferences(parsedXml: unknown): string[] {
  const refs: string[] = [];

  function traverse(obj: unknown): void {
    if (!obj || typeof obj !== "object") return;

    const record = obj as Record<string, unknown>;

    // Check for image elements
    if (record.image) {
      const images = Array.isArray(record.image) ? record.image : [record.image];
      for (const img of images) {
        const imgRecord = img as Record<string, unknown>;
        if (imgRecord["@_href"]) {
          refs.push(imgRecord["@_href"] as string);
        }
      }
    }

    // Recursively traverse all properties
    for (const key of Object.keys(record)) {
      if (typeof record[key] === "object") {
        traverse(record[key]);
      }
    }
  }

  traverse(parsedXml);
  return refs;
}

/**
 * Searches for a file in Heretto by filename.
 * @param herettoConfig - Heretto integration configuration
 * @param filename - Name of the file to search for
 * @param folderPath - Optional folder path to search within
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns File info with ID and URI, or null if not found
 */
export async function searchFileByName(
  herettoConfig: HerettoConfig,
  filename: string,
  folderPath: string | null,
  log: LogFunction,
  config: Config
): Promise<FileSearchResult | null> {
  const client = createApiClient(herettoConfig);

  try {
    const searchBody: Record<string, unknown> = {
      queryString: filename,
      foldersToSearch: {} as Record<string, boolean>,
      startOffset: 0,
      endOffset: 10,
      searchResultType: "FILES_ONLY",
      addPrefixAndFuzzy: false,
    };

    // If folderPath provided, search within that folder; otherwise search root
    if (folderPath) {
      (searchBody.foldersToSearch as Record<string, boolean>)[folderPath] = true;
    } else {
      // Search in organization root
      (searchBody.foldersToSearch as Record<string, boolean>)[
        `/db/organizations/${herettoConfig.organizationId}/`
      ] = true;
    }

    const response = await client.post("/ezdnxtgen/api/search", searchBody, {
      baseURL: `https://${herettoConfig.organizationId}.heretto.com`,
      headers: { "Content-Type": "application/json" },
    });

    interface SearchHit {
      fileEntity?: {
        ID: string;
        URI: string;
        name: string;
      };
    }

    const data = response.data as { hits?: SearchHit[] };

    if (data.hits && data.hits.length > 0) {
      // Find exact filename match
      const exactMatch = data.hits.find((hit) => hit.fileEntity?.name === filename);

      if (exactMatch?.fileEntity) {
        return {
          fileId: exactMatch.fileEntity.ID,
          filePath: exactMatch.fileEntity.URI,
          name: exactMatch.fileEntity.name,
        };
      }
    }

    return null;
  } catch (error) {
    log(config, "debug", `Failed to search for file "${filename}": ${(error as Error).message}`);
    return null;
  }
}

/**
 * Uploads a file to Heretto CMS.
 * @param herettoConfig - Heretto integration configuration
 * @param fileId - UUID of the file to update
 * @param localFilePath - Local path to the file to upload
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Result object with status and description
 */
export async function uploadFile(
  herettoConfig: HerettoConfig,
  fileId: string,
  localFilePath: string,
  log: LogFunction,
  config: Config
): Promise<UploadResult> {
  const client = createRestApiClient(herettoConfig);

  try {
    // Ensure the local file exists before attempting to read it
    if (!fs.existsSync(localFilePath)) {
      log(config, "warning", `Local file does not exist, cannot upload to Heretto: ${localFilePath}`);
      return {
        status: "FAIL",
        description: `Local file not found: ${localFilePath}`,
      };
    }

    // Read file as binary
    const fileBuffer = fs.readFileSync(localFilePath);

    // Determine content type from file extension
    const ext = path.extname(localFilePath).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".svg") contentType = "image/svg+xml";
    else if (ext === ".webp") contentType = "image/webp";

    log(config, "debug", `Uploading ${localFilePath} to Heretto file ${fileId}`);

    const response = await client.put(`${REST_API_PATH}/${fileId}/content`, fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    if (response.status === 200 || response.status === 201) {
      log(config, "info", `Successfully uploaded ${path.basename(localFilePath)} to Heretto`);
      return {
        status: "PASS",
        description: `File uploaded successfully to Heretto`,
      };
    }

    return {
      status: "FAIL",
      description: `Unexpected response status: ${response.status}`,
    };
  } catch (error) {
    const axiosError = error as { response?: { data?: string }; message: string };
    const errorMessage = axiosError.response?.data || axiosError.message;
    log(config, "warning", `Failed to upload file to Heretto: ${errorMessage}`);
    return {
      status: "FAIL",
      description: `Failed to upload: ${errorMessage}`,
    };
  }
}

interface SourceIntegration {
  fileId?: string;
}

/**
 * Resolves a local file path to a Heretto file ID.
 * First checks file mapping, then searches by filename if needed.
 * @param herettoConfig - Heretto integration configuration
 * @param localFilePath - Local path to the file
 * @param sourceIntegration - Source integration metadata from step
 * @param log - Logging function
 * @param config - Doc Detective config for logging
 * @returns Heretto file ID or null if not found
 */
export async function resolveFileId(
  herettoConfig: HerettoConfig,
  localFilePath: string,
  sourceIntegration: SourceIntegration | undefined,
  log: LogFunction,
  config: Config
): Promise<string | null> {
  // If fileId is already known, use it
  if (sourceIntegration?.fileId) {
    return sourceIntegration.fileId;
  }

  // Check file mapping
  if (herettoConfig.fileMapping && herettoConfig.fileMapping[localFilePath]) {
    const mapping = herettoConfig.fileMapping[localFilePath];
    if (mapping.fileId) {
      return mapping.fileId;
    }
  }

  // Search by filename
  const filename = path.basename(localFilePath);
  const searchResult = await searchFileByName(herettoConfig, filename, null, log, config);

  if (searchResult?.fileId) {
    // Cache the result in file mapping
    if (!herettoConfig.fileMapping) {
      herettoConfig.fileMapping = {};
    }
    herettoConfig.fileMapping[localFilePath] = {
      fileId: searchResult.fileId,
      filePath: searchResult.filePath,
    };
    return searchResult.fileId;
  }

  log(config, "warning", `Could not resolve Heretto file ID for ${localFilePath}`);
  return null;
}
