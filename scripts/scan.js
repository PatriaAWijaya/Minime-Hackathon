#!/usr/bin/env node
/* Credential scan (Block J): fail if a secret-looking pattern appears in
 * tracked source/docs. It scans text files, skipping node_modules, dist,
 * .git, data/ (runtime ledger/db) and the scan script itself.
 * Patterns are generic (key assignments, bearer tokens, sk-/AIza-style
 * values); .env.example contains only variable NAMES and is allow-listed
 * because it has no values. */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data']);
const ALLOW_FILES = new Set(['.env.example', 'scan.js']);
const PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /(api[_-]?key|api[_-]?token|secret|password)\s*=\s*["'][^"']{8,}["']/i,
];
let hits = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name));
    } else if (/\.(ts|js|json|md|txt)$/.test(e.name) && !ALLOW_FILES.has(e.name)) {
      const p = path.join(dir, e.name);
      const text = fs.readFileSync(p, 'utf8');
      for (const pat of PATTERNS) {
        if (pat.test(text)) hits.push(`${path.relative(ROOT, p)} matches ${pat}`);
      }
    }
  }
}
walk(ROOT);
if (hits.length) {
  console.error('CREDENTIAL SCAN FAILED:');
  for (const h of hits) console.error(' - ' + h);
  process.exit(1);
}
console.log('CREDENTIAL SCAN PASSED: no secret-looking values in tracked source/docs');
