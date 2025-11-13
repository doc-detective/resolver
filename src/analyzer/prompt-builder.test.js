const { expect } = require('chai');
const {
  buildCorePrompt,
  buildStaticModePrompt,
  detectActionTypes,
  getRelevantSchemas,
  buildPrompt
} = require('./prompt-builder');

describe('Prompt Builder', function() {
  describe('buildCorePrompt', function() {
    it('should return a non-empty string', function() {
      const prompt = buildCorePrompt();
      expect(prompt).to.be.a('string');
      expect(prompt.length).to.be.greaterThan(100);
    });

    it('should include key concepts', function() {
      const prompt = buildCorePrompt();
      expect(prompt).to.include('High Recall');
      expect(prompt).to.include('EXTRACTION PHILOSOPHY');
      expect(prompt).to.include('ACTION DECOMPOSITION');
    });
  });

  describe('buildStaticModePrompt', function() {
    it('should return a non-empty string', function() {
      const prompt = buildStaticModePrompt();
      expect(prompt).to.be.a('string');
      expect(prompt.length).to.be.greaterThan(50);
    });

    it('should include static mode guidance', function() {
      const prompt = buildStaticModePrompt();
      expect(prompt).to.include('STATIC ANALYSIS MODE');
      expect(prompt).to.include('Confidence Scoring');
    });
  });

  describe('detectActionTypes', function() {
    it('should always include find and conditional', function() {
      const types = detectActionTypes('just some text');
      expect(types).to.include('find');
      expect(types).to.include('conditional');
    });

    it('should detect navigation actions', function() {
      const types = detectActionTypes('Navigate to the homepage');
      expect(types).to.include('goTo');
    });

    it('should detect click actions', function() {
      const types = detectActionTypes('Click the submit button');
      expect(types).to.include('click');
    });

    it('should detect type actions', function() {
      const types = detectActionTypes('Enter your username');
      expect(types).to.include('typeKeys');
    });

    it('should detect HTTP request actions', function() {
      const types = detectActionTypes('Make a GET request to the API');
      expect(types).to.include('httpRequest');
    });

    it('should detect shell command actions', function() {
      const types = detectActionTypes('Run the install command');
      expect(types).to.include('runShell');
    });

    it('should detect multiple action types', function() {
      const types = detectActionTypes('Navigate to the page and click the button');
      expect(types).to.include('goTo');
      expect(types).to.include('click');
    });

    it('should be case insensitive', function() {
      const types = detectActionTypes('CLICK THE BUTTON');
      expect(types).to.include('click');
    });
  });

  describe('getRelevantSchemas', function() {
    it('should return schema documentation string', function() {
      const schemas = {
        click_v3: { type: 'object', properties: { action: { const: 'click' } } },
        find_v3: { type: 'object', properties: { action: { const: 'find' } } }
      };
      
      const schemaDoc = getRelevantSchemas('Click the button', schemas);
      
      expect(schemaDoc).to.be.a('string');
      expect(schemaDoc).to.include('RELEVANT ACTION SCHEMAS');
      expect(schemaDoc).to.include('click');
    });

    it('should include detected action schemas', function() {
      const schemas = {
        goTo_v3: { type: 'object' },
        click_v3: { type: 'object' }
      };
      
      const schemaDoc = getRelevantSchemas('Navigate to example.com', schemas);
      
      expect(schemaDoc).to.include('goTo');
    });
  });

  describe('buildPrompt', function() {
    it('should build complete prompt', function() {
      const segment = {
        type: 'text',
        content: 'Click the login button',
        lineNumber: 5
      };
      
      const schemas = {
        click_v3: { type: 'object' },
        find_v3: { type: 'object' }
      };
      
      const prompt = buildPrompt(segment, schemas);
      
      expect(prompt).to.include('EXTRACTION PHILOSOPHY');
      expect(prompt).to.include('STATIC ANALYSIS MODE');
      expect(prompt).to.include('RELEVANT ACTION SCHEMAS');
      expect(prompt).to.include('Click the login button');
      expect(prompt).to.include('line 5');
    });

    it('should handle code segments', function() {
      const segment = {
        type: 'code',
        content: 'npm install',
        language: 'bash',
        lineNumber: 10
      };
      
      const schemas = {
        runShell_v3: { type: 'object' }
      };
      
      const prompt = buildPrompt(segment, schemas);
      
      expect(prompt).to.include('npm install');
      expect(prompt).to.include('code');
      expect(prompt).to.include('line 10');
    });
  });
});
