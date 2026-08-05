#!/usr/bin/env node
'use strict';

const { isDeactivationCommand, normalizeMode, resolveBudget, writeUserMode } = require('./lib/config');
const { emit, instructions, readStdin, useRoot } = require('./lib/host');
const { emptySession, readSession, repoRoot, writeSession } = require('./lib/state');

function apply(sessionId, mode, root) {
  const session = readSession(sessionId) || emptySession(sessionId, mode, root);
  session.mode = mode;
  try {
    writeSession(session);
  } catch (e) {
    return session;
  }
  return session;
}

async function main() {
  const payload = await readStdin();
  const prompt = String(payload.prompt || '').trim();
  const root = repoRoot(payload.cwd || process.cwd());
  useRoot(root);

  if (isDeactivationCommand(prompt)) {
    apply(payload.session_id, 'off', root);
    emit('UserPromptSubmit', 'RATCHET OFF for this session.');
    return;
  }

  const match = prompt.toLowerCase().match(/^[/@$]ratchet(?::ratchet)?\s*(\w+)?\s*(\w+)?/);
  if (!match) return;

  const [, first, second] = match;

  if (first === 'default') {
    const mode = normalizeMode(second);
    if (!mode) return;
    writeUserMode(mode);
    emit('UserPromptSubmit', 'RATCHET default set to ' + mode + ' for new sessions.');
    return;
  }

  const mode = normalizeMode(first);
  if (!mode) {
    const current = (readSession(payload.session_id) || {}).mode;
    emit('UserPromptSubmit', 'RATCHET mode is ' + (current || 'guard') + '.');
    return;
  }

  apply(payload.session_id, mode, root);

  if (mode === 'off') {
    emit('UserPromptSubmit', 'RATCHET OFF for this session.');
    return;
  }

  emit('UserPromptSubmit', 'RATCHET switched to ' + mode + '.\n\n' + instructions(mode, resolveBudget(mode, root)));
}

main().catch(() => process.exit(0));
