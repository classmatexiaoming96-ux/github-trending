'use strict';

const fs = require('fs');
const { toPosix } = require('./paths');

const PLACEHOLDERS = ['${CLAUDE_PLUGIN_ROOT}', '$env:CLAUDE_PLUGIN_ROOT'];

function replaceAll(text, root) {
  let result = String(text);
  for (const placeholder of PLACEHOLDERS) {
    result = result.split(placeholder).join(root);
  }
  return result;
}

function substitute(value, root, key) {
  if (typeof value === 'string') {
    return replaceAll(value, key === 'commandWindows' ? root : toPosix(root));
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, root, key));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [name, item] of Object.entries(value)) result[name] = substitute(item, root, name);
    return result;
  }
  return value;
}

function resolveHooks(templatePath, root) {
  const template = JSON.parse(fs.readFileSync(templatePath, 'utf8').replace(/^\uFEFF/, ''));
  if (!template || typeof template.hooks !== 'object') return null;
  return substitute(template.hooks, root);
}

module.exports = { resolveHooks, substitute };
