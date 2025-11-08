/**
 * Example usage of the Doc Detective Resolver analyzer with local LLM
 * 
 * Prerequisites:
 * 1. Run: cd local-llm && ./setup.sh
 * 2. Start server: ./start-server.sh (in another terminal)
 * 3. Run this script: node examples/analyzer-example-local.js
 */

const { analyze } = require('../src/analyzer-api');

async function main() {
  console.log('Testing analyzer with local LLM...\n');
  
  // Sample documentation
  const documentation = `
# Getting Started with Our Application

## Login Process

Navigate to https://app.example.com in your web browser.

On the login page, enter your credentials:
1. Type your email address in the email field
2. Enter your password in the password field
3. Click the "Sign In" button

## Creating a Project

Once logged in, click the "New Project" button.

Fill in the project details:
- Enter a project name
- Add a description

Click "Create" to save your new project.
`;

  console.log('Analyzing documentation with local Qwen2.5-0.5B model...\n');
  
  try {
    const result = await analyze(documentation, {
      provider: 'local',
      apiKey: 'local-testing-key',  // Any value works for local
      temperature: 0.3
    });
    
    console.log('✓ Analysis complete!\n');
    console.log('Summary:');
    console.log(`  - Total actions extracted: ${result.summary.totalActions}`);
    console.log(`  - Document segments: ${result.summary.totalSegments}`);
    console.log(`  - Segments analyzed: ${result.summary.analyzedSegments}`);
    console.log(`  - Tokens used: ${result.summary.totalTokens}`);
    console.log(`  - Processing time: ${result.summary.totalLatencyMs}ms`);
    console.log();
    
    console.log('Extracted Actions:');
    console.log('='.repeat(60));
    
    result.actions.forEach((action, index) => {
      console.log(`\n${index + 1}. Action: ${action.action}`);
      
      // Show relevant properties based on action type
      if (action.url) console.log(`   URL: ${action.url}`);
      if (action.selector) console.log(`   Selector: ${action.selector}`);
      if (action.keys) console.log(`   Keys: ${action.keys}`);
      if (action.command) console.log(`   Command: ${action.command}`);
      if (action.description) console.log(`   Description: ${action.description}`);
      if (action.confidence) console.log(`   Confidence: ${action.confidence}`);
      
      // Show source information
      if (action._source) {
        console.log(`   Source: Line ${action._source.line} (${action._source.type})`);
      }
      
      // Indicate if action was defensively generated
      if (action._generated) {
        console.log(`   (Defensively generated)`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('\nNote: This used a local Qwen2.5-0.5B model.');
    console.log('Quality may be lower than cloud providers (Anthropic, Google, OpenAI),');
    console.log('but it works offline and is free for testing!\n');
    
  } catch (error) {
    console.error('Error during analysis:', error.message);
    console.error('\nMake sure the local LLM server is running:');
    console.error('  cd local-llm && ./start-server.sh\n');
    process.exit(1);
  }
}

main();
