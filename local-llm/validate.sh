#!/bin/bash
# Validation script for local LLM integration
# Checks that all components are properly configured without requiring the server to run

set -e

echo "=========================================="
echo "Local LLM Integration Validation"
echo "=========================================="
echo ""

ERRORS=0
WARNINGS=0

# Check 1: Verify setup scripts exist
echo "Check 1: Setup scripts..."
if [ -f "setup.sh" ] && [ -x "setup.sh" ]; then
    echo "  ✓ setup.sh exists and is executable"
else
    echo "  ✗ setup.sh missing or not executable"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "start-server.sh" ] && [ -x "start-server.sh" ]; then
    echo "  ✓ start-server.sh exists and is executable"
else
    echo "  ✗ start-server.sh missing or not executable"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "test-setup.sh" ] && [ -x "test-setup.sh" ]; then
    echo "  ✓ test-setup.sh exists and is executable"
else
    echo "  ✗ test-setup.sh missing or not executable"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "test-e2e.sh" ] && [ -x "test-e2e.sh" ]; then
    echo "  ✓ test-e2e.sh exists and is executable"
else
    echo "  ✗ test-e2e.sh missing or not executable"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 2: Verify documentation exists
echo "Check 2: Documentation..."
if [ -f "README.md" ]; then
    echo "  ✓ README.md exists"
else
    echo "  ✗ README.md missing"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "QUICKSTART.md" ]; then
    echo "  ✓ QUICKSTART.md exists"
else
    echo "  ✗ QUICKSTART.md missing"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 3: Verify provider code supports local
echo "Check 3: Provider code..."
cd ..
if grep -q "case 'local':" src/llm/provider.js; then
    echo "  ✓ Local provider case exists in provider.js"
else
    echo "  ✗ Local provider case missing in provider.js"
    ERRORS=$((ERRORS + 1))
fi

if grep -q "baseURL" src/llm/provider.js; then
    echo "  ✓ baseURL support exists in provider.js"
else
    echo "  ✗ baseURL support missing in provider.js"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 4: Verify examples exist
echo "Check 4: Example scripts..."
if [ -f "examples/analyzer-example-local.js" ]; then
    echo "  ✓ Local example exists"
else
    echo "  ✗ Local example missing"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 5: Verify integration test supports local
echo "Check 5: Integration test..."
if grep -q "case 'local':" src/analyzer/integration.test.js; then
    echo "  ✓ Local provider supported in integration test"
else
    echo "  ✗ Local provider missing in integration test"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 6: Verify unit tests exist
echo "Check 6: Unit tests..."
if [ -f "src/llm/provider.test.js" ]; then
    echo "  ✓ Provider unit tests exist"
    
    # Check if tests cover local provider
    if grep -q "Local LLM Provider" src/llm/provider.test.js; then
        echo "  ✓ Local provider tests exist"
    else
        echo "  ⚠️  Local provider tests may be missing"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "  ✗ Provider unit tests missing"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 7: Run unit tests
echo "Check 7: Running unit tests..."
if npm test > /tmp/test-output.txt 2>&1; then
    PASSING=$(grep -o "[0-9]* passing" /tmp/test-output.txt | head -1 || echo "0 passing")
    echo "  ✓ All tests pass ($PASSING)"
else
    echo "  ✗ Some tests failed"
    tail -20 /tmp/test-output.txt
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Check 8: Verify local provider can be instantiated
echo "Check 8: Provider instantiation..."
node -e "
const { createProvider } = require('./src/llm/provider');
try {
  const config = { provider: 'local', apiKey: 'test' };
  const provider = createProvider(config);
  console.log('  ✓ Local provider instantiates successfully');
  process.exit(0);
} catch (e) {
  console.log('  ✗ Failed to instantiate local provider:', e.message);
  process.exit(1);
}
" || ERRORS=$((ERRORS + 1))

echo ""

# Check 9: Verify .gitignore excludes local-llm artifacts
echo "Check 9: Git configuration..."
if grep -q "local-llm/llama.cpp" .gitignore; then
    echo "  ✓ llama.cpp directory excluded from git"
else
    echo "  ⚠️  llama.cpp directory may not be excluded from git"
    WARNINGS=$((WARNINGS + 1))
fi

if grep -q "local-llm/models" .gitignore; then
    echo "  ✓ models directory excluded from git"
else
    echo "  ⚠️  models directory may not be excluded from git"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check 10: Verify setup would work (without actually running it)
echo "Check 10: Setup script validation..."
cd local-llm
if bash -n setup.sh; then
    echo "  ✓ setup.sh syntax is valid"
else
    echo "  ✗ setup.sh has syntax errors"
    ERRORS=$((ERRORS + 1))
fi

if bash -n start-server.sh; then
    echo "  ✓ start-server.sh syntax is valid"
else
    echo "  ✗ start-server.sh has syntax errors"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Summary
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✓ All checks passed!"
    echo ""
    echo "The local LLM integration is properly configured."
    echo ""
    echo "To test it with an actual LLM server:"
    echo "  1. Run: ./setup.sh"
    echo "  2. Run: ./start-server.sh (in another terminal)"
    echo "  3. Run: ./test-e2e.sh"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "✓ All critical checks passed"
    echo "⚠️  $WARNINGS warning(s) found (non-critical)"
    echo ""
    exit 0
else
    echo "✗ $ERRORS error(s) found"
    if [ $WARNINGS -gt 0 ]; then
        echo "⚠️  $WARNINGS warning(s) found"
    fi
    echo ""
    echo "Please fix the errors above before proceeding."
    echo ""
    exit 1
fi
