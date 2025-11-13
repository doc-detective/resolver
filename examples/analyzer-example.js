/**
 * Example usage of the Doc Detective Resolver analyzer
 * 
 * Run with:
 * ANTHROPIC_API_KEY=sk-... node examples/analyzer-example.js
 */

const { analyze } = require('../src/analyzer-api');

async function main() {
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable is required');
    console.error('Usage: ANTHROPIC_API_KEY=sk-... node examples/analyzer-example.js');
    process.exit(1);
  }

  // Sample documentation
  const documentation = `
# Getting Started with Our Application

## Login Process

Navigate to https://app.example.com in your web browser.

On the login page, enter your credentials:
1. Type your email address in the email field
2. Enter your password in the password field
3. Click the "Sign In" button

If you see a two-factor authentication prompt, enter the code from your authenticator app.

## Creating a New Project

Once logged in, click the "New Project" button in the top right corner.

Fill in the project details:
- Enter a project name
- Add a description
- Select a category from the dropdown

Click "Create" to save your new project.

## Running Commands

You can also use our CLI tool:

\`\`\`bash
npm install -g example-cli
example-cli login
example-cli create-project "My Project"
\`\`\`
`;

  console.log('Analyzing documentation...\n');
  
  try {
    const result = await analyze(documentation, {
      provider: 'anthropic',
      apiKey: apiKey,
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
      if (action.matchText) console.log(`   Match Text: ${action.matchText}`);
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
    console.log('\nTo use these actions:');
    console.log('1. Review the extracted actions');
    console.log('2. Adjust selectors and values as needed');
    console.log('3. Organize them into Doc Detective test specifications');
    console.log('4. Run with doc-detective-core\n');
    
    // Example of saving to JSON
    const fs = require('fs');
    const outputPath = 'extracted-actions.json';
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Full results saved to ${outputPath}`);
    
  } catch (error) {
    console.error('Error during analysis:', error.message);
    process.exit(1);
  }
}

main();
