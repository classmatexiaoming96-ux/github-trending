#!/usr/bin/env node
'use strict';

const { resolveBudget, resolveMode } = require('./lib/config');
const { emit, instructions, readStdin, useRoot } = require('./lib/host');
const {
  emptySession,
  enabledForRepo,
  readMark,
  repoRoot,
  snapshot,
  writeSession,
} = require('./lib/state');

async function main() {
  const payload = await readStdin();
  const root = repoRoot(payload.cwd || process.cwd());
  useRoot(root);
  const mode = resolveMode(root);

  if (mode === 'off') {
    emit('SessionStart', '');
    return;
  }

  const budget = resolveBudget(mode, root);
  const session = emptySession(payload.session_id, mode, root);

  if (enabledForRepo(root)) {
    session.baseline = snapshot(root);
    const mark = readMark(root);
    if (mark) session.mark = mark;
  }

  try {
    writeSession(session);
  } catch (e) {
    process.exitCode = 0;
  }

  let context = instructions(mode, budget);

  if (session.mark && session.baseline && !session.baseline.partial) {
    const drift = session.baseline.loc - session.mark.loc;
    if (drift > 0) {
      context +=
        '\n\nRatchet mark: this repo is ' + drift + ' lines above its accepted mark of ' +
        session.mark.loc + '. Prefer changes that remove lines.';
    }
  }

  emit('SessionStart', context);
}

main().catch(() => process.exit(0));
