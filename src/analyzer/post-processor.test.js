const { expect } = require('chai');
const {
  addDefensiveActions,
  tagActionsWithSource,
  validateActions
} = require('./post-processor');

describe('Post-Processor', function() {
  describe('addDefensiveActions', function() {
    it('should add find before click actions', function() {
      const actions = [
        {
          action: 'click',
          selector: 'button.continue'
        }
      ];
      
      const enhanced = addDefensiveActions(actions);
      
      expect(enhanced.length).to.be.greaterThan(1);
      expect(enhanced[0].action).to.equal('find');
      expect(enhanced[0].selector).to.equal('button.continue');
      expect(enhanced[0]._generated).to.be.true;
      const clickAction = enhanced.find(a => a.action === 'click');
      expect(clickAction).to.exist;
      expect(clickAction.selector).to.equal('button.continue');
    });

    it('should add find before typeKeys actions', function() {
      const actions = [
        {
          action: 'typeKeys',
          selector: 'input[type="text"]',
          keys: 'test'
        }
      ];
      
      const enhanced = addDefensiveActions(actions);
      
      expect(enhanced).to.have.lengthOf(2);
      expect(enhanced[0].action).to.equal('find');
      expect(enhanced[0].selector).to.equal('input[type="text"]');
      expect(enhanced[1].action).to.equal('typeKeys');
    });

    it('should not add find if one already exists', function() {
      const actions = [
        {
          action: 'find',
          selector: 'button.continue'
        },
        {
          action: 'click',
          selector: 'button.continue'
        }
      ];
      
      const enhanced = addDefensiveActions(actions);
      
      // Should have at least the original 2 actions
      expect(enhanced.length).to.be.greaterThanOrEqual(2);
      expect(enhanced[0].action).to.equal('find');
      const clickAction = enhanced.find(a => a.action === 'click');
      expect(clickAction).to.exist;
      
      // Count find actions for this selector
      const findActions = enhanced.filter(a => a.action === 'find' && a.selector === 'button.continue');
      expect(findActions).to.have.lengthOf(1); // Should only be one find action
    });

    it('should add wait after submit actions', function() {
      const actions = [
        {
          action: 'click',
          selector: 'button[type="submit"]'
        }
      ];
      
      const enhanced = addDefensiveActions(actions);
      
      expect(enhanced.length).to.be.greaterThan(2);
      const lastAction = enhanced[enhanced.length - 1];
      expect(lastAction.action).to.equal('wait');
      expect(lastAction._generated).to.be.true;
    });

    it('should handle empty arrays', function() {
      const enhanced = addDefensiveActions([]);
      expect(enhanced).to.deep.equal([]);
    });

    it('should handle null/undefined', function() {
      expect(addDefensiveActions(null)).to.equal(null);
      expect(addDefensiveActions(undefined)).to.equal(undefined);
    });

    it('should handle actions without selectors', function() {
      const actions = [
        {
          action: 'goTo',
          url: 'https://example.com'
        }
      ];
      
      const enhanced = addDefensiveActions(actions);
      
      expect(enhanced).to.have.lengthOf(1);
      expect(enhanced[0].action).to.equal('goTo');
    });
  });

  describe('tagActionsWithSource', function() {
    it('should add source information to actions', function() {
      const actions = [
        { action: 'click', selector: 'button' }
      ];
      
      const segment = {
        type: 'text',
        content: 'Click the button',
        lineNumber: 5
      };
      
      const tagged = tagActionsWithSource(actions, segment);
      
      expect(tagged[0]._source).to.deep.equal({
        type: 'text',
        content: 'Click the button',
        line: 5
      });
    });

    it('should not override existing source', function() {
      const actions = [
        {
          action: 'click',
          selector: 'button',
          _source: { type: 'original', content: 'original', line: 1 }
        }
      ];
      
      const segment = {
        type: 'text',
        content: 'New content',
        lineNumber: 10
      };
      
      const tagged = tagActionsWithSource(actions, segment);
      
      expect(tagged[0]._source.type).to.equal('original');
      expect(tagged[0]._source.line).to.equal(1);
    });

    it('should handle empty arrays', function() {
      const tagged = tagActionsWithSource([], {});
      expect(tagged).to.deep.equal([]);
    });
  });

  describe('validateActions', function() {
    it('should validate actions against schemas', function() {
      const actions = [
        {
          action: 'goTo',
          url: 'https://example.com'
        }
      ];
      
      const schemas = {
        goTo_v3: {
          type: 'object',
          properties: {
            action: { const: 'goTo' },
            url: { type: 'string' }
          },
          required: ['action', 'url']
        }
      };
      
      const { valid, invalid } = validateActions(actions, schemas);
      
      // Note: actual validation depends on doc-detective-common implementation
      // This test just ensures the function runs without error
      expect(valid).to.be.an('array');
      expect(invalid).to.be.an('array');
    });

    it('should handle actions with missing action type', function() {
      const actions = [
        { selector: 'button' }
      ];
      
      const { valid, invalid } = validateActions(actions, {});
      
      expect(invalid).to.have.lengthOf(1);
      expect(invalid[0].error).to.include('Missing action type');
    });

    it('should handle actions with unknown action types', function() {
      const actions = [
        { action: 'unknownAction' }
      ];
      
      const { valid, invalid } = validateActions(actions, {});
      
      expect(invalid).to.have.lengthOf(1);
      expect(invalid[0].error).to.include('No schema found');
    });

    it('should handle empty arrays', function() {
      const { valid, invalid } = validateActions([], {});
      
      expect(valid).to.deep.equal([]);
      expect(invalid).to.deep.equal([]);
    });

    it('should handle null/undefined', function() {
      const result = validateActions(null, {});
      
      expect(result.valid).to.deep.equal([]);
      expect(result.invalid).to.deep.equal([]);
    });
  });
});
