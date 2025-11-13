#!/bin/bash
# Setup script for local LLM testing using llama.cpp with Qwen models
# Following Unsloth guide: https://docs.unsloth.ai/models/qwen3-how-to-run-and-fine-tune

set -e

echo "=========================================="
echo "Local LLM Setup for Doc Detective Resolver"
echo "=========================================="
echo ""

# Check system dependencies
echo "Checking system dependencies..."
if ! command -v cmake &> /dev/null; then
    echo "⚠️  CMake not found. Please install CMake:"
    echo "  - Ubuntu/Debian: sudo apt install cmake"
    echo "  - macOS: brew install cmake"
    echo "  - Windows: Install from https://cmake.org/download/"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ Git not found. Please install git."
    exit 1
fi

echo "✓ CMake found: $(cmake --version | head -1)"
echo "✓ Git found"
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

# Build llama.cpp server using CMake (following Unsloth guide)
if [ ! -d "build" ] || [ ! -f "build/bin/llama-server" ]; then
    echo ""
    echo "Building llama.cpp with CMake..."
    echo "This will build the server with CPU support."
    echo "For GPU support, see local-llm/README.md"
    echo ""
    
    # Configure CMake for CPU build
    # Using LLAMA_CURL for model download support
    cmake -B build \
        -DBUILD_SHARED_LIBS=OFF \
        -DGGML_CUDA=OFF \
        -DLLAMA_CURL=ON \
        -DCMAKE_BUILD_TYPE=Release
    
    # Build the server
    cmake --build build --config Release -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4) --target llama-server
    
    echo "✓ llama-server built successfully"
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
    echo ""
    
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
echo "For GPU support or larger models, see local-llm/README.md"
echo ""
