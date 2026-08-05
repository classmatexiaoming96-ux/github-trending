#!/usr/bin/env node
'use strict';

const { emit, readStdin, useRoot } = require('./lib/host');
const { alignedFindings } = require('./lib/render');
const {
  appendLedger,
  clearSession,
  enabledForRepo,
  readSession,
  repoRoot,
  snapshot,
} = require('./lib/state');

function tally(findings) {
  const counts = new Map();
  for (const finding of findings) counts.set(finding.tag, (counts.get(finding.tag) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => tag + ' ' + count)
    .join(', ');
}

async function main() {
  const payload = await readStdin();
  const session = readSession(payload.session_id);
  if (!session || session.mode === 'off') return;

  const root = session.root || repoRoot(payload.cwd || process.cwd());
  useRoot(root);
  const removed = session.removedLines || 0;
  const net = session.addedLines - removed;
  const lines = [
    'ratchet ' + session.mode + ' session  ·  +' + session.addedLines + ' -' + removed +
      ' lines (net ' + (net >= 0 ? '+' : '') + net + ')  ·  ' +
      session.touchedFiles.length + ' files touched, ' + session.newFiles.length + ' new  ·  ' +
      session.deps.length + ' new deps',
  ];

  if (session.findings.length) {
    lines.push('', 'flagged: ' + tally(session.findings), '', alignedFindings(session.findings.slice(-5)));
  }

  if (enabledForRepo(root) && session.baseline && !session.baseline.partial) {
    const after = snapshot(root);
    const locDelta = after.loc - session.baseline.loc;
    const fileDelta = after.sources - session.baseline.sources;
    lines.push(
      '',
      'repository  ' + after.loc + ' lines (' + (locDelta >= 0 ? '+' : '') + locDelta + '), ' +
        after.sources + ' source files (' + (fileDelta >= 0 ? '+' : '') + fileDelta + ')'
    );

    if (session.mark && after.loc > session.mark.loc) {
      lines.push(
        'above the mark by ' + (after.loc - session.mark.loc) +
          ' lines. Accept it with a reason via /ratchet-accept, or bring it down.'
      );
    } else if (session.mark) {
      lines.push('at or below the mark of ' + session.mark.loc + ' lines');
    }

    appendLedger(root, {
      at: new Date().toISOString(),
      sessionId: session.sessionId,
      mode: session.mode,
      addedLines: session.addedLines,
      removedLines: removed,
      newFiles: session.newFiles,
      deps: session.deps,
      findings: session.findings.map((finding) => ({
        tag: finding.tag,
        confidence: finding.confidence,
        path: finding.path,
        what: finding.what,
      })),
      loc: after.loc,
      sources: after.sources,
    });
  }

  clearSession(session.sessionId);
  emit('Stop', lines.join('\n'));
}

main().catch(() => process.exit(0));
