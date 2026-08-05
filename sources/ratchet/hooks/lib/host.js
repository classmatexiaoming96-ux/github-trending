'use strict';

const fs = require('fs');
const path = require('path');

let logRoot = null;

const SKILL = path.join(__dirname, '..', '..', 'skills', 'ratchet', 'SKILL.md');
const isCodex = Boolean(process.env.PLUGIN_DATA);
const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA);

function readStdin(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        resolve(JSON.parse(buffer.replace(/^\uFEFF/, '')));
      } catch (e) {
        resolve({});
      }
    };
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, timeoutMs).unref();
  });
}

function skillBody() {
  try {
    return fs.readFileSync(SKILL, 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  } catch (e) {
    return null;
  }
}

function budgetLine(budget) {
  if (!budget) return '';
  return (
    'Budget for this session: at most ' +
    budget.newFiles + ' new files, ' +
    budget.newDeps + ' new dependencies, ' +
    budget.addedLines + ' added lines. ' +
    'A PostToolUse hook measures the real diff and reports overruns back to you. ' +
    'Ask before exceeding a limit, do not exceed it silently.'
  );
}

function instructions(mode, budget) {
  if (mode === 'off') return '';
  const body = skillBody();
  const header = 'RATCHET ACTIVE, mode ' + mode + '. ' + budgetLine(budget);
  if (body) return header + '\n\n' + body;
  return (
    header +
    '\n\nBefore writing code, stop at the first rung that holds: does it need to exist, ' +
    'does this codebase already have it, does the standard library cover it, does a native ' +
    'platform feature cover it, does an installed dependency cover it, can it be one line, ' +
    'otherwise the minimum that works. Read the code the change touches and trace the real ' +
    'flow before choosing a rung. Never simplify away validation at trust boundaries, error ' +
    'handling that prevents data loss, security, accessibility, or anything explicitly asked ' +
    'for. Non-trivial logic leaves one runnable check behind.'
  );
}

function useRoot(root) {
  logRoot = root;
}

function logging() {
  const env = process.env.RATCHET_LOG;
  if (env !== undefined) {
    const value = env.trim().toLowerCase();
    return value !== '' && value !== '0' && value !== 'false' && value !== 'no';
  }
  try {
    const config = JSON.parse(fs.readFileSync(path.join(logRoot, '.ratchet', 'config.json'), 'utf8'));
    return config.log === true;
  } catch (e) {
    return false;
  }
}

function trace(event, output, blocked) {
  if (!logRoot || !logging()) return;
  try {
    const dir = path.join(logRoot, '.ratchet');
    if (!fs.existsSync(dir)) return;
    const entry = {
      at: new Date().toISOString(),
      event,
      blocked: Boolean(blocked),
      output: String(output || ''),
    };
    fs.appendFileSync(path.join(dir, 'hook.log'), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    return;
  }
}

function emit(event, context, extra = {}) {
  trace(event, context, false);
  const payload = { ...extra };
  if (context) {
    payload.hookSpecificOutput = { hookEventName: event, additionalContext: context };
  }
  if (isCodex && !payload.systemMessage) payload.systemMessage = 'ratchet';
  if (isCopilot) {
    process.stdout.write(JSON.stringify(context ? { additionalContext: context } : {}));
    return;
  }
  process.stdout.write(JSON.stringify(payload));
}

function block(event, reason) {
  trace(event, reason, true);
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason,
      hookSpecificOutput: { hookEventName: event, additionalContext: reason },
    })
  );
}

module.exports = { block, emit, instructions, readStdin, useRoot };
