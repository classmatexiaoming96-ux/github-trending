'use strict';

const fs = require('fs');
const path = require('path');
const { ignoredPaths, projectConfig } = require('./config');
const { isTestPath } = require('./paths');
const { fingerprint, inspect } = require('./detect');
const { buildIndex } = require('./index-symbols');
const { trackedFiles } = require('./state');

const SCANNABLE = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.go', '.rb',
  '.html', '.htm', '.vue', '.svelte',
]);

function canScan(root) {
  return trackedFiles(root) !== null;
}

function candidates(root) {
  const files = trackedFiles(root);
  if (!files) return [];
  const ignore = ignoredPaths(root);
  const scanTests = projectConfig(root).scanTests === true;
  return files.filter((relative) => {
    if (ignore.some((dir) => relative.split('/').includes(dir))) return false;
    if (!scanTests && isTestPath(relative)) return false;
    return SCANNABLE.has(path.extname(relative));
  });
}

function auditRepo(root, options = {}) {
  const symbols = buildIndex(root, { noCache: options.noCache });
  const context = { root, symbols, countImplementations: () => 2 };
  const findings = [];
  const limit = options.maxBytes || 400 * 1024;

  for (const relative of candidates(root)) {
    const full = path.join(root, relative);
    let after;
    try {
      if (fs.statSync(full).size > limit) continue;
      after = fs.readFileSync(full, 'utf8');
    } catch (e) {
      continue;
    }
    const change = { path: full, before: '', after };
    for (const finding of inspect(change, context).findings) {
      finding.path = relative;
      findings.push(finding);
    }
  }
  return findings;
}

function fingerprints(findings) {
  return findings.map((finding) => fingerprint(finding, finding.path));
}

module.exports = { auditRepo, canScan, candidates, fingerprints };
