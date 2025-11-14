/**
 * LLM provider module for interacting with various AI providers
 */
const { schemas } = require("doc-detective-common");
const { generateText, generateObject, jsonSchema } = require("ai");
const { createAnthropic } = require("@ai-sdk/anthropic");
const { google } = require("@ai-sdk/google");
const { createOpenAI } = require("@ai-sdk/openai");
const { createOllama } = require("ollama-ai-provider-v2");

/**
 * Creates an LLM provider instance based on configuration
 * @param {Object} config - Analyzer configuration
 * @param {string} config.provider - Provider name ('anthropic', 'google', 'openai', 'ollama', or 'local')
 * @param {string} [config.model] - Model name (uses default if not specified)
 * @param {string} [config.baseUrl] - Base URL for local/ollama provider
 * @returns {Object} Provider instance
 */
function createProvider(config) {
  switch (config.provider) {
    case "anthropic":
      const anthropic = createAnthropic({
        apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(config.model || "claude-haiku-4-5-20251001", {});
    case "google":
      return google(config.model || "gemini-2.0-flash-exp", {
        apiKey: config.apiKey,
      });
    case "openai":
      const openai = createOpenAI({
        baseURL: config.baseUrl || "https://api.openai.com/v1",
        apiKey: config.apiKey || process.env.OPENAI_API_KEY || "",
      });
      return openai(config.model || "gpt-5");
    case "ollama":
      const ollama = createOllama({
        baseURL: config.baseUrl || "http://localhost:11434/api",
      });
      return ollama(config.model || "qwen3:4b");
    case "local":
      // Local llama.cpp server with OpenAI-compatible API
      return openai(config.model || "local-model", {
        apiKey: config.apiKey || "local-testing-key",
        baseURL: config.baseURL || "http://localhost:8080/v1",
      });
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Generates action steps for a segment using the configured LLM
 * @param {Object} segment - Document segment to analyze
 * @param {string} prompt - The prompt to send to the LLM
 * @param {Object} config - Analyzer configuration
 * @param {string} config.provider - Provider name
 * @param {string} config.apiKey - API key for the provider
 * @param {number} [config.temperature=0.3] - Temperature for generation
 * @param {number} [config.maxTokens=4000] - Maximum tokens to generate
 * @returns {Promise<{actions: Array, metadata: Object}>} Generated actions and metadata
 */
async function analyzeSegment(segment, prompt, config) {
  const startTime = Date.now();

  const model = createProvider(config);

  try {
    // const result = await generateText({
    //   model,
    //   prompt,
    //   temperature: config.temperature ?? 0.3,
    //   maxTokens: config.maxTokens ?? 4000,
    // });
    const schema = jsonSchema({
      type: "object",
      properties: {
        steps: {
          type: "array",
          description: "Array of Doc Detective v3 steps",
          items: schemas.step_v3,
        },
      },
    });
    const result = await generateObject({
      model,
      prompt,
      temperature: config.temperature ?? 0.1,
      maxTokens: config.maxTokens ?? 4000,
      output: "object",
      mode: "json",
      schema: schema,
      schemaDescription: "An array of Doc Detective v3 steps.",
    });

    const latencyMs = Date.now() - startTime;

    // Parse JSON response
    let actions = [];
    try {
      if (!result.object || !result.object.steps) {
        throw new Error("No 'steps' field in LLM response object");
      }
      if (typeof result.object.steps === "string") {
        try {
          result.object.steps = JSON.parse(result.object.steps);
        } catch (parseError) {
          throw new Error(
            `Failed to parse 'steps' field as JSON: ${parseError.message}`
          );
        }
      }
      actions = result.object.steps;
      // Ensure we have an array
      if (!Array.isArray(actions)) {
        actions = [actions];
      }
    } catch (error) {
      console.error(`Failed to parse LLM response: ${error.message}`);
      console.error(`Response text: ${result.text.substring(0, 500)}...`);
      // Return empty actions array instead of throwing
      actions = [];
    }

    return {
      actions,
      metadata: {
        promptTokens: result.usage?.promptTokens ?? 0,
        completionTokens: result.usage?.completionTokens ?? 0,
        latencyMs,
      },
    };
  } catch (error) {
    console.error(`LLM API error: ${error.message}`);
    throw error;
  }
}

module.exports = {
  createProvider,
  analyzeSegment,
};
