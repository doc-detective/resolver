/**
 * Example demonstrating the dynamic analyzer.
 * 
 * This example shows how to use the dynamic analyzer to:
 * 1. Analyze unclear documentation
 * 2. Interactively execute and refine steps
 * 3. Generate a canonical Doc Detective test
 * 
 * Prerequisites:
 * - doc-detective-core must be installed
 * - A browser driver (Chrome, Firefox, or Safari) must be available
 * - Appium must be set up for browser automation
 */

const { dynamicAnalyze } = require('../src');
const path = require('path');

// Mock driver for development/testing
// In production, you would initialize a real WebDriverIO driver from doc-detective-core
const createMockDriver = () => {
  return {
    url: async (url) => {
      console.log(`[Mock Driver] Navigate to: ${url}`);
    },
    getUrl: async () => 'https://example.com',
    getTitle: async () => 'Example Page',
    executeScript: async (script) => {
      // Return mock browser context
      return {
        url: 'https://example.com',
        title: 'Example Page',
        forms: [
          {
            index: 0,
            id: 'login-form',
            name: 'login',
            action: '/login',
            method: 'post',
            inputs: [
              { type: 'text', name: 'username', id: 'username', visible: true },
              { type: 'password', name: 'password', id: 'password', visible: true }
            ],
            visible: true
          }
        ],
        inputs: [
          {
            type: 'text',
            name: 'username',
            id: 'username',
            placeholder: 'Username',
            value: '',
            label: 'Username',
            ariaLabel: '',
            visible: true,
            selector: '#username'
          },
          {
            type: 'password',
            name: 'password',
            id: 'password',
            placeholder: 'Password',
            value: '',
            label: 'Password',
            ariaLabel: '',
            visible: true,
            selector: '#password'
          }
        ],
        buttons: [
          {
            text: 'Sign In',
            type: 'submit',
            id: 'submit-btn',
            className: 'btn-primary',
            name: 'submit',
            ariaLabel: '',
            visible: true,
            selector: '#submit-btn'
          }
        ],
        links: [
          {
            text: 'Forgot Password?',
            href: 'https://example.com/forgot-password',
            id: 'forgot-link',
            className: 'link',
            visible: true,
            selector: '#forgot-link'
          }
        ],
        headings: [
          { level: 'h1', text: 'Welcome to Example' }
        ],
        visibleText: 'Welcome to Example\n\nSign in to your account\n\nUsername\nPassword\n\nSign In\n\nForgot Password?'
      };
    },
    $$: async (selector) => {
      // Return mock elements
      return [{
        isDisplayed: async () => true,
        getText: async () => 'Mock Element'
      }];
    }
  };
};

async function main() {
  // Example documentation text (from the user's original example)
  const documentation = `
Sign in to Heretto CCMS with the credentials provided to you. 
In the left pane, in the Browse tab, click the Content folder. 
Click Create a new folder and add a new folder named Testing. 
In the Testing folder, create a personal testing folder. 
Follow this naming convention Surname_Name.
  `.trim();

  // Configuration
  const config = {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || 'your-api-key-here',
    temperature: 0.3,
    userQueryThreshold: 0.7, // Query user if confidence < 0.7
    maxRetries: 3,
    useLlmRefinement: false, // Use heuristic refinement
    envFilePath: path.join(__dirname, '.env'),
    logLevel: 'info'
  };

  // Create mock driver (replace with real driver in production)
  const driver = createMockDriver();

  console.log('Starting dynamic analysis...\n');
  console.log('Documentation to analyze:');
  console.log(documentation);
  console.log('\n' + '='.repeat(80) + '\n');

  try {
    // Run dynamic analysis
    const result = await dynamicAnalyze(documentation, config, driver);

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('RESULTS');
    console.log('='.repeat(80));

    if (result.error) {
      console.log('\nError occurred during analysis:');
      console.log(result.error);
    }

    console.log('\nGenerated Test:');
    console.log(JSON.stringify(result.test, null, 2));

    console.log('\nMetadata:');
    console.log(JSON.stringify(result.metadata, null, 2));

    // Save to file
    const outputPath = path.join(__dirname, 'dynamic-analysis-output.json');
    const fs = require('fs');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`\nFull results saved to: ${outputPath}`);

  } catch (error) {
    console.error('Fatal error during dynamic analysis:');
    console.error(error);
  }
}

// Run example
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
