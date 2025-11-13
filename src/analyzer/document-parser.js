/**
 * Document parser module for splitting documentation into analyzable segments
 */

/**
 * A segment of documentation to analyze
 * @typedef {Object} DocumentSegment
 * @property {'text'|'code'} type - The type of segment
 * @property {string} content - The content of the segment
 * @property {string} [language] - The programming language (for code segments)
 * @property {number} lineNumber - Starting line number in the original document
 */

/**
 * Splits a document into analyzable segments while preserving
 * code blocks intact. Code blocks should not be analyzed as
 * instructions unless they contain shell commands.
 * 
 * @param {string} document - The document to parse
 * @returns {DocumentSegment[]} Array of document segments
 */
function parseDocument(document) {
  if (!document || typeof document !== 'string') {
    return [];
  }

  const segments = [];
  const lines = document.split('\n');
  let currentLine = 1;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Check for code block start (```language)
    const codeBlockMatch = line.match(/^```(\w+)?/);
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || '';
      const codeStartLine = currentLine;
      const codeLines = [];
      i++; // Skip the opening ```
      currentLine++;

      // Collect code block lines until closing ```
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
        currentLine++;
      }

      if (codeLines.length > 0) {
        segments.push({
          type: 'code',
          content: codeLines.join('\n'),
          language: language.toLowerCase(),
          lineNumber: codeStartLine
        });
      }

      i++; // Skip the closing ```
      currentLine++;
      continue;
    }

    // Collect text paragraph (until empty line or code block)
    if (line.trim()) {
      const textStartLine = currentLine;
      const textLines = [];

      while (i < lines.length) {
        const currentTextLine = lines[i];
        
        // Stop at code block
        if (currentTextLine.match(/^```/)) {
          break;
        }
        
        // Stop at empty line (paragraph boundary)
        if (!currentTextLine.trim()) {
          break;
        }

        textLines.push(currentTextLine);
        i++;
        currentLine++;
      }

      if (textLines.length > 0) {
        segments.push({
          type: 'text',
          content: textLines.join('\n'),
          lineNumber: textStartLine
        });
      }
      continue;
    }

    // Empty line - skip
    i++;
    currentLine++;
  }

  return segments;
}

/**
 * Determines if a code block contains executable instructions
 * that should be analyzed (e.g., shell commands).
 * 
 * @param {DocumentSegment} segment - The segment to check
 * @returns {boolean} True if the code should be analyzed
 */
function isAnalyzableCode(segment) {
  if (segment.type !== 'code') {
    return false;
  }

  const shellLanguages = ['bash', 'sh', 'shell', 'zsh', 'fish'];
  return shellLanguages.includes(segment.language);
}

module.exports = {
  parseDocument,
  isAnalyzableCode
};
