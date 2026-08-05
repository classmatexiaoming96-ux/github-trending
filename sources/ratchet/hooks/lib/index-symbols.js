'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ignoredPaths } = require('./config');
const { isTestPath, relativePosix, toPosix } = require('./paths');

const SOURCE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.py', '.go', '.rb', '.rs', '.php', '.java', '.kt', '.cs',
]);

const MAX_PER_SYMBOL = 4;

const FAMILY = {
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js', '.ts': 'js', '.tsx': 'js',
  '.py': 'py', '.go': 'go', '.rb': 'rb', '.rs': 'rs', '.php': 'php',
  '.java': 'jvm', '.kt': 'jvm', '.cs': 'cs',
};

const DEFINITIONS = [
  /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  /^\s*def\s+([A-Za-z_][\w]*)/gm,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)/gm,
  /^\s*fn\s+([A-Za-z_][\w]*)/gm,
];

const TRIVIAL = new Set([
  'main', 'init', 'run', 'test', 'setup', 'teardown', 'index', 'handler', 'default',
  'get', 'set', 'add', 'remove', 'update', 'render', 'app', 'new', 'error', 'value',
]);

function normalizeName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractSymbols(source) {
  const names = new Set();
  for (const pattern of DEFINITIONS) {
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match) {
      names.add(match[1]);
      match = pattern.exec(source);
    }
  }
  return [...names];
}

function walk(root, ignore, limit) {
  const files = [];
  const queue = [root];
  while (queue.length && files.length < limit) {
    const current = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (ignore.includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
      if (files.length >= limit) break;
    }
  }
  return files;
}

function cacheFile(root) {
  const key = crypto.createHash('sha1').update(root).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), 'ratchet-index-' + key + '.json');
}

function newestMtime(files) {
  let newest = 0;
  for (const file of files) {
    try {
      const mtime = fs.statSync(file).mtimeMs;
      if (mtime > newest) newest = mtime;
    } catch (e) {
      continue;
    }
  }
  return newest;
}

function scan(files, root, maxBytes) {
  const index = new Map();
  for (const file of files) {
    let source;
    try {
      if (fs.statSync(file).size > maxBytes) continue;
      source = fs.readFileSync(file, 'utf8');
    } catch (e) {
      continue;
    }
    const relative = relativePosix(root, file);
    if (isTestPath(relative)) continue;
    const family = FAMILY[path.extname(file)] || 'other';
    for (const name of extractSymbols(source)) {
      const normalized = normalizeName(name);
      if (normalized.length < 5 || TRIVIAL.has(name.toLowerCase())) continue;
      const key = family + ':' + normalized;
      const entry = { name, file: relative };
      const existing = index.get(key);
      if (!existing) index.set(key, [entry]);
      else if (existing.length < MAX_PER_SYMBOL && !existing.some((item) => item.file === entry.file)) {
        existing.push(entry);
      }
    }
  }
  return index;
}

function buildIndex(root, options = {}) {
  const limit = options.fileLimit || 3000;
  const maxBytes = options.maxBytes || 400 * 1024;
  if (!root) return new Map();

  const files = walk(root, ignoredPaths(root), limit);
  const signature = files.length + ':' + Math.round(newestMtime(files));
  const cache = cacheFile(root);

  if (!options.noCache) {
    try {
      const stored = JSON.parse(fs.readFileSync(cache, 'utf8'));
      if (stored.signature === signature) return new Map(stored.entries);
    } catch (e) {
      // fall through and rebuild
    }
  }

  const index = scan(files, root, maxBytes);

  if (!options.noCache) {
    try {
      fs.writeFileSync(cache, JSON.stringify({ signature, entries: [...index] }), 'utf8');
    } catch (e) {
      // cache is best effort
    }
  }
  return index;
}

function lookup(index, name, filePath, root) {
  const family = FAMILY[path.extname(filePath)] || 'other';
  const entries = index.get(family + ':' + normalizeName(name));
  if (!entries) return null;
  const relative = root ? relativePosix(root, filePath) : toPosix(filePath);
  const candidates = Array.isArray(entries) ? entries : [entries];
  return candidates.find((entry) => entry.file !== relative) || null;
}

module.exports = { buildIndex, extractSymbols, lookup, normalizeName };
