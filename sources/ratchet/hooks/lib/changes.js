'use strict';

const path = require('path');

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

function addedLines(before, after) {
  const pool = new Map();
  for (const line of splitLines(before)) {
    const key = line.trim();
    pool.set(key, (pool.get(key) || 0) + 1);
  }
  return splitLines(after).reduce((added, line, index) => {
    const key = line.trim();
    if (!key) return added;
    const remaining = pool.get(key) || 0;
    if (remaining > 0) pool.set(key, remaining - 1);
    else added.push({ line: index + 1, text: line });
    return added;
  }, []);
}

const MANIFESTS = {
  'package.json': parsePackageJson,
  'requirements.txt': parseRequirements,
  'pyproject.toml': parsePyproject,
  'go.mod': parseGoMod,
  'Cargo.toml': parseCargoToml,
  'Gemfile': parseGemfile,
  'composer.json': parseComposerJson,
};

function jsonKeys(text, sections) {
  try {
    const json = JSON.parse(text);
    return sections.flatMap((section) => Object.keys(json[section] || {}));
  } catch (e) {
    return [];
  }
}

function parsePackageJson(text) {
  return jsonKeys(text, ['dependencies', 'devDependencies', 'peerDependencies']);
}

function parseComposerJson(text) {
  return jsonKeys(text, ['require', 'require-dev']);
}

function parseRequirements(text) {
  return splitLines(text)
    .map((line) => line.split('#')[0].trim())
    .filter((line) => line && !line.startsWith('-'))
    .map((line) => line.split(/[<>=!~[\s;]/)[0].trim())
    .filter(Boolean);
}

function parsePyproject(text) {
  const names = [];
  const blocks = text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/g) || [];
  for (const block of blocks) {
    for (const quoted of block.match(/["']([^"']+)["']/g) || []) {
      const name = quoted.slice(1, -1).split(/[<>=!~[\s;]/)[0].trim();
      if (name) names.push(name);
    }
  }
  const poetry = text.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(\n\[|$)/);
  if (poetry) {
    for (const line of splitLines(poetry[1])) {
      const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
      if (match && match[1].toLowerCase() !== 'python') names.push(match[1]);
    }
  }
  return names;
}

function parseGoMod(text) {
  const block = text.match(/require\s*\(([\s\S]*?)\)/);
  const grouped = block ? splitLines(block[1]).map((line) => line.trim().match(/^([^\s]+)\s+v/)) : [];
  const single = splitLines(text).map((line) => line.trim().match(/^require\s+([^\s(]+)\s+v/));
  return [...grouped, ...single].filter(Boolean).map((match) => match[1]);
}

function parseCargoToml(text) {
  const sections = text.match(/\[(?:dev-|build-)?dependencies\]([\s\S]*?)(\n\[|$)/g) || [];
  return sections
    .flatMap((section) => splitLines(section).slice(1))
    .map((line) => line.match(/^\s*([A-Za-z0-9_-]+)\s*=/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function parseGemfile(text) {
  return splitLines(text)
    .map((line) => line.match(/^\s*gem\s+["']([^"']+)["']/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function isManifest(filePath) {
  return Object.prototype.hasOwnProperty.call(MANIFESTS, path.basename(filePath));
}

function addedDependencies(filePath, before, after) {
  const parse = MANIFESTS[path.basename(filePath)];
  if (!parse) return [];
  const known = new Set(parse(before));
  return parse(after).filter((name) => !known.has(name));
}

module.exports = { addedDependencies, addedLines, isManifest, splitLines };
