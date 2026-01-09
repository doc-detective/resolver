# Claude Instructions

This file points to the main instruction files for Claude.

## Primary Instructions

See [AGENTS.md](./AGENTS.md) for complete project instructions including:
- Project overview and key concepts
- Code structure and main modules
- Development patterns
- API usage patterns
- Testing strategy and TDD workflow

## Skills

Available skills in `.claude/skills/`:

- **tdd-coverage**: Test-Driven Development workflow with coverage requirements. Use when writing or modifying code.

## Quick Reference

### Running Tests
```bash
npm test                    # Run all tests
npm run test:coverage       # Run tests with coverage
npm run coverage:ratchet    # Ensure coverage doesn't decrease
```

### Key Files
- `src/index.js` - Main entry point
- `src/config.js` - Configuration handling
- `src/utils.js` - Utility functions
- `coverage-thresholds.json` - Coverage minimums
