#!/usr/bin/env node

/**
 * Coverage Ratchet Script
 * 
 * Compares current coverage metrics against stored thresholds.
 * Fails if any metric decreases (coverage can only go up).
 * 
 * Usage: npm run coverage:ratchet
 */

const fs = require('fs');
const path = require('path');

const THRESHOLDS_FILE = path.join(__dirname, '..', 'coverage-thresholds.json');
const COVERAGE_FILE = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

function loadJSON(filePath, description) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${description} not found at ${filePath}`);
    console.error('Run "npm run test:coverage" first to generate coverage data.');
    process.exit(1);
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error parsing ${description}: ${error.message}`);
    process.exit(1);
  }
}

function main() {
  console.log('Coverage Ratchet Check');
  console.log('======================\n');
  
  const thresholds = loadJSON(THRESHOLDS_FILE, 'Thresholds file');
  const coverage = loadJSON(COVERAGE_FILE, 'Coverage summary');
  
  const current = coverage.total;
  const metrics = ['lines', 'branches', 'functions', 'statements'];
  
  let failed = false;
  const results = [];
  
  for (const metric of metrics) {
    const threshold = thresholds[metric];
    const actual = current[metric].pct;
    const diff = (actual - threshold).toFixed(2);
    const status = actual >= threshold ? 'PASS' : 'FAIL';
    
    if (status === 'FAIL') {
      failed = true;
    }
    
    results.push({
      metric,
      threshold,
      actual,
      diff: parseFloat(diff),
      status
    });
  }
  
  // Print results table
  console.log('Metric      | Threshold | Actual  | Diff    | Status');
  console.log('------------|-----------|---------|---------|-------');
  
  for (const r of results) {
    const diffStr = r.diff >= 0 ? `+${r.diff}%` : `${r.diff}%`;
    const statusIcon = r.status === 'PASS' ? 'PASS' : 'FAIL';
    console.log(
      `${r.metric.padEnd(11)} | ${String(r.threshold + '%').padEnd(9)} | ${String(r.actual + '%').padEnd(7)} | ${diffStr.padEnd(7)} | ${statusIcon}`
    );
  }
  
  console.log('');
  
  if (failed) {
    console.error('Coverage has decreased! Please add tests to maintain or increase coverage.');
    process.exit(1);
  } else {
    console.log('All coverage thresholds met or exceeded.');
    
    // Check if we should suggest updating thresholds
    const improvements = results.filter(r => r.diff >= 1);
    if (improvements.length > 0) {
      console.log('\nConsider updating thresholds in coverage-thresholds.json:');
      for (const r of improvements) {
        console.log(`  "${r.metric}": ${Math.floor(r.actual)}`);
      }
    }
    
    process.exit(0);
  }
}

main();
