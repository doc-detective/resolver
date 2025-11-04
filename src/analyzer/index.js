/**
 * Main analyzer module for document analysis
 */

const { parseDocument, isAnalyzableCode } = require('./document-parser');
const { buildPrompt } = require('./prompt-builder');
const { analyzeSegment } = require('../llm/provider');
const { addDefensiveActions, tagActionsWithSource, validateActions } = require('./post-processor');

/**
 * Configuration for the static analyzer
 * @typedef {Object} AnalyzerConfig
 * @property {'anthropic'|'google'|'openai'} provider - LLM provider to use
 * @property {string} apiKey - API key for the provider
 * @property {string} [model] - Model name (uses provider default if not specified)
 * @property {number} [temperature=0.3] - Temperature for generation
 * @property {number} [maxTokens=4000] - Maximum tokens to generate
 */

/**
 * Result of analyzing a single segment
 * @typedef {Object} SegmentAnalysisResult
 * @property {Array} actions - Extracted actions
 * @property {Object} segment - Source segment
 * @property {Object} metadata - Analysis metadata (tokens, latency)
 */

/**
 * Complete analysis result for a document
 * @typedef {Object} DocumentAnalysisResult
 * @property {Array} actions - All valid extracted actions
 * @property {Array} segments - Per-segment analysis results
 * @property {Object} summary - Analysis summary statistics
 */

/**
 * Analyzes a complete document and returns extracted actions
 * @param {string} document - The document to analyze
 * @param {AnalyzerConfig} config - Analyzer configuration
 * @param {Object} schemas - Action schemas for validation
 * @returns {Promise<DocumentAnalysisResult>} Analysis result
 */
async function analyzeDocument(document, config, schemas) {
  // Validate inputs
  if (!document || typeof document !== 'string') {
    throw new Error('Document must be a non-empty string');
  }
  
  if (!config || !config.provider || !config.apiKey) {
    throw new Error('Config must include provider and apiKey');
  }
  
  // 1. Parse document into segments
  const segments = parseDocument(document);
  
  // 2. Analyze each segment
  const results = [];
  const allActions = [];
  
  for (const segment of segments) {
    // Skip non-analyzable code blocks
    if (segment.type === 'code' && !isAnalyzableCode(segment)) {
      continue;
    }
    
    // Skip empty segments
    if (!segment.content.trim()) {
      continue;
    }
    
    try {
      // Build prompt
      const prompt = buildPrompt(segment, schemas);
      
      // Call LLM
      const { actions, metadata } = await analyzeSegment(segment, prompt, config);
      
      // Tag actions with source
      const taggedActions = tagActionsWithSource(actions, segment);
      
      results.push({
        actions: taggedActions,
        segment,
        metadata,
      });
      
      allActions.push(...taggedActions);
    } catch (error) {
      console.error(`Error analyzing segment at line ${segment.lineNumber}: ${error.message}`);
      // Continue with other segments
      results.push({
        actions: [],
        segment,
        metadata: {
          error: error.message,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: 0
        }
      });
    }
  }
  
  // 3. Post-process actions
  const enhancedActions = addDefensiveActions(allActions);
  
  // 4. Validate actions
  const { valid, invalid } = validateActions(enhancedActions, schemas);
  
  if (invalid.length > 0) {
    console.warn(`${invalid.length} actions failed validation`);
    invalid.forEach((item, idx) => {
      console.warn(`  [${idx + 1}] Action: ${item.action?.action}, Error:`, item.error);
    });
  }
  
  // 5. Build summary
  const summary = {
    totalActions: valid.length,
    totalSegments: segments.length,
    analyzedSegments: results.length,
    skippedSegments: segments.length - results.length,
    totalTokens: results.reduce((sum, r) => sum + (r.metadata.promptTokens || 0) + (r.metadata.completionTokens || 0), 0),
    totalLatencyMs: results.reduce((sum, r) => sum + (r.metadata.latencyMs || 0), 0),
  };
  
  return {
    actions: valid,
    segments: results,
    summary,
  };
}

module.exports = {
  analyzeDocument
};
