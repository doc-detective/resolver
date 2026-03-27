/**
 * Shared TypeScript interfaces for Doc Detective Resolver
 */

// Re-export types from doc-detective-common if needed
// import type { Config as CommonConfig } from "doc-detective-common";

/**
 * Log levels supported by the logging system
 */
export type LogLevel = "debug" | "info" | "warning" | "error";

/**
 * Platform identifiers
 */
export type Platform = "mac" | "linux" | "windows";

/**
 * Browser names supported by Doc Detective
 */
export type BrowserName = "chromium" | "firefox" | "webkit" | "safari";

/**
 * Browser configuration
 */
export interface BrowserConfig {
  name: BrowserName;
  headless?: boolean;
  [key: string]: unknown;
}

/**
 * Context for test execution
 */
export interface TestContext {
  contextId?: string;
  platform?: Platform;
  browser?: BrowserConfig;
  unsafe?: boolean;
  openApi?: OpenApiDefinition[];
  steps?: Step[];
}

/**
 * Run-on context configuration
 */
export interface RunOnContext {
  platforms?: Platform[] | string[];
  browsers?: BrowserConfig[] | BrowserName[] | string[];
}

/**
 * File type definition for parsing
 */
export interface FileType {
  name: string;
  extensions: string[];
  inlineStatements: {
    testStart: string[];
    testEnd: string[];
    ignoreStart: string[];
    ignoreEnd: string[];
    step: string[];
  };
  markup?: MarkupPattern[];
}

/**
 * Markup pattern for extracting test steps from content
 */
export interface MarkupPattern {
  name: string;
  regex: string[];
  actions?: Record<string, unknown>[];
}

/**
 * OpenAPI definition reference
 */
export interface OpenApiDefinition {
  name: string;
  descriptionPath?: string;
  definition?: OpenApiDescription;
  server?: string;
}

/**
 * OpenAPI description object (dereferenced)
 */
export interface OpenApiDescription {
  openapi?: string;
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  servers?: Array<{ url: string; description?: string }>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  [key: string]: unknown;
}

/**
 * OpenAPI operation
 */
export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content: Record<string, { schema?: Record<string, unknown>; examples?: Record<string, unknown> }>;
    required?: boolean;
  };
  responses?: Record<string, OpenApiResponse>;
  [key: string]: unknown;
}

/**
 * OpenAPI parameter
 */
export interface OpenApiParameter {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  schema?: Record<string, unknown>;
  example?: unknown;
  examples?: Record<string, { value: unknown }>;
  [key: string]: unknown;
}

/**
 * OpenAPI response
 */
export interface OpenApiResponse {
  description?: string;
  headers?: Record<string, { schema?: Record<string, unknown>; example?: unknown }>;
  content?: Record<string, { schema?: Record<string, unknown>; examples?: Record<string, unknown> }>;
}

/**
 * Test step action
 */
export interface Step {
  action?: string;
  [key: string]: unknown;
}

/**
 * Detected test specification
 */
export interface DetectedTest {
  testId?: string;
  description?: string;
  steps: Step[];
  runOn?: RunOnContext[];
  openApi?: OpenApiDefinition[];
  unsafe?: boolean;
  [key: string]: unknown;
}

/**
 * Detected test specification (file-level)
 */
export interface DetectedSpec {
  specId?: string;
  file?: string;
  tests: DetectedTest[];
  runOn?: RunOnContext[];
  openApi?: OpenApiDefinition[];
  [key: string]: unknown;
}

/**
 * Resolved test with contexts
 */
export interface ResolvedTest {
  testId: string;
  description?: string;
  runOn: RunOnContext[];
  openApi: OpenApiDefinition[];
  contexts: TestContext[];
  [key: string]: unknown;
}

/**
 * Resolved test specification
 */
export interface ResolvedSpec {
  specId: string;
  file?: string;
  runOn: RunOnContext[];
  openApi: OpenApiDefinition[];
  tests: ResolvedTest[];
  [key: string]: unknown;
}

/**
 * Collection of resolved tests
 */
export interface ResolvedTests {
  resolvedTestsId: string;
  config: Config;
  specs: ResolvedSpec[];
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  send?: boolean;
  userId?: string;
}

/**
 * Heretto integration configuration
 */
export interface HerettoConfig {
  name: string;
  organizationId: string;
  username: string;
  apiToken: string;
  scenarioName?: string;
  uploadOnChange?: boolean;
  resourceDependencies?: Record<string, HerettoResourceInfo>;
  fileMapping?: Record<string, HerettoFileMapping>;
}

/**
 * Heretto resource information
 */
export interface HerettoResourceInfo {
  uuid: string;
  fullPath?: string;
  name?: string;
  parentFolderId?: string;
  isDitamap?: boolean;
}

/**
 * Heretto file mapping entry
 */
export interface HerettoFileMapping {
  fileId?: string;
  filePath?: string;
  sourceFile?: string;
  name?: string;
}

/**
 * Integration configurations
 */
export interface IntegrationsConfig {
  openApi?: OpenApiDefinition[];
  heretto?: HerettoConfig[];
}

/**
 * Environment variables record
 */
export interface Environment {
  [key: string]: string | undefined;
}

/**
 * Main configuration object
 */
export interface Config {
  input?: string | string[];
  output?: string;
  recursive?: boolean;
  logLevel?: LogLevel;
  runOn?: RunOnContext[];
  fileTypes?: FileType[] | (string | FileType)[];
  integrations?: IntegrationsConfig;
  telemetry?: TelemetryConfig;
  environment?: RuntimeEnvironment;
  envVariables?: Environment;
  concurrentRunners?: number | boolean;
  detectSteps?: boolean;
  beforeAny?: string | string[];
  afterAll?: string | string[];
  loadVariables?: string | string[];
  _herettoPathMapping?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Runtime environment info
 */
export interface RuntimeEnvironment {
  arch: string;
  platform: Platform | undefined;
  workingDirectory: string;
}

/**
 * Qualified file information
 */
export interface QualifiedFile {
  path: string;
  content: string;
  fileType: FileType;
}

/**
 * Arazzo source description
 */
export interface ArazzoSourceDescription {
  name: string;
  type: "openapi" | "arazzo";
  url: string;
}

/**
 * Arazzo workflow step
 */
export interface ArazzoWorkflowStep {
  stepId?: string;
  operationId?: string;
  operationPath?: string;
  workflowId?: string;
  parameters?: Array<{
    name: string;
    in: string;
    value: unknown;
  }>;
  requestBody?: {
    payload: unknown;
  };
  successCriteria?: Array<{
    condition: string;
    context?: string;
  }>;
}

/**
 * Arazzo workflow
 */
export interface ArazzoWorkflow {
  workflowId: string;
  summary?: string;
  description?: string;
  steps: ArazzoWorkflowStep[];
}

/**
 * Arazzo description object
 */
export interface ArazzoDescription {
  arazzo?: string;
  info: {
    title?: string;
    summary?: string;
    description?: string;
    version?: string;
  };
  sourceDescriptions: ArazzoSourceDescription[];
  workflows: ArazzoWorkflow[];
}

/**
 * Telemetry data object
 */
export interface TelemetryData {
  distribution?: string;
  dist_interface?: string;
  dist_version?: string;
  dist_platform?: string;
  dist_platform_version?: string;
  dist_platform_arch?: string;
  dist_deployment?: string;
  dist_deployment_version?: string;
  core_version?: string;
  core_platform?: string;
  core_platform_version?: string;
  core_platform_arch?: string;
  core_deployment?: string;
  core_deployment_version?: string;
  [key: string]: unknown;
}

/**
 * Compiled OpenAPI example
 */
export interface CompiledExample {
  url: string;
  request: {
    parameters: Record<string, unknown>;
    headers: Record<string, unknown>;
    body: unknown;
  };
  response: {
    headers: Record<string, unknown>;
    body: unknown;
  };
}

/**
 * OpenAPI operation result from getOperation
 */
export interface OperationResult {
  path: string;
  method: string;
  definition: OpenApiOperation;
  schemas: {
    request?: Record<string, unknown>;
    response?: Record<string, unknown>;
  };
  example: CompiledExample;
}

/**
 * Test results for telemetry
 */
export interface TestResults {
  summary: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * File fetch result
 */
export interface FetchResult {
  content: string;
  path: string;
}

/**
 * Spawn command result
 */
export interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
