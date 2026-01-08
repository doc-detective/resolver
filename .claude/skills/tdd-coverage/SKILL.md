# TDD and Coverage Skill

**Type:** Rigid (follow exactly)

## When to Use

Use this skill when:
- Creating new functionality
- Modifying existing code
- Fixing bugs
- Refactoring

## Mandatory Process

### 1. Test First (TDD)

Before writing or modifying any implementation code:

1. **Write the test(s)** that describe the expected behavior
2. **Run the test** - it should FAIL (red)
3. **Write the implementation** to make the test pass
4. **Run the test** - it should PASS (green)
5. **Refactor** if needed, keeping tests passing

### 2. Coverage Verification

After any code change:

```bash
# Run tests with coverage
npm run test:coverage

# Verify coverage hasn't decreased
npm run coverage:ratchet
```

**Coverage must not decrease.** If ratchet check fails:
1. Add tests for uncovered code
2. Re-run coverage until ratchet passes

### 3. Coverage Thresholds

Current thresholds are in `coverage-thresholds.json`. These values must only increase:

| Metric | Current Threshold |
|--------|-------------------|
| Lines | 75% |
| Statements | 75% |
| Functions | 86% |
| Branches | 82% |

### 4. Test Location

Tests are co-located with source files in `src/`:

| Code | Test File |
|------|-----------|
| `src/openapi.js` | `src/openapi.test.js` |
| `src/arazzo.js` | `src/arazzo.test.js` |
| `src/utils.js` | `src/utils.test.js` |
| `src/resolve.js` | `src/resolve.test.js` |
| `src/sanitize.js` | `src/sanitize.test.js` |
| `src/telem.js` | `src/telem.test.js` |
| `src/config.js` | `src/config.test.js` |
| `src/heretto.js` | `src/heretto.test.js` |
| `src/index.js` | `src/index.test.js` |

### 5. Test Structure Pattern

```javascript
const { expect } = require("chai");
const sinon = require("sinon");
const { functionUnderTest } = require("./module");

describe("Module Name", function () {
  let consoleLogStub;

  beforeEach(function () {
    consoleLogStub = sinon.stub(console, "log");
  });

  afterEach(function () {
    consoleLogStub.restore();
  });

  describe("functionUnderTest", function () {
    describe("input validation", function () {
      it("should throw error when required param missing", function () {
        expect(() => functionUnderTest()).to.throw();
      });
    });

    describe("happy path", function () {
      it("should return expected result for valid input", function () {
        const result = functionUnderTest({ validInput: true });
        expect(result).to.deep.equal(expectedOutput);
      });
    });

    describe("edge cases", function () {
      it("should handle boundary condition", function () {
        // test edge case
      });
    });
  });
});
```

### 6. Checklist

Before completing any code change:

- [ ] Tests written BEFORE implementation (or for existing code: tests added)
- [ ] All tests pass (`npm test`)
- [ ] Coverage hasn't decreased (`npm run coverage:ratchet`)
- [ ] New code has corresponding test coverage
- [ ] Error paths are tested (not just happy paths)

## Commands Reference

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run coverage ratchet check (prevents coverage decrease)
npm run coverage:ratchet

# Check coverage thresholds
npm run coverage:check

# Run integration tests with coverage
npm run test:integration:coverage

# Run all tests with coverage
npm run test:all:coverage
```

## Common Patterns

### Testing async functions

```javascript
it("should handle async operation", async function () {
  const result = await asyncFunction();
  expect(result).to.exist;
});
```

### Mocking with Sinon

```javascript
const stub = sinon.stub(fs, "readFileSync").returns("mock content");
try {
  const result = functionUnderTest();
  expect(result).to.equal("expected");
} finally {
  stub.restore();
}
```

### Stubbing console.log (for log() function tests)

```javascript
let consoleLogStub;

beforeEach(function () {
  consoleLogStub = sinon.stub(console, "log");
});

afterEach(function () {
  consoleLogStub.restore();
});
```

### Testing error handling

```javascript
it("should throw on invalid input", function () {
  expect(() => functionUnderTest(null)).to.throw(/error message/);
});
```

### Testing with temporary files

```javascript
const os = require("os");
const path = require("path");
const fs = require("fs");

let tempDir;
let tempFile;

beforeEach(function () {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "test-"));
  tempFile = path.join(tempDir, "test-file.txt");
  fs.writeFileSync(tempFile, "test content");
});

afterEach(function () {
  if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
});
```

### Testing OpenAPI operations

```javascript
it("should parse OpenAPI spec", async function () {
  const spec = {
    openapi: "3.0.0",
    info: { title: "Test API", version: "1.0.0" },
    paths: {
      "/test": {
        get: { operationId: "testOp", responses: { 200: { description: "OK" } } }
      }
    }
  };
  const result = await loadDescription(JSON.stringify(spec));
  expect(result.info.title).to.equal("Test API");
});
```

## Project-Specific Notes

- Use `config.logLevel = "error"` in tests to suppress log output
- The `log()` function from `utils.js` checks config.logLevel before logging
- OpenAPI specs can be loaded from files or URLs using `loadDescription()`
- The Arazzo workflow format is supported via `workflowToTest()`
