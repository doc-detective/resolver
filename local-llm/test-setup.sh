#!/bin/bash
# Quick test script for local LLM setup

echo "=========================================="
echo "Local LLM Setup Test"
echo "=========================================="
echo ""

# Check if llama.cpp exists
if [ ! -d "llama.cpp" ]; then
    echo "❌ llama.cpp not found. Run ./setup.sh first."
    exit 1
fi
echo "✓ llama.cpp directory exists"

# Check if llama-server is built (check both CMake and make locations)
if [ -f "llama.cpp/build/bin/llama-server" ]; then
    echo "✓ llama-server executable exists (CMake build)"
elif [ -f "llama.cpp/llama-server" ]; then
    echo "✓ llama-server executable exists (make build)"
else
    echo "❌ llama-server not built. Run ./setup.sh first."
    exit 1
fi

# Check if model exists
if [ ! -f "models/qwen2.5-0.5b-instruct-q4_k_m.gguf" ]; then
    echo "❌ Model not downloaded. Run ./setup.sh first."
    exit 1
fi
echo "✓ Model file exists"

# Check if server is running
echo ""
echo "Checking if server is running..."
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo "✓ Server is running on http://localhost:8080"
    echo ""
    echo "You can now run the local examples:"
    echo "  node ../examples/analyzer-example-local.js"
    echo "  node ../src/analyzer/integration.test.js provider=local"
else
    echo "⚠ Server is not running"
    echo ""
    echo "Start the server with:"
    echo "  ./start-server.sh"
    echo ""
    echo "Then run the examples in another terminal."
fi

echo ""
echo "=========================================="
echo "Setup verification complete!"
echo "=========================================="
