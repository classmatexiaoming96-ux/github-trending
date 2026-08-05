'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MODE = 'guard';
const MODES = ['off', 'advise', 'guard', 'strict'];

const PROFILES = {
  advise: { newFiles: 8, newDeps: 3, addedLines: 400, enforce: 'silent' },
  guard: { newFiles: 3, newDeps: 1, addedLines: 150, enforce: 'warn' },
  strict: { newFiles: 1, newDeps: 0, addedLines: 60, enforce: 'block' },
};

function normalizeMode(value) {
  if (typeof value !== 'string') return null;
  const mode = value.trim().toLowerCase();
  return MODES.includes(mode) ? mode : null;
}

function isDeactivationCommand(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '');
  return normalized === 'stop ratchet' || normalized === 'ratchet off';
}

function configDir() {
  if (process.env.XDG_CONFIG_HOME) return path.join(process.env.XDG_CONFIG_HOME, 'ratchet');
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'ratchet');
  }
  return path.join(os.homedir(), '.config', 'ratchet');
}

function configPath() {
  return path.join(configDir(), 'config.json');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return null;
  }
}

function userConfig() {
  const config = readJson(configPath());
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function projectConfig(root) {
  if (!root) return {};
  const config = readJson(path.join(root, '.ratchet', 'config.json'));
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function resolveMode(root) {
  return (
    normalizeMode(process.env.RATCHET_MODE) ||
    normalizeMode(projectConfig(root).mode) ||
    normalizeMode(userConfig().mode) ||
    DEFAULT_MODE
  );
}

function resolveBudget(mode, root) {
  if (mode === 'off') return null;
  const base = PROFILES[mode] || PROFILES[DEFAULT_MODE];
  const overrides = { ...userConfig().budget, ...projectConfig(root).budget };
  const budget = { ...base };
  for (const key of ['newFiles', 'newDeps', 'addedLines']) {
    const value = Number(overrides[key]);
    if (Number.isFinite(value) && value >= 0) budget[key] = value;
  }
  if (['silent', 'warn', 'block'].includes(overrides.enforce)) budget.enforce = overrides.enforce;
  return budget;
}

function writeUserMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return null;
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const config = userConfig();
  config.mode = normalized;
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

function ignoredPaths(root) {
  const fromConfig = projectConfig(root).ignore;
  const extra = Array.isArray(fromConfig) ? fromConfig.filter((p) => typeof p === 'string') : [];
  return [
    'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor',
    '.venv', 'venv', '__pycache__', '.next', '.nuxt', 'coverage', '.ratchet',
    ...extra,
  ];
}

module.exports = {
  PROFILES,
  configDir,
  projectConfig,
  configPath,
  ignoredPaths,
  isDeactivationCommand,
  normalizeMode,
  resolveBudget,
  resolveMode,
  writeUserMode,
};
