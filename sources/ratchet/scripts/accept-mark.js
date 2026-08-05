#!/usr/bin/env node
'use strict';

const { readMark, repoRoot, snapshot, writeMark } = require('../hooks/lib/state');

const reason = process.argv.slice(2).join(' ').trim();
if (!reason) {
  console.error('usage: node scripts/accept-mark.js "<reason this codebase is allowed to be this size>"');
  process.exit(1);
}

const root = repoRoot(process.cwd());
const current = snapshot(root);
if (current.partial) {
  console.error('not a git repository, or git is unavailable');
  process.exit(1);
}

const previous = readMark(root);
writeMark(root, {
  loc: current.loc,
  sources: current.sources,
  files: current.files,
  reason,
  acceptedAt: new Date().toISOString(),
});

if (previous) {
  const delta = current.loc - previous.loc;
  console.log('mark moved ' + (delta >= 0 ? '+' : '') + delta + ' lines to ' + current.loc);
  console.log('previous reason: ' + previous.reason);
} else {
  console.log('mark set at ' + current.loc + ' lines across ' + current.sources + ' source files');
}
console.log('reason: ' + reason);
