# Test Coverage Strategy for doc-detective-resolver

**Date:** January 7, 2026  
**Status:** Implemented  
**Coverage Achieved:** 75.47% statements, 82.37% branches, 86.66% functions

## Overview

This document describes the test coverage strategy implemented for the doc-detective-resolver package. The goal was to establish a comprehensive testing infrastructure with a ratchet mechanism to ensure coverage only increases over time.

## Implementation Summary

### Phase 1: Infrastructure (Completed)

1. **Installed c8** as the coverage tool (dev dependency)
2. **Created `.c8rc.json`** with reporters: text, lcov, json, json-summary
3. **Created `coverage-thresholds.json`** with baseline metrics
4. **Created `scripts/check-coverage-ratchet.js`** - ratchet mechanism script
5. **Updated `package.json`** with coverage scripts:
   - `test:coverage` - runs unit tests with coverage
   - `test:integration:coverage` - runs integration tests with coverage
   - `test:all:coverage` - runs all tests with coverage
   - `coverage:check` - checks coverage thresholds
   - `coverage:ratchet` - runs the ratchet script

6. **Updated CI workflows:**
   - `.github/workflows/auto-dev-release.yml` - runs coverage with ratchet check
   - `.github/workflows/integration-tests.yml` - runs integration coverage and uploads artifacts

### Phase 2: Test Files (Completed)

| File | Tests | Coverage After |
|------|-------|----------------|
| `src/openapi.test.js` | ~25 tests | 95.83% |
| `src/arazzo.test.js` | ~19 tests | 100% |
| `src/utils.test.js` | ~35 tests | 67.87% |
| `src/sanitize.test.js` | ~12 tests | 100% |
| `src/telem.test.js` | ~9 tests | 100% |
| `src/resolve.test.js` | ~27 tests | 91.91% |

**Total: 225 passing tests**

### Phase 3: Gap Filling (Completed)

Added targeted tests to improve coverage in:
- `resolve.js` - OpenAPI document fetching paths
- `resolve.js` - All driver actions coverage
- Various edge cases and error handling paths

### Phase 4: AI Tooling (Completed)

1. **Created `.claude/skills/tdd-coverage/SKILL.md`** - TDD skill definition
2. **Updated `AGENTS.md`** - Added comprehensive testing section
3. **Created `CLAUDE.md`** - Pointer file for Claude AI assistants

## Current Coverage Metrics

```
File         | % Stmts | % Branch | % Funcs | % Lines
-------------|---------|----------|---------|--------
All files    |   75.47 |    82.37 |   86.66 |   75.47
arazzo.js    |     100 |    96.42 |     100 |     100
config.js    |   91.59 |    71.92 |     100 |   91.59
heretto.js   |   55.41 |    89.04 |   66.66 |   55.41
index.js     |   92.79 |    71.42 |     100 |   92.79
openapi.js   |   95.83 |    93.25 |     100 |   95.83
resolve.js   |   91.91 |    95.12 |   85.71 |   91.91
sanitize.js  |     100 |      100 |     100 |     100
telem.js     |     100 |    97.05 |     100 |     100
utils.js     |   67.87 |    71.94 |   91.66 |   67.87
```

## Coverage Thresholds

Current thresholds in `coverage-thresholds.json`:
- Lines: 75%
- Branches: 82%
- Functions: 86%
- Statements: 75%

## Ratchet Mechanism

The ratchet script (`scripts/check-coverage-ratchet.js`) ensures coverage cannot decrease:
1. Reads current coverage from `coverage/coverage-summary.json`
2. Compares against thresholds in `coverage-thresholds.json`
3. Fails the build if any metric decreases
4. Optionally updates thresholds to new higher values

## Files Created/Modified

### Created
- `.c8rc.json` - c8 configuration
- `coverage-thresholds.json` - Coverage minimums
- `scripts/check-coverage-ratchet.js` - Ratchet mechanism
- `src/openapi.test.js` - OpenAPI module tests
- `src/arazzo.test.js` - Arazzo workflow tests
- `src/utils.test.js` - Utility function tests
- `src/resolve.test.js` - Resolution module tests
- `src/sanitize.test.js` - Sanitization tests
- `src/telem.test.js` - Telemetry tests
- `.claude/skills/tdd-coverage/SKILL.md` - TDD skill
- `CLAUDE.md` - AI assistant pointer file

### Modified
- `package.json` - Added coverage scripts
- `src/arazzo.js` - Added export for `workflowToTest`
- `AGENTS.md` - Added testing strategy section
- `.github/workflows/auto-dev-release.yml` - Coverage in CI
- `.github/workflows/integration-tests.yml` - Integration coverage

## Remaining Work

Files with lower coverage that could benefit from additional tests:
- `heretto.js` (55.41%) - Complex Heretto integration logic
- `utils.js` (67.87%) - Some utility functions uncovered
- `config.js` (91.59%) - Some config edge cases

## Usage

### Running Tests with Coverage
```bash
npm run test:coverage
```

### Checking Coverage Doesn't Decrease
```bash
npm run coverage:ratchet
```

### CI Integration
Coverage checks run automatically on:
- Push to main branch
- Pull requests
- Dev releases

## TDD Workflow

For new development, follow the TDD skill in `.claude/skills/tdd-coverage/SKILL.md`:
1. Write tests first (red)
2. Implement code (green)
3. Refactor if needed
4. Run `npm run coverage:ratchet` to verify coverage hasn't decreased
