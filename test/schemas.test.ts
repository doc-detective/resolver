import { expect } from 'chai';
import { parseInput, parseOutput, InputSchema, OutputSchema } from '../src/schemas.js';

describe('Schema Validation', () => {
  describe('InputSchema', () => {
    it('should validate valid input', () => {
      const validInput = {
        source: 'test source',
        options: {
          format: 'json',
          strict: true
        }
      };
      
      const result = InputSchema.parse(validInput);
      expect(result).to.deep.equal(validInput);
    });
    
    it('should provide default values', () => {
      const minimalInput = {
        source: 'test source'
      };
      
      const result = InputSchema.parse(minimalInput);
      expect(result).to.deep.equal({
        source: 'test source',
        options: {
          format: 'json',
          strict: false
        }
      });
    });
    
    it('should reject invalid input', () => {
      const invalidInput = {
        source: '',  // Empty string violates the min(1) constraint
        options: {
          format: 'invalid-format'  // Not in the enum
        }
      };
      
      expect(() => InputSchema.parse(invalidInput)).to.throw();
    });
  });
  
  describe('OutputSchema', () => {
    it('should validate valid output', () => {
      const validOutput = {
        resolved: 'resolved content',
        format: 'json',
        timestamp: Date.now()
      };
      
      const result = OutputSchema.parse(validOutput);
      expect(result).to.deep.equal(validOutput);
    });
    
    it('should reject invalid output', () => {
      const invalidOutput = {
        resolved: 'resolved content',
        format: 'invalid-format',  // Not in the enum
        timestamp: 'not-a-number'  // Should be a number
      };
      
      expect(() => OutputSchema.parse(invalidOutput)).to.throw();
    });
  });
  
  describe('parseInput and parseOutput functions', () => {
    it('parseInput should correctly validate and transform input', () => {
      const input = {
        source: 'test',
        options: { format: 'yaml' }
      };
      
      const result = parseInput(input);
      expect(result.source).to.equal('test');
      expect(result.options.format).to.equal('yaml');
      expect(result.options.strict).to.equal(false);  // Default value
    });
    
    it('parseOutput should correctly validate output', () => {
      const output = {
        resolved: 'resolved content',
        format: 'json',
        timestamp: 123456789
      };
      
      const result = parseOutput(output);
      expect(result).to.deep.equal(output);
    });
  });
});
