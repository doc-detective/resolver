/**
 * LLM provider module for interacting with various AI providers
 */

const { generateText } = require('ai');
const { anthropic } = require('@ai-sdk/anthropic');
const { google } = require('@ai-sdk/google');
const { openai } = require('@ai-sdk/openai');

/**
 * Creates an LLM provider instance based on configuration
 * @param {Object} config - Analyzer configuration
 * @param {string} config.provider - Provider name ('anthropic', 'google', 'openai', or 'local')
 * @param {string} [config.model] - Model name (uses default if not specified)
 * @param {string} [config.baseURL] - Base URL for local provider (default: http://localhost:8080/v1)
 * @returns {Object} Provider instance
 */
function createProvider(config) {
  switch (config.provider) {
    case 'anthropic':
      return anthropic(config.model || 'claude-sonnet-4-20250514', {
        apiKey: config.apiKey
      });
    case 'google':
      return google(config.model || 'gemini-2.0-flash-exp', {
        apiKey: config.apiKey
      });
    case 'openai':
      return openai(config.model || 'gpt-4o', {
        apiKey: config.apiKey
      });
    case 'local':
      // Local llama.cpp server with OpenAI-compatible API
      return openai(config.model || 'local-model', {
        apiKey: config.apiKey || 'local-testing-key',
        baseURL: config.baseURL || 'http://localhost:8080/v1'
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
    const result = await generateText({
      model,
      prompt,
      temperature: config.temperature ?? 0.3,
      maxTokens: config.maxTokens ?? 4000,
    });
    
    const latencyMs = Date.now() - startTime;
    
    // Parse JSON response
    let actions = [];
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      let jsonText = result.text.trim();
      
      // Try to find JSON array in the response
      const jsonMatch = jsonText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (jsonMatch) {
        jsonText = jsonMatch[0];
      }
      
      actions = JSON.parse(jsonText);
      
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
  analyzeSegment
};
