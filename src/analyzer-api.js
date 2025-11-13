/**
 * Analyzer public API
 * Main export for static documentation analysis
 */

const { analyzeDocument } = require('./analyzer/index');
const { schemas } = require('doc-detective-common');

/**
 * Analyzes a document and extracts Doc Detective action steps
 * 
 * @param {string} document - The documentation to analyze
 * @param {Object} config - Analyzer configuration
 * @param {string} config.provider - LLM provider ('anthropic', 'google', or 'openai')
 * @param {string} config.apiKey - API key for the LLM provider
 * @param {string} [config.model] - Model name (uses provider default if not specified)
 * @param {number} [config.temperature=0.3] - Temperature for generation (0-1)
 * @param {number} [config.maxTokens=4000] - Maximum tokens to generate
 * @returns {Promise<Object>} Analysis result with actions, segments, and summary
 * 
 * @example
 * const { analyze } = require('doc-detective-resolver/analyzer');
 * 
 * const result = await analyze(
 *   'Navigate to https://example.com and click Login',
 *   {
 *     provider: 'anthropic',
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   }
 * );
 * 
 * console.log(`Extracted ${result.summary.totalActions} actions`);
 */
async function analyze(document, config) {
  // Load schemas - use all v3 schemas
  const actionSchemas = schemas;
  
  // Run analysis
  return analyzeDocument(document, config, actionSchemas);
}

module.exports = {
  analyze
};
