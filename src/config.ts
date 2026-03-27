import os from "os";
import { validate } from "doc-detective-common";
import { log, loadEnvs, replaceEnvs } from "./utils";
import { loadDescription } from "./openapi";
import type {
  Config,
  FileType,
  OpenApiDefinition,
  Platform,
  MarkupPattern,
} from "./types";

/**
 * Extended FileType for internal use during config processing
 */
interface ExtendedFileType extends FileType {
  extends?: string;
}

/**
 * OpenAPI config with definition loaded
 */
interface OpenApiConfigWithDefinition extends OpenApiDefinition {
  definition?: Record<string, unknown>;
}

// Map of Node-detected platforms to common-term equivalents
const platformMap: Record<string, Platform> = {
  darwin: "mac",
  linux: "linux",
  win32: "windows",
};

/**
 * Deep merge two objects, with override properties taking precedence
 * @param target - The target object to merge into
 * @param override - The override object containing properties to merge
 * @returns A new object with merged properties
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  override: Partial<T>
): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key in override) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      const overrideValue = override[key];
      if (
        overrideValue != null &&
        typeof overrideValue === "object" &&
        !Array.isArray(overrideValue)
      ) {
        // If both target and override have objects at this key, deep merge them
        const targetValue = result[key];
        if (
          targetValue != null &&
          typeof targetValue === "object" &&
          !Array.isArray(targetValue)
        ) {
          result[key] = deepMerge(
            targetValue as Record<string, unknown>,
            overrideValue as Record<string, unknown>
          );
        } else {
          // If target doesn't have an object at this key, just assign the override
          result[key] = deepMerge(
            {} as Record<string, unknown>,
            overrideValue as Record<string, unknown>
          );
        }
      } else {
        // For primitive values, arrays, or null, just override
        result[key] = overrideValue;
      }
    }
  }

  return result as T;
}

// List of default file type definitions
// TODO: Add defaults for all supported files
let defaultFileTypes: Record<string, FileType> = {
  asciidoc_1_0: {
    name: "asciidoc",
    extensions: ["adoc", "asciidoc", "asc"],
    inlineStatements: {
      testStart: ["\\/\\/\\s+\\(\\s*test\\s+([\\s\\S]*?)\\s*\\)"],
      testEnd: ["\\/\\/\\s+\\(\\s*test end\\s*\\)"],
      ignoreStart: ["\\/\\/\\s+\\(\\s*test ignore start\\s*\\)"],
      ignoreEnd: ["\\/\\/\\s+\\(\\s*test ignore end\\s*\\)"],
      step: ["\\/\\/\\s+\\(\\s*step\\s+([\\s\\S]*?)\\s*\\)"],
    },
    markup: [],
  },
  dita_1_0: {
    name: "dita",
    extensions: ["dita", "ditamap", "xml"],
    inlineStatements: {
      testStart: [
        "<\\?doc-detective\\s+test([\\s\\S]*?)\\?>",
        "<!--\\s*test([\\s\\S]+?)-->",
      ],
      testEnd: [
        "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
        "<!--\\s*test end([\\s\\S]+?)-->",
      ],
      ignoreStart: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
        "<!--\\s*test ignore\\s+start\\s*-->",
      ],
      ignoreEnd: [
        "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
        "<!--\\s*test ignore\\s+end\\s*-->",
      ],
      step: [
        "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
        "<!--\\s*step([\\s\\S]+?)-->",
        '<data\\s+name="step"\\s*>([\\s\\S]*?)<\\/data>',
      ],
    },
    markup: [
      // Task Topic - <cmd> with action verbs and UI elements
      // These patterns extract complete actions from DITA task steps
      {
        name: "clickUiControl",
        regex: [
          "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?<uicontrol>([^<]+)<\\/uicontrol>",
        ],
        actions: ["click"],
      },
      {
        name: "typeIntoUiControl",
        regex: [
          "(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s+<userinput>([^<]+)<\\/userinput>\\s+(?:in|into)(?:\\s+the)?\\s+<uicontrol>([^<]+)<\\/uicontrol>",
        ],
        actions: [
          {
            type: {
              keys: "$1",
              selector: "$2",
            },
          },
        ],
      },
      {
        name: "navigateToXref",
        regex: [
          '(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s+<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "runShellCmdWithCodeblock",
        regex: [
          '(?:[Rr]un|[Ee]xecute)\\s+(?:the\\s+)?(?:following\\s+)?(?:command)[^<]*<\\/cmd>\\s*<info>\\s*<codeblock[^>]*outputclass="(?:shell|bash)"[^>]*>([\\s\\S]*?)<\\/codeblock>',
        ],
        actions: [
          {
            runShell: {
              command: "$1",
            },
          },
        ],
      },
      // Inline Elements - for finding UI elements and text
      {
        name: "findUiControl",
        regex: ["<uicontrol>([^<]+)<\\/uicontrol>"],
        actions: ["find"],
      },
      {
        name: "verifyWindowTitle",
        regex: ["<wintitle>([^<]+)<\\/wintitle>"],
        actions: ["find"],
      },
      {
        name: "EnterKey",
        regex: ["(?:[Pp]ress)\\s+<shortcut>Enter<\\/shortcut>"],
        actions: [
          {
            type: {
              keys: "$1",
            },
          },
        ],
      },
      {
        name: "executeCmdName",
        regex: ["(?:[Ee]xecute|[Rr]un)\\s+<cmdname>([^<]+)<\\/cmdname>"],
        actions: [
          {
            runShell: {
              command: "$1",
            },
          },
        ],
      },

      // Links and References - for link validation
      {
        name: "checkExternalXref",
        regex: [
          '<xref\\s+[^>]*scope="external"[^>]*href="(https?:\\/\\/[^"]+)"[^>]*>',
          '<xref\\s+[^>]*href="(https?:\\/\\/[^"]+)"[^>]*scope="external"[^>]*>',
        ],
        actions: ["checkLink"],
      },
      {
        name: "checkHyperlink",
        regex: ['<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },
      {
        name: "checkLinkElement",
        regex: ['<link\\s+href="(https?:\\/\\/[^"]+)"[^>]*>'],
        actions: ["checkLink"],
      },

      // Code Execution
      {
        name: "runShellCodeblock",
        regex: [
          '<codeblock[^>]*outputclass="(?:shell|bash)"[^>]*>([\\s\\S]*?)<\\/codeblock>',
        ],
        actions: [
          {
            runShell: {
              command: "$1",
            },
          },
        ],
      },
      {
        name: "runCode",
        regex: [
          '<codeblock[^>]*outputclass="(python|py|javascript|js)"[^>]*>([\\s\\S]*?)<\\/codeblock>',
        ],
        actions: [
          {
            unsafe: true,
            // This is unsafe because it runs arbitrary code, so it should be used with caution.
            // It is recommended to use this only in trusted environments or with trusted inputs.
            runCode: {
              language: "$1",
              code: "$2",
            },
          },
        ],
      },

      // Legacy patterns for compatibility with existing tests
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+<b>((?:(?!<\\/b>).)+)<\\/b>",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["<b>((?:(?!<\\/b>).)+)<\\/b>"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+<xref\\s+href="(https?:\\/\\/[^"]+)"[^>]*>',
        ],
        actions: ["goTo"],
      },
      {
        name: "screenshotImage",
        regex: [
          '<image\\s+[^>]*outputclass="[^"]*screenshot[^"]*"[^>]*href="([^"]+)"[^>]*\\/>',
          '<image\\s+[^>]*href="([^"]+)"[^>]*outputclass="[^"]*screenshot[^"]*"[^>]*\\/>',
          '<image\\s+[^>]*outputclass="[^"]*screenshot[^"]*"[^>]*href="([^"]+)"[\\s\\S]*?<\\/image>',
          '<image\\s+[^>]*href="([^"]+)"[^>]*outputclass="[^"]*screenshot[^"]*"[\\s\\S]*?<\\/image>',
        ],
        actions: ["screenshot"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
      {
        name: "httpRequestFormat",
        regex: [
          '<codeblock[^>]*outputclass="http"[^>]*>\\s*([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\s*(?:\\r?\\n|&#xA;)((?:[^\\s<]+:\\s+[^\\r\\n<]+(?:\\r?\\n|&#xA;))*)(?:\\s*(?:\\r?\\n|&#xA;)([\\s\\S]*?))?\\s*<\\/codeblock>',
        ],
        actions: [
          {
            httpRequest: {
              method: "$1",
              url: "$2",
              request: {
                headers: "$3",
                body: "$4",
              },
            },
          },
        ],
      },
      {
        name: "runCode",
        regex: [
          '<codeblock[^>]*outputclass="(bash|python|py|javascript|js)"[^>]*>([\\s\\S]*?)<\\/codeblock>',
        ],
        actions: [
          {
            unsafe: true,
            // This is unsafe because it runs arbitrary code, so it should be used with caution.
            // It is recommended to use this only in trusted environments or with trusted inputs.
            runCode: {
              language: "$1",
              code: "$2",
            },
          },
        ],
      },
    ] as MarkupPattern[],
  },
  html_1_0: {
    name: "html",
    extensions: ["html", "htm"],
    inlineStatements: {
      testStart: ["<!--\\s*test\\s+?([\\s\\S]*?)\\s*-->"],
      testEnd: ["<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->"],
      ignoreStart: ["<!--\\s*test ignore start\\s*-->"],
      ignoreEnd: ["<!--\\s*test ignore end\\s*-->"],
      step: ["<!--\\s*step\\s+?([\\s\\S]*?)\\s*-->"],
    },
    markup: [],
  },
  markdown_1_0: {
    name: "markdown",
    extensions: ["md", "markdown", "mdx"],
    inlineStatements: {
      testStart: [
        "{\\/\\*\\s*test\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
        // CommonMark comment syntax with parentheses: [comment]: # (test ...)
        "\\[comment\\]:\\s+#\\s+\\(test\\s*(.*?)\\s*\\)",
        "\\[comment\\]:\\s+#\\s+\\(test start\\s*(.*?)\\s*\\)",
        // CommonMark comment syntax with single quotes: [comment]: # 'test ...'
        "\\[comment\\]:\\s+#\\s+'test\\s*(.*?)\\s*'",
        "\\[comment\\]:\\s+#\\s+'test start\\s*(.*?)\\s*'",
        // CommonMark comment syntax with double quotes: [comment]: # "test ..."
        // Uses (?:[^"\\\\]|\\\\.)* to handle escaped quotes within the content
        '\\[comment\\]:\\s+#\\s+"test\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
        '\\[comment\\]:\\s+#\\s+"test start\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
      testEnd: [
        "{\\/\\*\\s*test end\\s*\\*\\/}",
        "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
        // CommonMark comment syntax with parentheses
        "\\[comment\\]:\\s+#\\s+\\(test end\\)",
        // CommonMark comment syntax with single quotes
        "\\[comment\\]:\\s+#\\s+'test end'",
        // CommonMark comment syntax with double quotes
        '\\[comment\\]:\\s+#\\s+"test end"',
      ],
      ignoreStart: [
        "{\\/\\*\\s*test ignore start\\s*\\*\\/}",
        "<!--\\s*test ignore start\\s*-->",
        // CommonMark comment syntax with parentheses
        "\\[comment\\]:\\s+#\\s+\\(test ignore start\\)",
        // CommonMark comment syntax with single quotes
        "\\[comment\\]:\\s+#\\s+'test ignore start'",
        // CommonMark comment syntax with double quotes
        '\\[comment\\]:\\s+#\\s+"test ignore start"',
      ],
      ignoreEnd: [
        "{\\/\\*\\s*test ignore end\\s*\\*\\/}",
        "<!--\\s*test ignore end\\s*-->",
        // CommonMark comment syntax with parentheses
        "\\[comment\\]:\\s+#\\s+\\(test ignore end\\)",
        // CommonMark comment syntax with single quotes
        "\\[comment\\]:\\s+#\\s+'test ignore end'",
        // CommonMark comment syntax with double quotes
        '\\[comment\\]:\\s+#\\s+"test ignore end"',
      ],
      step: [
        "{\\/\\*\\s*step\\s+?([\\s\\S]*?)\\s*\\*\\/}",
        "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
        // CommonMark comment syntax with parentheses: [comment]: # (step ...)
        "\\[comment\\]:\\s+#\\s+\\(step\\s*(.*?)\\s*\\)",
        // CommonMark comment syntax with single quotes: [comment]: # 'step ...'
        "\\[comment\\]:\\s+#\\s+'step\\s*(.*?)\\s*'",
        // CommonMark comment syntax with double quotes: [comment]: # "step ..."
        // Uses (?:[^"\\\\]|\\\\.)* to handle escaped quotes within the content
        '\\[comment\\]:\\s+#\\s+"step\\s*((?:[^"\\\\]|\\\\.)*)\\s*"',
      ],
    },
    markup: [
      {
        name: "checkHyperlink",
        regex: [
          '(?<!\\!)\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["checkLink"],
      },
      {
        name: "clickOnscreenText",
        regex: [
          "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\b\\s+\\*\\*((?:(?!\\*\\*).)+)\\*\\*",
        ],
        actions: ["click"],
      },
      {
        name: "findOnscreenText",
        regex: ["\\*\\*((?:(?!\\*\\*).)+)\\*\\*"],
        actions: ["find"],
      },
      {
        name: "goToUrl",
        regex: [
          '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b\\s+\\[[^\\]]+\\]\\(\\s*(https?:\\/\\/[^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)',
        ],
        actions: ["goTo"],
      },
      {
        name: "screenshotImage",
        regex: [
          '!\\[[^\\]]*\\]\\(\\s*([^\\s)]+)(?:\\s+"[^"]*")?\\s*\\)\\s*\\{(?=[^}]*\\.screenshot)[^}]*\\}',
        ],
        actions: ["screenshot"],
      },
      {
        name: "typeText",
        regex: ['\\b(?:press|enter|type)\\b\\s+"([^"]+)"'],
        actions: ["type"],
      },
      {
        name: "httpRequestFormat",
        regex: [
          "```(?:http)?\\r?\\n([A-Z]+)\\s+([^\\s]+)(?:\\s+HTTP\\/[\\d.]+)?\\r?\\n((?:[^\\s]+:\\s+[^\\s]+\\r?\\n)*)?(?:\\s+([\\s\\S]*?)\\r?\\n+)?```",
        ],
        actions: [
          {
            httpRequest: {
              method: "$1",
              url: "$2",
              request: {
                headers: "$3",
                body: "$4",
              },
            },
          },
        ],
      },
      {
        name: "runCode",
        regex: [
          "```(bash|python|py|javascript|js)(?![^\\r\\n]*testIgnore)[^\\r\\n]*\\r?\\n([\\s\\S]*?)\\r?\\n```",
        ],
        actions: [
          {
            unsafe: true,
            // This is unsafe because it runs arbitrary code, so it should be used with caution.
            // It is recommended to use this only in trusted environments or with trusted inputs.
            runCode: {
              language: "$1",
              code: "$2",
            },
          },
        ],
      },
    ] as MarkupPattern[],
  },
};

// Set keyword versions
defaultFileTypes = {
  ...defaultFileTypes,
  markdown: defaultFileTypes.markdown_1_0,
  asciidoc: defaultFileTypes.asciidoc_1_0,
  html: defaultFileTypes.html_1_0,
  dita: defaultFileTypes.dita_1_0,
};

/**
 * Resolves the concurrentRunners configuration value from various input formats
 * to a concrete integer for the core execution engine.
 *
 * @param config - The configuration object
 * @returns The resolved concurrent runners value
 */
export function resolveConcurrentRunners(
  config: Config
): number {
  if (config.concurrentRunners === true) {
    // Cap at 4 only for the boolean convenience option
    return Math.min(os.cpus().length, 4);
  }
  // Respect explicit numeric values and default
  return (config.concurrentRunners as number) || 1;
}

/**
 * Sets up and validates the configuration object for Doc Detective
 * @async
 * @param config - The configuration object to process
 * @returns The processed and validated configuration object
 * @throws Will throw error if configuration is invalid
 */
export async function setConfig({
  config,
}: {
  config: Config;
}): Promise<Config> {
  // Set environment variables from file
  if (config.loadVariables) {
    const loadVariablesArray = Array.isArray(config.loadVariables) 
      ? config.loadVariables 
      : [config.loadVariables];
    for (const envFile of loadVariablesArray) {
      await loadEnvs(envFile);
    }
  }

  // Load environment variables for `config`
  config = replaceEnvs(config) as Config;

  // Apply config overrides from DOC_DETECTIVE environment variable
  if (process.env.DOC_DETECTIVE) {
    try {
      const docDetectiveEnv = JSON.parse(process.env.DOC_DETECTIVE) as {
        config?: Partial<Config>;
      };
      if (
        docDetectiveEnv.config &&
        typeof docDetectiveEnv.config === "object"
      ) {
        // Apply config overrides using deep merge to preserve nested properties
        config = deepMerge(
          config as Record<string, unknown>,
          docDetectiveEnv.config as Record<string, unknown>
        ) as Config;
      }
    } catch (error) {
      log(
        config,
        "warning",
        `Invalid JSON in DOC_DETECTIVE environment variable: ${(error as Error).message}. Ignoring config overrides.`
      );
    }
  }

  // Validate inbound `config`.
  const validityCheck = validate({ schemaKey: "config_v3", object: config });
  if (!validityCheck.valid) {
    // TODO: Improve error message reporting.
    log(
      config,
      "error",
      `Invalid config object: ${validityCheck.errors}. Exiting.`
    );
    throw new Error(`Invalid config object: ${validityCheck.errors}. Exiting.`);
  }
  config = validityCheck.object as Config;

  // Replace fileType strings with objects
  const fileTypesArray = config.fileTypes as unknown as (string | FileType)[];
  config.fileTypes = fileTypesArray.map((fileType) => {
    if (typeof fileType === "object") return fileType;
    const fileTypeObject = defaultFileTypes[fileType];
    if (typeof fileTypeObject !== "undefined") return fileTypeObject;
    log(
      config,
      "error",
      `Invalid config. "${fileType}" isn't a valid fileType value.`
    );
    throw new Error(
      `Invalid config. "${fileType}" isn't a valid fileType value.`
    );
  }) as FileType[];

  // TODO: Combine extended fileTypes with overrides

  // Standardize value formats
  if (typeof config.input === "string") config.input = [config.input];
  if (typeof config.beforeAny === "string") {
    const beforeAny = config.beforeAny;
    if (beforeAny === "") {
      config.beforeAny = [];
    } else {
      config.beforeAny = [beforeAny];
    }
  }
  if (typeof config.afterAll === "string") {
    const afterAll = config.afterAll;
    if (afterAll === "") {
      config.afterAll = [];
    } else {
      config.afterAll = [afterAll];
    }
  }
  if (typeof config.fileTypes === "string") {
    config.fileTypes = [config.fileTypes];
  }

  const fileTypes = config.fileTypes as unknown as ExtendedFileType[];
  config.fileTypes = fileTypes.map((fileType) => {
    if (fileType.inlineStatements) {
      if (typeof fileType.inlineStatements.testStart === "string")
        fileType.inlineStatements.testStart = [
          fileType.inlineStatements.testStart,
        ];
      if (typeof fileType.inlineStatements.testEnd === "string")
        fileType.inlineStatements.testEnd = [fileType.inlineStatements.testEnd];
      if (typeof fileType.inlineStatements.ignoreStart === "string")
        fileType.inlineStatements.ignoreStart = [
          fileType.inlineStatements.ignoreStart,
        ];
      if (typeof fileType.inlineStatements.ignoreEnd === "string")
        fileType.inlineStatements.ignoreEnd = [
          fileType.inlineStatements.ignoreEnd,
        ];
      if (typeof fileType.inlineStatements.step === "string")
        fileType.inlineStatements.step = [fileType.inlineStatements.step];
    }
    if (fileType.markup) {
      fileType.markup = fileType.markup.map((markup) => {
        if (typeof markup?.regex === "string")
          markup.regex = [markup.regex];
        return markup;
      });
    }
    if (fileType.extends) {
      // If fileType extends another, merge the properties
      const extendedFileTypeRaw = defaultFileTypes[fileType.extends];
      if (!extendedFileTypeRaw) {
        log(
          config,
          "error",
          'Invalid config. fileType.extends references unknown fileType definition: "' +
            fileType.extends +
            '".'
        );
        throw new Error(
          'Invalid config. fileType.extends references unknown fileType definition: "' +
            fileType.extends +
            '".'
        );
      }
      const extendedFileType = JSON.parse(
        JSON.stringify(extendedFileTypeRaw)
      ) as FileType;
      if (extendedFileType) {
        if (!fileType.name) {
          fileType.name = extendedFileType.name;
        }

        // Merge extensions
        if (extendedFileType?.extensions) {
          fileType.extensions = [
            ...new Set([
              ...(extendedFileType.extensions || []),
              ...(fileType.extensions || []),
            ]),
          ];
        }

        // Merge property values for inlineStatements children
        if (extendedFileType?.inlineStatements) {
          if (fileType.inlineStatements === undefined) {
            fileType.inlineStatements = {
              testStart: [],
              testEnd: [],
              ignoreStart: [],
              ignoreEnd: [],
              step: [],
            };
          }
          // Merge each inlineStatements property using Set to ensure uniqueness
          const keys = [
            "testStart",
            "testEnd",
            "ignoreStart",
            "ignoreEnd",
            "step",
          ] as const;
          for (const key of keys) {
            if (
              extendedFileType?.inlineStatements?.[key] ||
              fileType?.inlineStatements?.[key]
            ) {
              fileType.inlineStatements[key] = [
                ...new Set([
                  ...(extendedFileType?.inlineStatements?.[key] || []),
                  ...(fileType?.inlineStatements?.[key] || []),
                ]),
              ];
            }
          }
        }

        // Merge property values for markup array, overwriting when `name` matches
        if (extendedFileType?.markup) {
          fileType.markup = fileType.markup || [];
          extendedFileType.markup.forEach((extendedMarkup) => {
            const existingMarkupIndex = fileType.markup!.findIndex(
              (markup) => markup.name === extendedMarkup.name
            );
            if (existingMarkupIndex === -1) {
              // Add to markup array
              fileType.markup!.push(extendedMarkup);
            }
          });
        }
      }
    }

    return fileType;
  });

  // Detect current environment.
  config.environment = getEnvironment();

  // Resolve concurrent runners configuration
  config.concurrentRunners = resolveConcurrentRunners(config);

  // TODO: Revise loadDescriptions() so it doesn't mutate the input but instead returns an updated object
  await loadDescriptions(config);

  return config;
}

/**
 * Loads OpenAPI descriptions for all configured OpenAPI integrations.
 *
 * @async
 * @param config - The configuration object.
 * @returns A promise that resolves when all descriptions are loaded.
 *
 * @remarks
 * This function modifies the input config object by:
 * 1. Adding a 'definition' property to each OpenAPI configuration with the loaded description.
 * 2. Removing any OpenAPI configurations where the description failed to load.
 */
async function loadDescriptions(config: Config): Promise<void> {
  if (config?.integrations?.openApi) {
    for (const openApiConfig of config.integrations
      .openApi as OpenApiConfigWithDefinition[]) {
      try {
        openApiConfig.definition = await loadDescription(
          openApiConfig.descriptionPath!
        );
      } catch (error) {
        log(
          config,
          "error",
          `Failed to load OpenAPI description from ${openApiConfig.descriptionPath}: ${(error as Error).message}`
        );
        // Remove the failed OpenAPI configuration
        config.integrations.openApi = config.integrations.openApi!.filter(
          (item) => item !== openApiConfig
        );
      }
    }
  }
}

// Detect aspects of the environment running Doc Detective.
function getEnvironment(): Config["environment"] {
  return {
    arch: os.arch(),
    platform: platformMap[process.platform],
    workingDirectory: process.cwd(),
  };
}
