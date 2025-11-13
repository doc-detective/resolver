const { expect } = require('chai');
const { extractBrowserContext, formatContextForPrompt } = require('./browser-context');
const { buildDynamicPrompt, buildRefinementPrompt } = require('./dynamic-prompt-builder');
const { applyHeuristicRefinement } = require('./step-executor');

describe('Dynamic Analyzer Components', () => {
  
  describe('browser-context', () => {
    it('should handle mock driver for context extraction', async () => {
      const mockDriver = {
        executeScript: async () => ({
          url: 'https://example.com',
          title: 'Test Page',
          forms: [],
          inputs: [{ type: 'text', id: 'test-input', visible: true }],
          buttons: [{ text: 'Submit', id: 'submit-btn', visible: true }],
          links: [],
          headings: [{ level: 'h1', text: 'Welcome' }],
          visibleText: 'Welcome to the test page'
        }),
        getUrl: async () => 'https://example.com',
        getTitle: async () => 'Test Page'
      };

      const context = await extractBrowserContext(mockDriver);
      
      expect(context).to.have.property('url');
      expect(context).to.have.property('title');
      expect(context).to.have.property('inputs');
      expect(context).to.have.property('buttons');
      expect(context.url).to.equal('https://example.com');
      expect(context.inputs).to.have.lengthOf(1);
      expect(context.buttons).to.have.lengthOf(1);
    });

    it('should format context for prompts', () => {
      const context = {
        url: 'https://example.com',
        title: 'Test Page',
        headings: [{ level: 'h1', text: 'Welcome' }],
        forms: [],
        inputs: [{ type: 'text', id: 'test-input', selector: '#test-input', label: 'Name' }],
        buttons: [{ text: 'Submit', selector: '#submit-btn' }],
        links: [],
        visibleText: 'Test content'
      };

      const formatted = formatContextForPrompt(context);
      
      expect(formatted).to.include('CURRENT PAGE STATE');
      expect(formatted).to.include('https://example.com');
      expect(formatted).to.include('Test Page');
      expect(formatted).to.include('Welcome');
      expect(formatted).to.include('Submit');
    });

    it('should handle extraction errors gracefully', async () => {
      const errorDriver = {
        executeScript: async () => {
          throw new Error('Script execution failed');
        },
        getUrl: async () => 'https://example.com',
        getTitle: async () => 'Test Page'
      };

      const context = await extractBrowserContext(errorDriver);
      
      expect(context).to.have.property('error');
      expect(context.url).to.equal('https://example.com');
      expect(context.inputs).to.deep.equal([]);
    });
  });

  describe('dynamic-prompt-builder', () => {
    it('should build dynamic prompt with context', () => {
      const instruction = 'Click the submit button';
      const browserContext = {
        url: 'https://example.com',
        title: 'Test Page',
        buttons: [{ text: 'Submit', selector: '#submit-btn' }],
        inputs: [],
        forms: [],
        links: [],
        headings: []
      };

      const prompt = buildDynamicPrompt(instruction, browserContext);
      
      expect(prompt).to.include('CURRENT BROWSER STATE');
      expect(prompt).to.include('https://example.com');
      expect(prompt).to.include('Submit');
      expect(prompt).to.include(instruction);
      expect(prompt).to.include('confidence');
    });

    it('should build refinement prompt', () => {
      const failedStep = { click: '#wrong-selector' };
      const failureResult = { description: 'Element not found' };
      const browserContext = {
        url: 'https://example.com',
        title: 'Test',
        buttons: [{ text: 'OK', selector: '#ok-btn' }],
        inputs: [],
        forms: [],
        links: [],
        headings: []
      };

      const prompt = buildRefinementPrompt(failedStep, failureResult, browserContext);
      
      expect(prompt).to.include('FAILED STEP');
      expect(prompt).to.include('FAILURE REASON');
      expect(prompt).to.include('Element not found');
      expect(prompt).to.include('#ok-btn');
    });

    it('should include completed steps in prompt', () => {
      const instruction = 'Next step';
      const browserContext = { url: 'test', title: 'test', buttons: [], inputs: [], forms: [], links: [], headings: [] };
      const completedSteps = [
        { goTo: 'https://example.com', description: 'Navigate' },
        { click: '#btn', description: 'Click button' }
      ];

      const prompt = buildDynamicPrompt(instruction, browserContext, null, completedSteps);
      
      expect(prompt).to.include('STEPS COMPLETED SO FAR');
      expect(prompt).to.include('Navigate');
      expect(prompt).to.include('Click button');
    });
  });

  describe('step-executor', () => {
    it('should apply heuristic refinement - retry 1 (wait)', () => {
      const step = { click: '#button' };
      const result = { description: 'Timeout' };
      
      const refined = applyHeuristicRefinement(step, result, 1);
      
      expect(refined).to.have.property('description');
      expect(refined.description).to.include('retry 1');
      expect(refined.click).to.equal('#button');
    });

    it('should apply heuristic refinement - retry 2 (selector adjustment)', () => {
      const step = { click: '#button-id' };
      const result = { description: 'Element not found' };
      
      const refined = applyHeuristicRefinement(step, result, 2);
      
      expect(refined.click).to.include('[id="button-id"]');
      expect(refined.description).to.include('retry 2');
    });

    it('should handle class selectors in refinement', () => {
      const step = { find: '.button-class' };
      const result = { description: 'Not found' };
      
      const refined = applyHeuristicRefinement(step, result, 2);
      
      expect(refined.find).to.include('[class*="button-class"]');
    });

    it('should refine type steps', () => {
      const step = { type: { keys: 'test', selector: '#input' } };
      const result = { description: 'Element not found' };
      
      const refined = applyHeuristicRefinement(step, result, 2);
      
      expect(refined.type.selector).to.include('[id="input"]');
    });

    it('should handle final retry attempt', () => {
      const step = { click: '#btn' };
      const result = { description: 'Failed' };
      
      const refined = applyHeuristicRefinement(step, result, 3);
      
      expect(refined.description).to.include('retry 3');
      expect(refined.description).to.include('final attempt');
    });
  });

  describe('Integration', () => {
    it('should work together to create a refinement workflow', async () => {
      // Mock driver
      const mockDriver = {
        executeScript: async () => ({
          url: 'https://example.com/login',
          title: 'Login',
          forms: [{
            id: 'login-form',
            inputs: [
              { type: 'text', name: 'username', id: 'user' },
              { type: 'password', name: 'password', id: 'pass' }
            ]
          }],
          inputs: [
            { type: 'text', name: 'username', id: 'user', selector: '#user', label: 'Username', visible: true },
            { type: 'password', name: 'password', id: 'pass', selector: '#pass', label: 'Password', visible: true }
          ],
          buttons: [
            { text: 'Sign In', id: 'submit', selector: '#submit', visible: true }
          ],
          links: [],
          headings: [{ level: 'h1', text: 'Login' }],
          visibleText: 'Login\nUsername\nPassword\nSign In'
        }),
        getUrl: async () => 'https://example.com/login',
        getTitle: async () => 'Login'
      };

      // Extract context
      const context = await extractBrowserContext(mockDriver);
      expect(context.buttons).to.have.lengthOf(1);

      // Format for prompt
      const formatted = formatContextForPrompt(context);
      expect(formatted).to.include('Sign In');

      // Build prompt
      const prompt = buildDynamicPrompt('Click the sign in button', context);
      expect(prompt).to.include('CURRENT BROWSER STATE');
      expect(prompt).to.include('#submit');

      // Simulate failure and refinement
      const failedStep = { click: '.signin-btn' };
      const refined = applyHeuristicRefinement(failedStep, { description: 'Not found' }, 2);
      expect(refined.click).to.include('[class*="signin-btn"]');
    });
  });
});
