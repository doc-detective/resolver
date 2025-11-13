# Local LLM Testing - Quick Reference

This is a quick reference for using the local LLM testing solution.

## TL;DR

```bash
# Setup (one time) - requires CMake
cd local-llm && ./setup.sh

# Start server (in separate terminal)
./start-server.sh

# Test it
node ../examples/analyzer-example-local.js
```

## Prerequisites

- **CMake**: Required for building llama.cpp
  - Ubuntu/Debian: `sudo apt install cmake`
  - macOS: `brew install cmake`
  - Windows: Install from https://cmake.org/download/

## What Gets Installed

- **llama.cpp** (~50MB): Efficient LLM inference engine (built with CMake)
- **Qwen2.5-0.5B** (~350MB): Small instruction-tuned model
- **Build artifacts** (~50MB): CMake build directory
- **Total**: ~450MB disk space, ~1GB RAM when running

## Commands

| Command | Description |
|---------|-------------|
| `./setup.sh` | Download and build everything with CMake (run once) |
| `./start-server.sh` | Start the LLM server on port 8080 |
| `./test-setup.sh` | Verify setup is correct |

## Using in Code

```javascript
// Instead of:
const result = await analyze(doc, {
  provider: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Use:
const result = await analyze(doc, {
  provider: 'local',
  apiKey: 'local-testing-key'  // Any string works
});
```

## Testing

```bash
# Run example
node examples/analyzer-example-local.js

# Run integration tests
node src/analyzer/integration.test.js provider=local
```

## Comparison

| Aspect | Cloud Providers | Local Provider |
|--------|----------------|----------------|
| API Key | Required ($$$) | Not needed |
| Internet | Required | Not needed |
| Quality | Excellent | Good for testing |
| Speed | Fast (datacenter) | Moderate (CPU) |
| Cost | Pay per token | Free |
| Setup | None | One-time setup |

## When to Use What

**Use Local Provider for:**
- Development and testing
- CI/CD pipelines
- Learning the API
- Offline environments
- Cost-sensitive scenarios

**Use Cloud Providers for:**
- Production deployments
- Best accuracy needed
- Complex reasoning tasks
- High-volume processing

## Troubleshooting

### Server won't start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Use different port
# Edit start-server.sh and change --port 8080
```

### Model quality is poor
This is expected - it's a very small model (0.5B parameters). For better quality, use cloud providers or upgrade to a larger local model (see local-llm/README.md).

### Out of memory
Reduce context size in start-server.sh:
```bash
-c 2048  # Instead of 4096
-n 1024  # Instead of 2048
```

## More Information

See [local-llm/README.md](README.md) for complete documentation.
