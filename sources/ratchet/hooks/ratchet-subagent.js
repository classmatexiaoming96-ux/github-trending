#!/usr/bin/env node
'use strict';

const { resolveBudget, resolveMode } = require('./lib/config');
const { emit, instructions, readStdin, useRoot } = require('./lib/host');
const { repoRoot } = require('./lib/state');

async function main() {
  const payload = await readStdin();
  const root = repoRoot(payload.cwd || process.cwd());
  useRoot(root);
  const mode = resolveMode(root);
  if (mode === 'off') return;

  const matcher = process.env.RATCHET_SUBAGENT_MATCHER;
  if (matcher && payload.agent_type) {
    try {
      if (!new RegExp(matcher, 'i').test(payload.agent_type)) return;
    } catch (e) {
      process.exitCode = 0;
    }
  }

  emit('SubagentStart', instructions(mode, resolveBudget(mode, root)));
}

main().catch(() => process.exit(0));
