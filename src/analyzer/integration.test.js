/**
 * Integration test for the analyzer
 * 
 * This test requires API keys and should be run manually:
 * 
 * ANTHROPIC_API_KEY=sk-... node src/analyzer/integration.test.js
 * 
 * or
 * 
 * GOOGLE_GENERATIVE_AI_API_KEY=... node src/analyzer/integration.test.js provider=google
 * 
 * or
 * 
 * OPENAI_API_KEY=sk-... node src/analyzer/integration.test.js provider=openai
 */

const { analyze } = require('../analyzer-api');

// Sample documentation for testing
const sampleDocs = {
  simple: `Navigate to https://example.com and click the Login button.`,
  
  formFilling: `
Enter your email address in the email field.
Type your password in the password field.
Click the Submit button to log in.
`,
  
  conditional: `
If you see a cookie banner, click Accept.
Otherwise, proceed to the next step.
Navigate to the settings page.
`,
  
  codeBlock: `
First, install the dependencies:

\`\`\`bash
npm install
npm run build
\`\`\`

Then start the server and navigate to http://localhost:3000.
`,
  
  complex: `
# User Registration Flow

Navigate to https://example.com/register

Fill in the registration form:
- Enter your full name
- Enter your email address  
- Create a strong password
- Confirm your password

Accept the terms and conditions by clicking the checkbox.
Click the "Create Account" button.

If you see an error message, correct the highlighted fields and try again.

Once successful, you should see a confirmation message.
`
};

async function runTest(docName, doc, config) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${docName}`);
  console.log(`${'='.repeat(60)}\n`);
  console.log('Input:', doc.substring(0, 100) + (doc.length > 100 ? '...' : ''));
  console.log();
  
  try {
    const startTime = Date.now();
    const result = await analyze(doc, config);
    const duration = Date.now() - startTime;
    
    console.log(`✓ Analysis completed in ${duration}ms`);
    console.log(`  - Total actions: ${result.summary.totalActions}`);
    console.log(`  - Segments analyzed: ${result.summary.analyzedSegments}/${result.summary.totalSegments}`);
    console.log(`  - Total tokens: ${result.summary.totalTokens}`);
    console.log();
    
    console.log('Extracted Actions:');
    result.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.action} ${action._generated ? '(generated)' : ''}`);
      if (action.url) console.log(`     url: ${action.url}`);
      if (action.selector) console.log(`     selector: ${action.selector}`);
      if (action.keys) console.log(`     keys: ${action.keys}`);
      if (action.command) console.log(`     command: ${action.command}`);
      if (action.description) console.log(`     description: ${action.description}`);
      if (action.confidence) console.log(`     confidence: ${action.confidence}`);
    });
    
    return { success: true, result };
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    return { success: false, error };
  }
}

async function main() {
  // Get provider from command line or use default
  const args = process.argv.slice(2);
  const providerArg = args.find(arg => arg.startsWith('provider='));
  const provider = providerArg ? providerArg.split('=')[1] : 'anthropic';
  
  // Get API key from environment
  let apiKey;
  switch (provider) {
    case 'anthropic':
      apiKey = process.env.ANTHROPIC_API_KEY;
      break;
    case 'google':
      apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      break;
    case 'openai':
      apiKey = process.env.OPENAI_API_KEY;
      break;
    default:
      console.error(`Unknown provider: ${provider}`);
      process.exit(1);
  }
  
  if (!apiKey) {
    console.error(`\nError: API key not found for provider '${provider}'`);
    console.error(`\nPlease set one of these environment variables:`);
    console.error(`  - ANTHROPIC_API_KEY for Anthropic`);
    console.error(`  - GOOGLE_GENERATIVE_AI_API_KEY for Google`);
    console.error(`  - OPENAI_API_KEY for OpenAI`);
    console.error(`\nExample:`);
    console.error(`  ANTHROPIC_API_KEY=sk-... node src/analyzer/integration.test.js\n`);
    process.exit(1);
  }
  
  const config = {
    provider,
    apiKey,
    temperature: 0.3,
    maxTokens: 4000
  };
  
  console.log(`\nRunning integration tests with ${provider}...`);
  console.log(`Model: ${config.model || 'default'}`);
  
  const results = [];
  
  // Run tests
  for (const [name, doc] of Object.entries(sampleDocs)) {
    const result = await runTest(name, doc, config);
    results.push({ name, ...result });
    
    // Small delay between requests to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('Summary');
  console.log(`${'='.repeat(60)}\n`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total tests: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error.message}`);
    });
  }
  
  const totalActions = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.result.summary.totalActions, 0);
  
  const totalTokens = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.result.summary.totalTokens, 0);
    
  console.log(`\nTotal actions extracted: ${totalActions}`);
  console.log(`Total tokens used: ${totalTokens}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { sampleDocs, runTest };
