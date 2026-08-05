'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { configDir, ignoredPaths } = require('./config');

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.go', '.rb', '.rs',
  '.php', '.java', '.kt', '.cs', '.css', '.scss', '.html', '.vue', '.svelte', '.sql',
]);

function stateDir() {
  if (process.env.CLAUDE_CONFIG_DIR) return path.join(process.env.CLAUDE_CONFIG_DIR, 'ratchet');
  if (process.env.PLUGIN_DATA) return path.join(process.env.PLUGIN_DATA, 'ratchet');
  return path.join(configDir(), 'sessions');
}

function sessionFile(sessionId) {
  const safe = String(sessionId || 'default').replace(/[^A-Za-z0-9_-]/g, '') || 'default';
  return path.join(stateDir(), safe + '.json');
}

function emptySession(sessionId, mode, root) {
  return {
    sessionId: sessionId || 'default',
    mode,
    root: root || '',
    startedAt: Date.now(),
    addedLines: 0,
    removedLines: 0,
    newFiles: [],
    touchedFiles: [],
    deps: [],
    findings: [],
    reported: [],
  };
}

function readSession(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(sessionFile(sessionId), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeSession(session) {
  const file = sessionFile(session.sessionId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(session), 'utf8');
  return session;
}

function clearSession(sessionId) {
  try {
    fs.unlinkSync(sessionFile(sessionId));
  } catch (e) {
    return false;
  }
  return true;
}

function repoRoot(startDir) {
  let current = startDir || process.cwd();
  for (let depth = 0; depth < 40; depth += 1) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return startDir || process.cwd();
}

function trackedFiles(root) {
  try {
    const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\n').filter(Boolean);
  } catch (e) {
    return null;
  }
}

function snapshot(root) {
  const ignore = ignoredPaths(root);
  const files = trackedFiles(root);
  if (!files) return { files: 0, loc: 0, sources: 0, partial: true };
  let loc = 0;
  let sources = 0;
  for (const relative of files) {
    if (ignore.some((dir) => relative.split('/').includes(dir))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relative))) continue;
    try {
      const full = path.join(root, relative);
      if (fs.statSync(full).size > 512 * 1024) continue;
      loc += fs.readFileSync(full, 'utf8').split('\n').length;
      sources += 1;
    } catch (e) {
      continue;
    }
  }
  return { files: files.length, loc, sources, partial: false };
}

function ratchetDir(root) {
  return path.join(root, '.ratchet');
}

function enabledForRepo(root) {
  return fs.existsSync(ratchetDir(root));
}

function readMark(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ratchetDir(root), 'mark.json'), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeMark(root, mark) {
  fs.mkdirSync(ratchetDir(root), { recursive: true });
  fs.writeFileSync(path.join(ratchetDir(root), 'mark.json'), JSON.stringify(mark, null, 2), 'utf8');
  return mark;
}

function appendLedger(root, entry) {
  if (!enabledForRepo(root)) return false;
  fs.appendFileSync(path.join(ratchetDir(root), 'ledger.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
  return true;
}

function readLedger(root, limit) {
  try {
    const lines = fs
      .readFileSync(path.join(ratchetDir(root), 'ledger.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean);
    const slice = limit ? lines.slice(-limit) : lines;
    return slice.map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

module.exports = {
  appendLedger,
  clearSession,
  emptySession,
  enabledForRepo,
  ratchetDir,
  readLedger,
  readMark,
  readSession,
  repoRoot,
  snapshot,
  stateDir,
  trackedFiles,
  writeMark,
  writeSession,
};
