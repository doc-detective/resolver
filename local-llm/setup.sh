#!/bin/bash
# Setup script for local LLM testing using llama.cpp with Qwen3 0.6b

set -e

echo "=========================================="
echo "Local LLM Setup for Doc Detective Resolver"
echo "=========================================="
echo ""

# Check if llama.cpp directory already exists
if [ -d "llama.cpp" ]; then
    echo "✓ llama.cpp directory already exists"
else
    echo "Cloning llama.cpp repository..."
    git clone https://github.com/ggerganov/llama.cpp.git
    echo "✓ llama.cpp cloned"
fi

cd llama.cpp

# Build llama.cpp server if not already built
if [ ! -f "llama-server" ]; then
    echo ""
    echo "Building llama.cpp server..."
    make llama-server -j$(nproc)
    echo "✓ llama-server built"
else
    echo "✓ llama-server already built"
fi

cd ..

# Check if model already exists
MODEL_DIR="models"
MODEL_FILE="$MODEL_DIR/qwen2.5-0.5b-instruct-q4_k_m.gguf"

mkdir -p "$MODEL_DIR"

if [ -f "$MODEL_FILE" ]; then
    echo "✓ Model already downloaded"
else
    echo ""
    echo "Downloading Qwen2.5-0.5B-Instruct model (quantized Q4_K_M)..."
    echo "This is a small, efficient model suitable for testing (~350MB)"
    
    # Download using wget or curl
    if command -v wget &> /dev/null; then
        wget -P "$MODEL_DIR" "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    elif command -v curl &> /dev/null; then
        curl -L -o "$MODEL_FILE" "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf"
    else
        echo "Error: Neither wget nor curl is available. Please install one of them."
        exit 1
    fi
    
    echo "✓ Model downloaded"
fi

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "To start the local LLM server, run:"
echo "  cd local-llm && ./start-server.sh"
echo ""
echo "The server will be available at: http://localhost:8080"
echo "Compatible with OpenAI API format"
echo ""
