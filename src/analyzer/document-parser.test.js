const { expect } = require('chai');
const { parseDocument, isAnalyzableCode } = require('./document-parser');

describe('Document Parser', function() {
  describe('parseDocument', function() {
    it('should split simple text into paragraphs', function() {
      const doc = `First paragraph with some text.

Second paragraph with more text.`;
      
      const segments = parseDocument(doc);
      
      expect(segments).to.have.lengthOf(2);
      expect(segments[0]).to.deep.include({
        type: 'text',
        content: 'First paragraph with some text.',
        lineNumber: 1
      });
      expect(segments[1]).to.deep.include({
        type: 'text',
        content: 'Second paragraph with more text.',
        lineNumber: 3
      });
    });

    it('should preserve code blocks', function() {
      const doc = `Some text before.

\`\`\`javascript
const x = 1;
console.log(x);
\`\`\`

Some text after.`;
      
      const segments = parseDocument(doc);
      
      expect(segments).to.have.lengthOf(3);
      expect(segments[0].type).to.equal('text');
      expect(segments[1]).to.deep.include({
        type: 'code',
        language: 'javascript',
        content: 'const x = 1;\nconsole.log(x);',
        lineNumber: 3
      });
      expect(segments[2].type).to.equal('text');
    });

    it('should track line numbers accurately', function() {
      const doc = `Line 1

Line 3

Line 5`;
      
      const segments = parseDocument(doc);
      
      expect(segments[0].lineNumber).to.equal(1);
      expect(segments[1].lineNumber).to.equal(3);
      expect(segments[2].lineNumber).to.equal(5);
    });

    it('should handle empty input', function() {
      expect(parseDocument('')).to.deep.equal([]);
      expect(parseDocument(null)).to.deep.equal([]);
      expect(parseDocument(undefined)).to.deep.equal([]);
    });

    it('should handle code blocks without language', function() {
      const doc = `\`\`\`
some code
\`\`\``;
      
      const segments = parseDocument(doc);
      
      expect(segments).to.have.lengthOf(1);
      expect(segments[0]).to.deep.include({
        type: 'code',
        language: '',
        content: 'some code'
      });
    });

    it('should handle multiple consecutive paragraphs', function() {
      const doc = `Para 1
continues here

Para 2

Para 3`;
      
      const segments = parseDocument(doc);
      
      expect(segments).to.have.lengthOf(3);
      expect(segments[0].content).to.equal('Para 1\ncontinues here');
      expect(segments[1].content).to.equal('Para 2');
      expect(segments[2].content).to.equal('Para 3');
    });
  });

  describe('isAnalyzableCode', function() {
    it('should identify shell languages as analyzable', function() {
      const shellLanguages = ['bash', 'sh', 'shell', 'zsh', 'fish'];
      
      shellLanguages.forEach(lang => {
        const segment = {
          type: 'code',
          language: lang,
          content: 'echo "test"',
          lineNumber: 1
        };
        expect(isAnalyzableCode(segment)).to.be.true;
      });
    });

    it('should not analyze non-shell languages', function() {
      const nonShellLanguages = ['javascript', 'python', 'java', 'ruby', 'go'];
      
      nonShellLanguages.forEach(lang => {
        const segment = {
          type: 'code',
          language: lang,
          content: 'console.log("test")',
          lineNumber: 1
        };
        expect(isAnalyzableCode(segment)).to.be.false;
      });
    });

    it('should not analyze text segments', function() {
      const segment = {
        type: 'text',
        content: 'some text',
        lineNumber: 1
      };
      expect(isAnalyzableCode(segment)).to.be.false;
    });

    it('should handle empty language', function() {
      const segment = {
        type: 'code',
        language: '',
        content: 'some code',
        lineNumber: 1
      };
      expect(isAnalyzableCode(segment)).to.be.false;
    });
  });
});
