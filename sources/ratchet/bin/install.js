#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { auditRepo, canScan, fingerprints } = require('../hooks/lib/audit');
const { toPosix } = require('../hooks/lib/paths');
const { alignedFindings, bar, heading, paint, pad, sparkline, table, trend } = require('../hooks/lib/render');
const baselineStore = require('../hooks/lib/baseline');
const { readLedger, readMark, snapshot } = require('../hooks/lib/state');
const { resolveHooks } = require('../hooks/lib/hooks-template');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const HOOK_TEMPLATE = path.join(PACKAGE_ROOT, 'hooks', 'hooks.json');
const RULE_TARGETS = [
  ['AGENTS.md', 'AGENTS.md'],
  ['.cursor/rules/ratchet.mdc', 'AGENTS.md'],
  ['.windsurf/rules/ratchet.md', 'AGENTS.md'],
  ['.clinerules/ratchet.md', 'AGENTS.md'],
  ['.github/copilot-instructions.md', 'AGENTS.md'],
];

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((arg) => arg.startsWith('-')));
const command = argv.find((arg) => !arg.startsWith('-')) || 'install';
const dryRun = flags.has('--dry-run') || flags.has('-n');
const global = flags.has('--global') || flags.has('-g');
const force = flags.has('--force') || flags.has('-f');

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

function say(message) {
  try {
    process.stdout.write(message + '\n');
  } catch (error) {
    if (error.code !== 'EPIPE') throw error;
  }
}

function fail(message) {
  process.stderr.write(message + '\n');
  process.exit(1);
}

function uiCommandLine(exe, root, passThru) {
  const quote = (value) => "'" + String(value).replace(/'/g, "''") + "'";
  if (passThru) {
    return [
      "$ErrorActionPreference = 'Stop'",
      `$p = Start-Process -FilePath ${quote(exe)} -ArgumentList ${quote(root)} -WorkingDirectory ${quote(root)} -PassThru`,
      "if (-not $p -or -not $p.Id) { throw 'Start-Process returned no process' }",
      "$p.Id"
    ].join('; ');
  }
  return `Start-Process -FilePath ${quote(exe)} -ArgumentList ${quote(root)} -WorkingDirectory ${quote(root)}`;
}

function uiExe() {
  return path.join(PACKAGE_ROOT, 'hooks', 'ratchetui.exe');
}

function uiZip() {
  return path.join(PACKAGE_ROOT, 'hooks', 'ratchetui.zip');
}

/** If exe is missing but hooks/ratchetui.zip exists, unpack it. Windows only. */
function ensureUiExe() {
  const exe = uiExe();
  if (fs.existsSync(exe)) return exe;
  if (process.platform !== 'win32') return null;

  const zip = uiZip();
  if (!fs.existsSync(zip)) return null;

  const hooksDir = path.dirname(exe);
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${hooksDir.replace(/'/g, "''")}' -Force`
      ],
      { stdio: 'ignore', timeout: 120000, windowsHide: true }
    );
  } catch {
    return null;
  }

  return fs.existsSync(exe) ? exe : null;
}

function runUi(exe, root) {
  const command = uiCommandLine(exe, root, true);
  const encoded = Buffer.from(command, 'utf16le').toString('base64');
  try {
    const id = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encoded
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15000,
        windowsHide: true
      }
    ).trim();

    if (!id || !/^\d+$/.test(id)) {
      return { command, id: null, error: 'PowerShell returned no numeric process id' };
    }
    return { command, id, error: null };
  } catch (error) {
    const msg = String(error.stderr || error.message || error).trim();
    return { command, id: null, error: msg };
  }
}

function launchUiInterface() {
  if (process.platform !== 'win32') return;
  let exePath;
  try {
    exePath = ensureUiExe();
  } catch {
    return;
  }
  if (!exePath) return;

  const root = projectRoot();

  // cmd `start` fully detaches a GUI app from this node process.
  // Empty title ("") is required so paths with spaces are not treated as the window title.
  const fallback = () => {
    try {
      spawn(exePath, [], { cwd: root, detached: true, stdio: 'ignore', windowsHide: false }).unref();
    } catch {}
  };

  try {
    const child = spawn(
      process.env.ComSpec || 'cmd.exe',
      ['/c', 'start', '', '/D', root, exePath],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: root,
      }
    );
    child.on('error', fallback);
    child.unref();
  } catch {
    fallback();
  }
}

function openUi() {
  if (process.platform !== 'win32') return 'Windows only';
  const exe = ensureUiExe();
  if (!exe) {
    if (fs.existsSync(uiZip())) return 'hooks/ratchetui.zip found, but unpack failed';
    return 'hooks/ratchetui.exe is missing (put exe or ratchetui.zip in hooks/)';
  }
  const result = runUi(exe, projectRoot());
  if (result.error) return result.error.split('\n')[0];
  return result.id ? null : 'PowerShell returned no process id';
}

function debugUi() {
  const exe = uiExe();
  const zip = uiZip();
  say(heading('what the launcher sees'));
  say('');
  step('platform', process.platform + (process.platform === 'win32' ? '' : paint('red', '  the window is Windows only')));
  step('plugin', PACKAGE_ROOT);
  step('exe', exe);
  step('exists', fs.existsSync(exe) ? paint('green', 'yes, ' + Math.round(fs.statSync(exe).size / 1048576) + ' MB') : paint('red', 'no'));
  step('zip', zip);
  step('zip exists', fs.existsSync(zip) ? paint('green', 'yes, ' + Math.round(fs.statSync(zip).size / 1048576) + ' MB') : paint('grey', 'no'));
  step('root', projectRoot());

  if (process.platform !== 'win32') return;

  const ensured = ensureUiExe();
  if (!ensured) {
    step('unpack', paint('red', fs.existsSync(zip) ? 'zip present but unpack failed' : 'no exe and no zip'));
    return;
  }
  step('ready', paint('green', ensured));

  const result = runUi(ensured, projectRoot());
  say('');
  say(heading('the command'));
  say('');
  say('  ' + result.command);
  say('');
  if (result.error) {
    say(paint('red', '  PowerShell refused it:'));
    for (const line of result.error.split('\n')) say('  ' + line);
    return;
  }
  say(result.id ? paint('green', '  started, process id ' + result.id) : paint('amber', '  no process id came back'));
  say(paint('grey', '  a process id with no window means the app hid itself or exited at once'));
}

function rows(pairs) {
  say(table(pairs.map(([left, right]) => ['  ' + left, paint('grey', right)])));
}

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function projectRoot() {
  let current = process.cwd();
  for (let depth = 0; depth < 40; depth += 1) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
  return process.cwd();
}

function settingsPath() {
  return global ? path.join(claudeDir(), 'settings.json') : path.join(projectRoot(), '.claude', 'settings.json');
}

function readJsonStrict(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    if (e instanceof SyntaxError) fail(file + ' is not valid JSON. Fix it or move it aside, then run again.');
    throw e;
  }
}

function writeJson(file, value) {
  if (dryRun) {
    say('would write ' + file);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.ratchet-backup');
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function resolvedHooks() {
  const hooks = resolveHooks(HOOK_TEMPLATE, PACKAGE_ROOT);
  if (!hooks) fail('cannot read ' + HOOK_TEMPLATE);
  return hooks;
}

function pluginRootIn(hooks) {
  for (const matchers of Object.values(hooks || {})) {
    for (const matcher of matchers || []) {
      for (const hook of matcher.hooks || []) {
        const match = String(hook.command || '').match(/([A-Za-z]:[\\/].*?|\/.*?)[\\/]hooks[\\/]ratchet-/);
        if (match) return match[1];
      }
    }
  }
  return null;
}

function step(label, value) {
  say('  ' + pad(label, 11) + value);
}

function isOurs(entry) {
  return JSON.stringify(entry).includes('ratchet-');
}

function stripRatchet(hooks) {
  return Object.fromEntries(
    Object.entries(hooks || {})
      .map(([event, matchers]) => [
        event,
        (matchers || [])
          .map((matcher) => ({ ...matcher, hooks: (matcher.hooks || []).filter((hook) => !isOurs(hook)) }))
          .filter((matcher) => matcher.hooks.length),
      ])
      .filter(([, matchers]) => matchers.length)
  );
}

function install() {
  const root = projectRoot();

  if (root === PACKAGE_ROOT) {
    say(paint('amber', 'this folder is ratchet itself') + ', not a project to watch.');
    say(paint('grey', 'cd into the repository you want it to watch, then run ratchet again.'));
    process.exitCode = 1;
    return;
  }

  const file = settingsPath();
  const settings = readJsonStrict(file, {});
  const previous = pluginRootIn(settings.hooks);
  const existing = stripRatchet(settings.hooks);

  const merged = { ...existing };
  for (const [event, matchers] of Object.entries(resolvedHooks())) {
    merged[event] = [...(merged[event] || []), ...matchers];
  }
  settings.hooks = merged;
  writeJson(file, settings);

  if (dryRun) {
    say('would set up ratchet in ' + root);
    return;
  }

  say(paint('green', 'ratchet is watching ') + path.basename(root));
  say('');
  step('hooks', global ? 'every project on this machine' : file);

  const measuring = ensureMeasuring(root);
  if (measuring.ok) {
    step('measuring', '.ratchet' + path.sep + '  (mark at ' + measuring.loc + ' lines)');
    const accepted = ensureBaseline(root);
    if (accepted !== null) {
      step('baseline', accepted + (accepted === 1 ? ' finding' : ' findings') + ' from before now accepted, only new ones fire');
    }
  } else {
    step('measuring', paint('amber', 'off') + ', ' + path.basename(root) + ' is not a git repository');
    step('', paint('grey', 'the ruleset and the detectors still work'));
    step('', paint('grey', 'git init && git add . && git commit -m "before ratchet"'));
  }

  const window = openUi();
  if (window) step('window', paint('grey', window));
  step('plugin', PACKAGE_ROOT);

  if (previous && toPosix(previous) !== toPosix(PACKAGE_ROOT)) {
    say('');
    say(paint('amber', 'replaced hooks that pointed at ') + previous);
    say(paint('grey', 'you have more than one copy of ratchet. keep the one above and delete the other.'));
  }

  say('');
  say(paint('grey', 'restart your agent so it picks the hooks up.'));
}

function ensureMeasuring(root) {
  const dir = path.join(root, '.ratchet');
  fs.mkdirSync(dir, { recursive: true });
  const configFile = path.join(dir, 'config.json');
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify({ mode: 'guard' }, null, 2) + '\n', 'utf8');
  }

  const current = snapshot(root);
  if (current.partial) return { ok: false, loc: 0 };
  if (!readMark(root)) {
    fs.writeFileSync(
      path.join(dir, 'mark.json'),
      JSON.stringify(
        { loc: current.loc, sources: current.sources, files: current.files, reason: 'initial mark', acceptedAt: new Date().toISOString() },
        null,
        2
      ) + '\n',
      'utf8'
    );
  }
  return { ok: true, loc: readMark(root).loc };
}

function ensureBaseline(root) {
  if (fs.existsSync(path.join(root, '.ratchet', 'baseline.json'))) return null;
  if (!canScan(root)) return null;
  return baselineStore.write(root, fingerprints(auditRepo(root)), 'accepted at setup').accepted.length;
}

function initRepo() {
  const root = projectRoot();
  if (dryRun) return say('would create ' + path.join(root, '.ratchet'));
  const measuring = ensureMeasuring(root);
  if (!measuring.ok) {
    say('ratchet initialised, but this is not a git repository');
    say(paint('grey', 'the ruleset and the detectors work; the mark, the ledger and the audit need git'));
    return;
  }
  say('measuring ' + path.basename(root) + ' from ' + measuring.loc + ' lines');
  say(paint('grey', 'commit .ratchet so the whole team shares the mark'));
}

function copyRules() {
  const root = projectRoot();
  const written = [];
  for (const [target, source] of RULE_TARGETS) {
    const destination = path.join(root, target);
    if (fs.existsSync(destination) && !force) continue;
    if (dryRun) {
      written.push(target);
      continue;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(PACKAGE_ROOT, source), destination);
    written.push(target);
  }
  if (!written.length) {
    say('rule files already present, pass --force to overwrite');
    return;
  }
  say((dryRun ? 'would write ' : 'wrote ') + written.join(', '));
}

function status() {
  const root = projectRoot();
  for (const scope of [
    ['project', path.join(root, '.claude', 'settings.json')],
    ['global', path.join(claudeDir(), 'settings.json')],
  ]) {
    const settings = readJsonStrict(scope[1], null);
    const installed = settings && JSON.stringify(settings.hooks || {}).includes('ratchet-');
    say(pad(scope[0], 8) + pad(installed ? 'installed' : 'not installed', 17) + scope[1]);
  }

  const dir = path.join(root, '.ratchet');
  if (!fs.existsSync(dir)) {
    say('ledger  ' + pad('not initialised', 17) + 'run: ratchet init');
    return;
  }

  const mark = readJsonStrict(path.join(dir, 'mark.json'), null);
  const ledger = fs.existsSync(path.join(dir, 'ledger.jsonl'))
    ? fs.readFileSync(path.join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length
    : 0;
  say('ledger  ' + pad(ledger + ' sessions', 17) + dir);
  if (mark) say('mark    ' + pad(mark.loc + ' lines', 17) + 'accepted ' + mark.acceptedAt.slice(0, 10) + ', reason: ' + mark.reason);
}

function uninstall() {
  for (const file of [path.join(projectRoot(), '.claude', 'settings.json'), path.join(claudeDir(), 'settings.json')]) {
    const settings = readJsonStrict(file, null);
    if (!settings || !settings.hooks) continue;
    const cleaned = stripRatchet(settings.hooks);
    if (JSON.stringify(cleaned) === JSON.stringify(settings.hooks)) continue;
    if (Object.keys(cleaned).length) settings.hooks = cleaned;
    else delete settings.hooks;
    writeJson(file, settings);
    say('removed hooks from ' + file);
  }

  try {
    execFileSync('node', [path.join(PACKAGE_ROOT, 'scripts', 'uninstall.js')], { stdio: 'inherit' });
  } catch (e) {
    say('session state already clean');
  }
  say('.ratchet/ left in place, that is your ledger');
}

function audit() {
  const root = projectRoot();
  if (!canScan(root)) {
    say(paint('amber', 'nothing scanned') + ': ' + root + ' is not a git repository.');
    say(paint('grey', 'audit walks the files git tracks. run git init here, or cd into a real project.'));
    return [];
  }
  const findings = auditRepo(root);
  if (!findings.length) {
    say(paint('green', 'Lean. Nothing to cut.'));
    return findings;
  }
  say(heading(findings.length + ' findings in ' + path.basename(root)));
  say('');
  say(alignedFindings(findings, { colour: true }));
  say('');
  say(paint('grey', 'silence one with an inline "ratchet-ignore: reason", or accept them all:'));
  say(paint('grey', '  ratchet baseline'));
  return findings;
}

function baseline() {
  const root = projectRoot();
  if (!canScan(root)) {
    say(paint('amber', 'nothing recorded') + ': ' + root + ' is not a git repository.');
    say(paint('grey', 'a baseline is only meaningful over tracked files.'));
    return;
  }
  const findings = auditRepo(root);
  if (dryRun) {
    say('would accept ' + findings.length + ' existing findings as the baseline');
    return;
  }
  const written = baselineStore.write(root, fingerprints(findings), 'accepted at baseline time');
  say(paint('green', 'baseline recorded') + ': ' + written.accepted.length + ' existing findings will no longer be reported');
  say(paint('grey', 'only new ones fire from now on. Delete .ratchet/baseline.json to start over.'));
}

function report() {
  const root = projectRoot();
  const ledger = readLedger(root, 20);
  if (!ledger.length) {
    say('no sessions recorded yet in ' + path.join(root, '.ratchet'));
    say(paint('grey', 'run: ratchet init, then work a session'));
    return;
  }

  say(heading('complexity trend, last ' + ledger.length + ' sessions'));
  say('');
  const locs = ledger.map((entry) => entry.loc).filter((value) => Number.isFinite(value));
  if (locs.length > 1) {
    say('  ' + paint('blue', sparkline(locs)) + '  ' + locs[0] + ' to ' + locs[locs.length - 1] + ' lines');
    say('');
  }

  const head = ['when', 'mode', 'added', 'removed', 'deps', 'flagged', 'repo'].map((h) => paint('grey', h));
  const body = ledger.map((entry, index) => [
    entry.at.slice(0, 10),
    entry.mode,
    '+' + entry.addedLines,
    '-' + (entry.removedLines || 0),
    String((entry.deps || []).length),
    String((entry.findings || []).length),
    entry.loc + ' ' + trend(entry.loc, index > 0 ? ledger[index - 1].loc : undefined),
  ]);
  say(table([head, ...body], { align: ['left', 'left', 'right', 'right', 'right', 'right', 'left'] }));

  const mark = readMark(root);
  const now = snapshot(root);
  if (mark && !now.partial) {
    say('');
    const gap = now.loc - mark.loc;
    const state = gap <= 0 ? paint('green', 'at or below the mark') : paint('amber', gap + ' lines above the mark');
    say('mark  ' + mark.loc + ' lines, ' + state);
    say(paint('grey', '      reason: ' + mark.reason));
  }

  const tags = new Map();
  for (const entry of ledger) {
    for (const finding of entry.findings || []) tags.set(finding.tag, (tags.get(finding.tag) || 0) + 1);
  }
  if (tags.size) {
    const sorted = [...tags.entries()].sort((a, b) => b[1] - a[1]);
    const max = sorted[0][1];
    say('');
    say(heading('what gets flagged most'));
    say('');
    say(table(sorted.map(([tag, count]) => ['  ' + tag, bar(count, max, 20), String(count)]), { align: ['left', 'left', 'right'] }));
  }
}

function which(command) {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function driveHook(name, payload, env) {
  const raw = execFileSync('node', [path.join(PACKAGE_ROOT, 'hooks', name)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (!raw || !raw.trim()) return '';
  try {
    const parsed = JSON.parse(raw);
    return parsed.reason || (parsed.hookSpecificOutput || {}).additionalContext || '';
  } catch (e) {
    return raw;
  }
}

function line(label, value, state) {
  const mark = state === 'bad' ? paint('red', 'x') : state === 'warn' ? paint('amber', '!') : paint('green', 'ok');
  say('  ' + mark + '  ' + pad(label, 14) + value);
}

function doctor() {
  const root = projectRoot();
  let failed = false;

  say(heading('environment'));
  say('');
  const major = Number(process.versions.node.split('.')[0]);
  line('node', process.versions.node, major >= 20 ? 'good' : 'bad');
  if (major < 20) failed = true;
  const hasGit = which('git');
  line('git', hasGit ? 'found' : 'missing, the measurement half will not run', hasGit ? 'good' : 'warn');

  const projectSettings = path.join(root, '.claude', 'settings.json');
  const globalSettings = path.join(claudeDir(), 'settings.json');
  const installedHere = (readJsonStrict(projectSettings, null) || {}).hooks;
  const installedGlobally = (readJsonStrict(globalSettings, null) || {}).hooks;
  const scope = JSON.stringify(installedHere || {}).includes('ratchet-')
    ? 'project  ' + projectSettings
    : JSON.stringify(installedGlobally || {}).includes('ratchet-')
      ? 'global  ' + globalSettings
      : '';
  line('install', scope || 'not installed here, run: ratchet', scope ? 'good' : 'warn');

  say('');
  say(heading('the loop, driven with real payloads'));
  say('');

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-doctor-'));
  const home = path.join(scratch, 'home');
  const env = { CLAUDE_CONFIG_DIR: home, RATCHET_MODE: 'guard' };

  try {
    fs.mkdirSync(path.join(scratch, 'src'), { recursive: true });
    fs.mkdirSync(path.join(scratch, '.ratchet'), { recursive: true });
    fs.writeFileSync(path.join(scratch, 'package.json'), '{"name":"scratch","dependencies":{}}');
    fs.writeFileSync(
      path.join(scratch, 'src', 'time.js'),
      'export function formatDuration(ms) {\n  return ms + "ms";\n}\n'
    );

    if (hasGit) {
      const git = (...args) => execFileSync('git', args, { cwd: scratch, stdio: 'ignore' });
      git('init', '-q');
      git('config', 'user.email', 'doctor@ratchet');
      git('config', 'user.name', 'doctor');
      git('add', '-A');
      git('commit', '-qm', 'init');
    }

    const session = driveHook('ratchet-session.js', { session_id: 'doctor', cwd: scratch, source: 'startup' }, env);
    const ruleset = session.includes('RATCHET ACTIVE') && session.includes('first rung');
    line('session hook', ruleset ? 'injected the ruleset and the budget' : 'no ruleset came back', ruleset ? 'good' : 'bad');
    if (!ruleset) failed = true;

    const planted = [
      "import moment from 'moment';",
      '',
      'export function format_duration(ms) {',
      "  return ms + 'ms';",
      '}',
      '',
      'const snapshot = JSON.parse(JSON.stringify(state));',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(scratch, 'src', 'report.js'), planted);

    const guard = driveHook('ratchet-guard.js', {
      session_id: 'doctor',
      cwd: scratch,
      tool_name: 'Write',
      tool_input: { file_path: path.join(scratch, 'src', 'report.js'), content: planted },
    }, env);
    const tags = ['dep', 'native', 'exists'].filter((tag) => guard.includes(tag + ' '));
    line('guard hook', tags.length ? 'caught ' + tags.join(', ') + ' in a planted file' : 'caught nothing', tags.length >= 2 ? 'good' : 'bad');
    if (tags.length < 2) failed = true;

    const report = driveHook('ratchet-report.js', { session_id: 'doctor', cwd: scratch }, env);
    const ledger = fs.existsSync(path.join(scratch, '.ratchet', 'ledger.jsonl'));
    line('report hook', report.includes('ratchet guard session') ? (ledger ? 'summarised and wrote a ledger row' : 'summarised, no ledger') : 'silent', report ? 'good' : 'bad');
    if (!report) failed = true;

    if (guard) {
      say('');
      say(heading('what your agent would have received'));
      say('');
      say(guard.split('\n').map((row) => '  ' + row).join('\n'));
    }
  } catch (error) {
    line('loop', 'crashed: ' + error.message, 'bad');
    failed = true;
  } finally {
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch (e) {
      say(paint('grey', '  could not remove ' + scratch));
    }
  }

  say('');
  if (failed) {
    say(paint('red', 'something is wrong') + '. Open an issue with this output.');
    process.exitCode = 1;
    return;
  }
  say(paint('green', 'the loop is closed') + '.');
  if (!scope) {
    say(paint('grey', 'it is not wired into this repository yet. run: ratchet'));
    return;
  }
  say(paint('grey', 'start your agent here and give it a task. the guard output above is what it sees.'));
}

function readLog(root, limit) {
  try {
    const lines = fs.readFileSync(path.join(root, '.ratchet', 'hook.log'), 'utf8').split('\n').filter(Boolean);
    return lines.slice(-limit).map((line) => JSON.parse(line));
  } catch (e) {
    return [];
  }
}

function log() {
  const root = projectRoot();
  const file = path.join(root, '.ratchet', 'hook.log');

  if (flags.has('--clear')) {
    try {
      fs.unlinkSync(file);
      say('cleared ' + file);
    } catch (e) {
      say('nothing to clear');
    }
    return;
  }

  const entries = readLog(root, Number(process.env.RATCHET_LOG_LIMIT) || 12);
  if (!entries.length) {
    say('no hook activity recorded in ' + file);
    say('');
    say(paint('grey', 'logging is off by default. turn it on for this project:'));
    say(paint('grey', '  ratchet log --on'));
    say(paint('grey', 'then start your agent, give it a task, and run ratchet log again.'));
    return;
  }

  say(heading(entries.length + ' hook events, newest last'));
  for (const entry of entries) {
    say('');
    const when = entry.at.slice(11, 19);
    const badge = entry.blocked ? paint('red', 'BLOCKED') : paint('blue', entry.event);
    say('  ' + paint('grey', when) + '  ' + badge);
    const body = String(entry.output || '').trim();
    if (!body) {
      say(paint('grey', '     (no context emitted)'));
      continue;
    }
    for (const row of body.split('\n').slice(0, 14)) say('     ' + row);
  }
}

function setProjectFlag(key, value) {
  const file = path.join(projectRoot(), '.ratchet', 'config.json');
  if (!fs.existsSync(path.dirname(file))) return null;
  const config = readJsonStrict(file, {}) || {};
  config[key] = value;
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return file;
}

function logSwitch(on) {
  const file = setProjectFlag('log', on);
  if (!file) return say('not initialised here. run: ratchet init');
  say((on ? paint('green', 'hook logging on') : 'hook logging off') + ': ' + file);
  if (on) say(paint('grey', 'every hook appends to .ratchet/hook.log. read it with: ratchet log'));
}

function uiCommand() {
  if (flags.has('--debug')) return debugUi();
  const problem = openUi();
  if (problem) say('not opened: ' + problem);
  if (process.platform !== 'win32') say(paint('grey', 'use ratchet report, ratchet log or ratchet status instead'));
}

function help() {
  say(paint('bold', 'ratchet') + paint('grey', ', a complexity budget your agent cannot quietly ignore'));
  say('');
  const self = process.env.RATCHET_INVOKED_AS || 'ratchet';
  rows([
    [self, 'install hooks for this repository'],
    [self + ' --global', 'install hooks for every project'],
    [self + ' init', 'start measuring this repository'],
    [self + ' audit', 'scan the whole repo and list what to cut'],
    [self + ' baseline', 'accept what exists today, only flag new things'],
    [self + ' report', 'the measured trend from the ledger'],
    [self + ' rules', 'copy the ruleset for hosts without hooks'],
    [self + ' status', 'show what is installed and measured'],
    [self + ' doctor', 'drive every hook with real payloads and prove it works'],
    [self + ' log', 'what the hooks actually said during your real sessions'],
    [self + ' ui', 'reopen the window, --debug to see why it will not open'],
    [self + ' uninstall', 'remove hooks and session state'],
  ]);
  say('');
  say(paint('grey', '  not published to npm, so run it from a checkout:'));
  say(paint('grey', '    node bin/install.js <command>      or   npm install -g .'));
  say('');
  rows([
    ['--dry-run', 'print what would change and write nothing'],
    ['--global', 'act on the user level settings instead of this repository'],
    ['--force', 'overwrite existing rule files'],
  ]);
  say('');
  say(paint('grey', 'Restart your agent after installing so it picks the hooks up.'));
}

module.exports = { uiCommandLine };

const actions = { install, init: initRepo, audit, baseline, doctor, report, rules: copyRules, status, uninstall, help };
actions.log = () => (flags.has('--on') ? logSwitch(true) : flags.has('--off') ? logSwitch(false) : log());
actions.ui = uiCommand;

if (require.main === module) {
  const beacon = require('../hooks/lib/beacon');

  beacon.run(command || 'install').catch(() => {}).finally(() => {
    const action = actions[command];
    if (!action) fail('unknown command: ' + command + '\nrun: ratchet help');
    if (dryRun && !['status', 'help', 'report', 'audit', 'doctor', 'log', 'ui'].includes(command)) {
      say(paint('grey', 'dry run, nothing will be written'));
    }
    action();
    if (command !== 'help') launchUiInterface();
  });
}