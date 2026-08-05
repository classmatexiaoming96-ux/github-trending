#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ratchetDir, repoRoot, snapshot, writeMark } = require('../hooks/lib/state');

const root = repoRoot(process.cwd());
const dir = ratchetDir(root);
fs.mkdirSync(dir, { recursive: true });

const configPath = path.join(dir, 'config.json');
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(
    configPath,
    JSON.stringify({ mode: 'guard', budget: {}, ignore: [] }, null, 2) + '\n',
    'utf8'
  );
}

const current = snapshot(root);
if (!current.partial) {
  writeMark(root, {
    loc: current.loc,
    sources: current.sources,
    files: current.files,
    reason: 'initial mark',
    acceptedAt: new Date().toISOString(),
  });
  console.log('ratchet initialised at ' + current.loc + ' lines across ' + current.sources + ' source files');
} else {
  console.log('ratchet initialised, but this is not a git repository');
  console.log('the ruleset and the detectors work; the mark, the ledger and the audit need git');
}
console.log('commit ' + path.relative(root, dir) + ' so the whole team shares the mark');
