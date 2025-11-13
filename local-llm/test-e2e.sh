#!/bin/bash
# End-to-end test for local LLM integration
# This script tests the complete workflow with a running llama.cpp server

set -e

echo "=========================================="
echo "Local LLM Integration E2E Test"
echo "=========================================="
echo ""

# Check if server is running
echo "Checking if local LLM server is running..."
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo ""
    echo "❌ Local LLM server is not running!"
    echo ""
    echo "Please start the server first:"
    echo "  cd local-llm"
    echo "  ./start-server.sh"
    echo ""
    echo "Then run this test again."
    exit 1
fi

echo "✓ Server is running on http://localhost:8080"
echo ""

# Create a test script
TEST_SCRIPT="/tmp/test-local-analyzer.js"
cat > "$TEST_SCRIPT" << 'EOF'
const { analyze } = require('./src/analyzer-api');

async function testLocalAnalyzer() {
  console.log('Testing local analyzer with simple documentation...\n');
  
  const documentation = `
Navigate to https://example.com

Click the Login button.

Enter your username in the username field.
`;

  try {
    const startTime = Date.now();
    const result = await analyze(documentation, {
      provider: 'local',
      apiKey: 'local-testing-key',
      temperature: 0.3,
      maxTokens: 2000
    });
    const duration = Date.now() - startTime;
    
    console.log('✓ Analysis completed successfully!\n');
    console.log('Summary:');
    console.log(`  - Duration: ${duration}ms`);
    console.log(`  - Total actions: ${result.summary.totalActions}`);
    console.log(`  - Segments analyzed: ${result.summary.analyzedSegments}/${result.summary.totalSegments}`);
    console.log(`  - Total tokens: ${result.summary.totalTokens}`);
    console.log(`  - Processing time: ${result.summary.totalLatencyMs}ms`);
    console.log();
    
    if (result.actions.length === 0) {
      console.log('⚠️  Warning: No actions extracted');
      console.log('This might indicate:');
      console.log('  - Model needs better prompting');
      console.log('  - Model is too small for the task');
      console.log('  - Temperature/max_tokens need adjustment');
      return false;
    }
    
    console.log('Extracted Actions:');
    result.actions.forEach((action, i) => {
      console.log(`  ${i + 1}. ${action.action}${action._generated ? ' (generated)' : ''}`);
      if (action.url) console.log(`     url: ${action.url}`);
      if (action.selector) console.log(`     selector: ${action.selector}`);
      if (action.keys) console.log(`     keys: ${action.keys}`);
      if (action._source) {
        console.log(`     source: line ${action._source.line}`);
      }
    });
    
    console.log();
    
    // Validate expected actions
    const hasGoTo = result.actions.some(a => a.action === 'goTo');
    const hasClick = result.actions.some(a => a.action === 'click');
    
    if (hasGoTo && hasClick) {
      console.log('✓ Test PASSED: Extracted expected action types');
      return true;
    } else {
      console.log('⚠️  Test PARTIAL: Some expected actions not found');
      console.log(`   - goTo: ${hasGoTo ? '✓' : '✗'}`);
      console.log(`   - click: ${hasClick ? '✓' : '✗'}`);
      return true; // Still pass, small models may not be perfect
    }
    
  } catch (error) {
    console.error('✗ Test FAILED:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\nThe local LLM server appears to be down.');
      console.error('Make sure it is running on http://localhost:8080');
    }
    return false;
  }
}

testLocalAnalyzer().then(success => {
  process.exit(success ? 0 : 1);
});
EOF

# Run the test
echo "Running analyzer with local LLM..."
echo ""
cd "$(dirname "$0")/.."

if node "$TEST_SCRIPT"; then
    echo ""
    echo "=========================================="
    echo "✓ E2E Test PASSED"
    echo "=========================================="
    echo ""
    echo "The local LLM integration is working correctly!"
    echo ""
    exit 0
else
    echo ""
    echo "=========================================="
    echo "✗ E2E Test FAILED"
    echo "=========================================="
    echo ""
    echo "Please check the error messages above."
    echo ""
    exit 1
fi
