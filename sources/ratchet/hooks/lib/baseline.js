'use strict';

const fs = require('fs');
const path = require('path');
const { fingerprint } = require('./detect');
const { ratchetDir } = require('./state');

function baselinePath(root) {
  return path.join(ratchetDir(root), 'baseline.json');
}

function read(root) {
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath(root), 'utf8'));
    return new Set(Array.isArray(raw.accepted) ? raw.accepted : []);
  } catch (e) {
    return new Set();
  }
}

function write(root, fingerprints, note) {
  const file = baselinePath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    recordedAt: new Date().toISOString(),
    note: note || 'findings that predate the ratchet',
    accepted: [...new Set(fingerprints)].sort(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

function filter(findings, accepted, relativeFor) {
  if (!accepted || accepted.size === 0) return findings;
  return findings.filter((finding) => !accepted.has(fingerprint(finding, relativeFor(finding))));
}

module.exports = { filter, read, write };
