# Local LLM Testing Setup

This directory contains scripts to set up a local LLM server for testing the Doc Detective Resolver analyzer without requiring paid API keys.

## Overview

The setup uses:
- **llama.cpp**: High-performance LLM inference engine
- **Qwen2.5-0.5B-Instruct**: Small, efficient language model (~350MB quantized)
- **OpenAI-compatible API**: Works seamlessly with existing analyzer code

## Quick Start

### 1. Initial Setup

Run the setup script to download and build everything:

```bash
cd local-llm
./setup.sh
```

This will:
- Clone llama.cpp repository
- Build the llama-server executable
- Download the Qwen2.5-0.5B-Instruct model (Q4_K_M quantized, ~350MB)

### 2. Start the Server

```bash
./start-server.sh
```

The server will start on `http://localhost:8080` with an OpenAI-compatible API.

### 3. Use with Analyzer

In your code, specify `provider: 'local'`:

```javascript
const { analyze } = require('doc-detective-resolver');

const result = await analyze(
  'Navigate to https://example.com and click Login',
  {
    provider: 'local',
    apiKey: 'local-testing-key'  // Optional, any value works
  }
);
```

## System Requirements

- **CPU**: x86_64 or ARM64 processor
- **RAM**: At least 2GB free (model uses ~1GB in memory)
- **Disk**: ~1GB for llama.cpp + model
- **OS**: Linux, macOS, or WSL2 on Windows

## Architecture

```
local-llm/
├── setup.sh           # Downloads and builds everything
├── start-server.sh    # Starts the LLM server
├── llama.cpp/         # (created by setup.sh)
│   └── llama-server   # Server executable
└── models/            # (created by setup.sh)
    └── qwen2.5-0.5b-instruct-q4_k_m.gguf
```

## Model Information

**Qwen2.5-0.5B-Instruct**
- Parameters: 494M (0.5 billion)
- Quantization: Q4_K_M (4-bit)
- Size: ~350MB
- Context: 4096 tokens
- License: Apache 2.0

This model is optimized for:
- Fast inference on CPU
- Low memory usage
- Instruction following
- JSON output generation

## API Endpoints

The llama.cpp server provides:

- **Chat Completions**: `http://localhost:8080/v1/chat/completions`
- **Completions**: `http://localhost:8080/v1/completions`
- **Models**: `http://localhost:8080/v1/models`

Compatible with OpenAI API format.

## Testing

Run the analyzer with the local provider:

```bash
# Using the integration test
cd ..
node src/analyzer/integration.test.js provider=local

# Using the example
node examples/analyzer-example-local.js
```

## Performance

Expected performance on typical hardware:

- **Tokens/second**: 20-50 (CPU-dependent)
- **First token latency**: 100-500ms
- **Memory usage**: ~1GB
- **CPU usage**: 1-4 cores

## Troubleshooting

### Port Already in Use

If port 8080 is already in use, edit `start-server.sh` and change `--port 8080` to another port (e.g., `--port 8081`). Then update your config to use `baseURL: 'http://localhost:8081/v1'`.

### Model Download Issues

If the automatic download fails, manually download the model:

```bash
cd models
wget https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf
```

### Build Errors

Make sure you have build tools installed:

```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# macOS
xcode-select --install

# Fedora/RHEL
sudo dnf groupinstall "Development Tools"
```

### Slow Performance

- Reduce context size: Edit `start-server.sh` and change `-c 4096` to `-c 2048`
- Reduce max tokens: Change `-n 2048` to `-n 1024`
- Use a smaller model (though Qwen2.5-0.5B is already quite small)

## Alternative Models

To use a different model, edit `setup.sh` and `start-server.sh`:

**Other Qwen models:**
- `qwen2.5-1.5b-instruct-q4_k_m.gguf` (~1GB) - Better quality
- `qwen2.5-3b-instruct-q4_k_m.gguf` (~2GB) - Even better quality

**Other model families:**
- Llama 3.2 (1B/3B)
- Phi-3 (3.8B)
- Gemma 2 (2B)

Download from [Hugging Face](https://huggingface.co/models?library=gguf).

## Limitations

The local model is suitable for:
- ✅ Development and testing
- ✅ CI/CD pipelines
- ✅ Learning and experimentation
- ✅ Offline usage

But not as good as cloud models for:
- ❌ Production-grade accuracy
- ❌ Complex reasoning tasks
- ❌ Handling edge cases

For production use, consider using Anthropic, Google, or OpenAI providers.

## Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## Cleanup

To remove all downloaded files:

```bash
cd local-llm
rm -rf llama.cpp models
```

## Advanced Configuration

Edit `start-server.sh` to customize:

- `--host`: Change binding address (default: 0.0.0.0)
- `--port`: Change port (default: 8080)
- `-c`: Context window size (default: 4096)
- `-n`: Max output tokens (default: 2048)
- `--api-key`: Change API key (default: local-testing-key)

See [llama.cpp documentation](https://github.com/ggerganov/llama.cpp) for more options.
