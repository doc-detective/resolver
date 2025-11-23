/**
 * Test for local LLM provider integration
 * 
 * This test verifies that the local provider integration works correctly
 * without requiring an actual llama.cpp server to be running.
 */

const { expect } = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('Local LLM Provider', function() {
  let generateTextStub;
  let provider;
  
  beforeEach(function() {
    // Mock the generateText function from 'ai' SDK
    generateTextStub = sinon.stub();
    
    // Mock the provider modules
    const mockOpenai = sinon.stub().returns({
      modelId: 'local-model',
      provider: 'openai'
    });
    
    provider = proxyquire('../llm/provider', {
      'ai': { generateText: generateTextStub },
      '@ai-sdk/openai': { openai: mockOpenai },
      '@ai-sdk/anthropic': { anthropic: sinon.stub() },
      '@ai-sdk/google': { google: sinon.stub() }
    });
  });

  afterEach(function() {
    sinon.restore();
  });

  describe('createProvider', function() {
    it('should create local provider with default settings', function() {
      const config = {
        provider: 'local',
        apiKey: 'local-testing-key'
      };
      
      const result = provider.createProvider(config);
      
      expect(result).to.exist;
      expect(result.modelId).to.equal('local-model');
    });

    it('should create local provider with custom baseURL', function() {
      const config = {
        provider: 'local',
        apiKey: 'test-key',
        baseURL: 'http://localhost:9000/v1'
      };
      
      const result = provider.createProvider(config);
      
      expect(result).to.exist;
    });

    it('should create local provider with custom model name', function() {
      const config = {
        provider: 'local',
        apiKey: 'test-key',
        model: 'custom-model'
      };
      
      const result = provider.createProvider(config);
      
      expect(result).to.exist;
    });

    it('should accept any API key for local provider', function() {
      const configs = [
        { provider: 'local', apiKey: 'any-key-works' },
        { provider: 'local', apiKey: 'local-testing-key' },
        { provider: 'local', apiKey: 'dummy' }
      ];
      
      configs.forEach(config => {
        const result = provider.createProvider(config);
        expect(result).to.exist;
      });
    });
  });

  describe('analyzeSegment with local provider', function() {
    it('should handle successful local LLM response', async function() {
      const segment = {
        type: 'text',
        content: 'Click the submit button',
        lineNumber: 1
      };
      
      const prompt = 'Analyze this: Click the submit button';
      
      const config = {
        provider: 'local',
        apiKey: 'local-testing-key',
        temperature: 0.3,
        maxTokens: 4000
      };
      
      // Mock successful response from local LLM
      generateTextStub.resolves({
        text: JSON.stringify([
          {
            action: 'find',
            selector: 'button[type="submit"]'
          },
          {
            action: 'click',
            selector: 'button[type="submit"]'
          }
        ]),
        usage: {
          promptTokens: 100,
          completionTokens: 50
        }
      });
      
      const result = await provider.analyzeSegment(segment, prompt, config);
      
      expect(result.actions).to.be.an('array');
      expect(result.actions).to.have.lengthOf(2);
      expect(result.actions[0].action).to.equal('find');
      expect(result.actions[1].action).to.equal('click');
      expect(result.metadata.promptTokens).to.equal(100);
      expect(result.metadata.completionTokens).to.equal(50);
      expect(result.metadata.latencyMs).to.be.a('number');
    });

    it('should handle malformed JSON from local LLM', async function() {
      const segment = {
        type: 'text',
        content: 'Navigate to example.com',
        lineNumber: 1
      };
      
      const prompt = 'Analyze this';
      const config = {
        provider: 'local',
        apiKey: 'local-testing-key'
      };
      
      // Mock response with extra text around JSON
      generateTextStub.resolves({
        text: 'Here are the actions:\n[{"action":"goTo","url":"https://example.com"}]\nDone!',
        usage: {
          promptTokens: 80,
          completionTokens: 40
        }
      });
      
      const result = await provider.analyzeSegment(segment, prompt, config);
      
      expect(result.actions).to.be.an('array');
      expect(result.actions).to.have.lengthOf(1);
      expect(result.actions[0].action).to.equal('goTo');
    });

    it('should return empty array for unparseable response', async function() {
      const segment = {
        type: 'text',
        content: 'Test content',
        lineNumber: 1
      };
      
      const prompt = 'Analyze this';
      const config = {
        provider: 'local',
        apiKey: 'local-testing-key'
      };
      
      // Mock unparseable response
      generateTextStub.resolves({
        text: 'This is not JSON at all',
        usage: {
          promptTokens: 50,
          completionTokens: 20
        }
      });
      
      const result = await provider.analyzeSegment(segment, prompt, config);
      
      expect(result.actions).to.be.an('array');
      expect(result.actions).to.have.lengthOf(0);
    });

    it('should handle connection errors gracefully', async function() {
      const segment = {
        type: 'text',
        content: 'Test content',
        lineNumber: 1
      };
      
      const prompt = 'Analyze this';
      const config = {
        provider: 'local',
        apiKey: 'local-testing-key'
      };
      
      // Mock connection error (server not running)
      generateTextStub.rejects(new Error('connect ECONNREFUSED 127.0.0.1:8080'));
      
      try {
        await provider.analyzeSegment(segment, prompt, config);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('ECONNREFUSED');
      }
    });
  });

  describe('Local provider configuration validation', function() {
    it('should work without explicit baseURL (uses default)', function() {
      const config = {
        provider: 'local',
        apiKey: 'test'
      };
      
      const result = provider.createProvider(config);
      expect(result).to.exist;
    });

    it('should work with custom port in baseURL', function() {
      const config = {
        provider: 'local',
        apiKey: 'test',
        baseURL: 'http://localhost:9999/v1'
      };
      
      const result = provider.createProvider(config);
      expect(result).to.exist;
    });

    it('should work with remote baseURL (for networked setups)', function() {
      const config = {
        provider: 'local',
        apiKey: 'test',
        baseURL: 'http://192.168.1.100:8080/v1'
      };
      
      const result = provider.createProvider(config);
      expect(result).to.exist;
    });
  });
});
