#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { normalizeMode, resolveBudget, resolveMode } = require('./lib/config');
const { block, emit, readStdin, useRoot } = require('./lib/host');
const { CERTAIN, budgetFindings, fingerprint, inspect } = require('./lib/detect');
const { isManifest } = require('./lib/changes');
const { buildIndex } = require('./lib/index-symbols');
const { alignedFindings } = require('./lib/render');
const { isTestPath, relativePosix } = require('./lib/paths');
const baseline = require('./lib/baseline');
const { emptySession, readSession, repoRoot, writeSession } = require('./lib/state');

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'str_replace', 'create_file']);
const MAX_REPORTED = 8;

function git(root, args, fallback) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return fallback;
  }
}

function committedContent(root, filePath) {
  return git(root, ['show', 'HEAD:' + relativePosix(root, filePath)], null);
}

function wholeFile(root, filePath) {
  try {
    return { path: filePath, before: committedContent(root, filePath) || '', after: fs.readFileSync(filePath, 'utf8') };
  } catch (e) {
    return null;
  }
}

function changesFrom(payload, root) {
  const input = payload.tool_input || {};
  const filePath = input.file_path || input.path || input.notebook_path;
  if (!filePath) return [];

  if (isManifest(filePath)) {
    const change = wholeFile(root, filePath);
    return change ? [change] : [];
  }

  const edits = Array.isArray(input.edits) ? input.edits : [input];
  if (edits.some((edit) => typeof edit.old_string === 'string' || typeof edit.new_string === 'string')) {
    return edits.map((edit) => ({ path: filePath, before: edit.old_string || '', after: edit.new_string || '' }));
  }

  const content = typeof input.content === 'string' ? input.content : input.file_text;
  if (typeof content !== 'string') return [];
  return [{ path: filePath, before: committedContent(root, filePath) || '', after: content }];
}

function isNewFile(root, filePath, session) {
  if (session.newFiles.includes(relativePosix(root, filePath))) return false;
  return committedContent(root, filePath) === null;
}

function countImplementations(root, name) {
  return git(root, ['grep', '-lE', '(implements|extends|\\(\\s*)' + name + '\\b'], '').split('\n').filter(Boolean).length;
}

function headline(session, budget, mode) {
  const net = session.addedLines - session.removedLines;
  return [
    'ratchet ' + mode,
    '+' + session.addedLines + ' -' + session.removedLines + ' lines (net ' + (net >= 0 ? '+' : '') + net + '/' + budget.addedLines + ')',
    session.newFiles.length + '/' + budget.newFiles + ' new files',
    session.deps.length + '/' + budget.newDeps + ' new deps',
  ].join('  \u00b7  ');
}

async function main() {
  const payload = await readStdin();
  if (!EDIT_TOOLS.has(payload.tool_name)) return;
  if (payload.tool_response && payload.tool_response.error) return;

  const root = repoRoot(payload.cwd || process.cwd());
  useRoot(root);
  const stored = readSession(payload.session_id);
  const mode = (stored && normalizeMode(stored.mode)) || resolveMode(root);
  if (mode === 'off') return;

  const budget = resolveBudget(mode, root);
  const session = stored || emptySession(payload.session_id, mode, root);
  session.mode = mode;
  session.removedLines = session.removedLines || 0;

  const changes = changesFrom(payload, root);
  if (!changes.length) return;

  const context = {
    root,
    symbols: buildIndex(root),
    countImplementations: (name) => countImplementations(root, name),
  };
  const accepted = baseline.read(root);
  const fresh = [];

  for (const change of changes) {
    const relative = relativePosix(root, change.path);
    if (relative.startsWith('..') || isTestPath(relative)) continue;
    if (isNewFile(root, change.path, session)) session.newFiles.push(relative);
    if (!session.touchedFiles.includes(relative)) session.touchedFiles.push(relative);

    const result = inspect(change, context);
    session.addedLines += result.added.length;
    session.removedLines += result.removed.length;

    const surviving = baseline.filter(result.findings, accepted, () => relative);
    for (const finding of surviving) {
      if (finding.dep && !session.deps.includes(finding.dep)) session.deps.push(finding.dep);
      const key = fingerprint(finding, relative);
      if (session.reported.includes(key)) continue;
      session.reported.push(key);
      finding.path = relative;
      session.findings.push(finding);
      fresh.push(finding);
    }
  }

  const overruns = budget.enforce === 'silent' ? [] : budgetFindings(session, budget);
  writeSession(session);

  const shown = [...fresh, ...overruns].slice(0, MAX_REPORTED);
  if (!shown.length) return;

  const hidden = fresh.length + overruns.length - shown.length;
  const body =
    headline(session, budget, mode) +
    '\n\n' +
    alignedFindings(shown) +
    (hidden > 0 ? '\n\n' + hidden + ' more not shown' : '');

  const blocking =
    budget.enforce === 'block' &&
    (overruns.length > 0 || fresh.some((finding) => finding.confidence === CERTAIN));

  if (blocking) {
    block('PostToolUse', body + '\n\nStrict mode. Revert or shrink this change, or ask the user to raise the budget.');
    return;
  }

  emit(
    'PostToolUse',
    body + '\n\nFix what applies, then continue. Wrong call? say so, or mark the line with: ratchet-ignore: reason'
  );
}

main().catch(() => process.exit(0));
