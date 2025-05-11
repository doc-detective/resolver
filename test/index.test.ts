import { expect } from "chai";
import { resolve } from '../src/index.js';
import { type Input } from '../src/schemas.js';

describe("Resolver tests", function () {
  it('should accept string input', () => {
    const input = 'test source';
    const result = resolve(input);
    
    expect(result.resolved).to.equal('Resolved: test source');
    expect(result.format).to.equal('json');  // Default format
    expect(result.timestamp).to.be.a('number');
  });
  
  it('should accept object input', () => {
    const input: Input = {
      source: 'test object',
      options: {
        format: 'yaml',
        strict: true
      }
    };
    
    const result = resolve(input);
    
    expect(result.resolved).to.equal('Resolved: test object');
    expect(result.format).to.equal('yaml');
    expect(result.timestamp).to.be.a('number');
  });
  
  it('should accept JSON string input', () => {
    const inputObj = {
      source: 'json string test',
      options: {
        format: 'md'
      }
    };
    
    const input = JSON.stringify(inputObj);
    const result = resolve(input);
    
    expect(result.resolved).to.equal('Resolved: json string test');
    expect(result.format).to.equal('md');
    expect(result.timestamp).to.be.a('number');
  });
  
  it('should throw on invalid input', () => {
    const invalidInput = {
      // Missing required 'source' field
      options: {
        format: 'json'
      }
    };
    
    expect(() => resolve(invalidInput as any)).to.throw();
  });
});