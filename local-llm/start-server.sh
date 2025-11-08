#!/bin/bash
# Start llama.cpp server with Qwen2.5-0.5B-Instruct model

set -e

MODEL_FILE="models/qwen2.5-0.5b-instruct-q4_k_m.gguf"

# Check if model exists
if [ ! -f "$MODEL_FILE" ]; then
    echo "Error: Model file not found: $MODEL_FILE"
    echo "Please run ./setup.sh first"
    exit 1
fi

# Check if llama-server exists
if [ ! -f "llama.cpp/llama-server" ]; then
    echo "Error: llama-server not found"
    echo "Please run ./setup.sh first"
    exit 1
fi

echo "=========================================="
echo "Starting Local LLM Server"
echo "=========================================="
echo ""
echo "Model: Qwen2.5-0.5B-Instruct (Q4_K_M)"
echo "Server: http://localhost:8080"
echo "API: OpenAI-compatible"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""
echo "=========================================="
echo ""

# Start the server with OpenAI-compatible API
cd llama.cpp
./llama-server \
    -m "../$MODEL_FILE" \
    --host 0.0.0.0 \
    --port 8080 \
    -c 4096 \
    -n 2048 \
    --log-disable \
    --api-key "local-testing-key"

# Note: The server provides an OpenAI-compatible API at:
# - Chat completions: http://localhost:8080/v1/chat/completions
# - Completions: http://localhost:8080/v1/completions
