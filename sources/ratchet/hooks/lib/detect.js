'use strict';

const path = require('path');
const { addedDependencies, addedLines, isManifest, splitLines } = require('./changes');
const { extractSymbols, lookup } = require('./index-symbols');

const JS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'];
const PY = ['.py'];
const GO = ['.go'];
const RB = ['.rb'];
const WEB = ['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte'];

const CERTAIN = 'certain';
const LIKELY = 'likely';
const HEURISTIC = 'heuristic';

const RANK = { certain: 0, likely: 1, heuristic: 2 };

const PATTERNS = [
  {
    tag: 'native', ext: JS, confidence: CERTAIN,
    test: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    what: 'clone via JSON round trip, silently drops Date, Map, Set and cycles',
    fix: 'structuredClone(value)',
  },
  {
    tag: 'native', ext: JS, confidence: LIKELY,
    test: /new Promise\s*\(\s*\(?\s*(\w+)\s*\)?\s*=>\s*setTimeout\s*\(\s*\1/,
    what: 'hand-rolled sleep helper',
    fix: "import { setTimeout as sleep } from 'node:timers/promises'",
  },
  {
    tag: 'dep', ext: JS, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"]moment['"]/,
    what: 'moment imported for date work', dep: 'moment',
    fix: 'Intl.DateTimeFormat, zero dependencies',
  },
  {
    tag: 'dep', ext: JS, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"]uuid['"]/,
    what: 'uuid package', dep: 'uuid',
    fix: 'crypto.randomUUID()',
  },
  {
    tag: 'dep', ext: JS, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"](?:node-fetch|isomorphic-fetch)['"]/,
    what: 'fetch polyfill', dep: 'node-fetch',
    fix: 'global fetch, built in since Node 18',
  },
  {
    tag: 'dep', ext: JS, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"]dotenv['"]/,
    what: 'dotenv', dep: 'dotenv',
    fix: 'node --env-file=.env',
  },
  {
    tag: 'dep', ext: JS, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"](?:left-pad|pad-left|object-assign|is-array)['"]/,
    what: 'a package for something the language ships', dep: 'left-pad',
    fix: 'padStart, Object.assign, Array.isArray',
  },
  {
    tag: 'stdlib', ext: JS, confidence: HEURISTIC,
    test: /\.reduce\s*\(\s*\(?\s*\w+\s*,\s*\w+\s*\)?\s*=>\s*\{[^}]*\[\s*\w+[^\]]*\]\s*(?:\|\||\?\?)=?\s*\[\s*\]/,
    what: 'manual group-by reduce',
    fix: 'Object.groupBy(items, keyFn)',
  },
  {
    tag: 'stdlib', ext: JS, confidence: HEURISTIC,
    test: /while\s*\(\s*\w+\.length\s*<\s*\w+\s*\)\s*\{?\s*\w+\s*=\s*['"`]/,
    what: 'manual string padding loop',
    fix: 'String.prototype.padStart',
  },
  {
    tag: 'stdlib', ext: JS, confidence: LIKELY,
    test: /\.split\s*\(\s*['"]&['"]\s*\)[\s\S]{0,80}\.split\s*\(\s*['"]=['"]\s*\)/,
    what: 'hand-parsed query string',
    fix: 'new URLSearchParams(search)',
  },
  {
    tag: 'stdlib', ext: JS, confidence: LIKELY,
    test: /Math\.random\s*\(\)[\s\S]{0,60}toString\s*\(\s*36\s*\)[\s\S]{0,40}(?:substr|slice)/,
    what: 'random id from Math.random, neither collision safe nor secure',
    fix: 'crypto.randomUUID()',
  },
  {
    tag: 'stdlib', ext: PY, confidence: LIKELY,
    test: /^\s*def\s+deep_?copy\b/m,
    what: 'reimplemented deep copy',
    fix: 'copy.deepcopy',
  },
  {
    tag: 'stdlib', ext: PY, confidence: HEURISTIC,
    test: /if\s+\w+\s+not\s+in\s+(\w+)\s*:\s*\n\s*\1\[\w+\]\s*=\s*(?:\[\s*\]|0)/,
    what: 'manual dict accumulation',
    fix: 'collections.defaultdict or collections.Counter',
  },
  {
    tag: 'stdlib', ext: PY, confidence: CERTAIN,
    test: /open\s*\([^)]*\)\s*\.\s*(?:read|write)\s*\(/,
    what: 'file handle never closed',
    fix: 'pathlib.Path.read_text or a with block',
  },
  {
    tag: 'stdlib', ext: PY, confidence: LIKELY,
    test: /^\s*for\s+\w+\s+in\s+range\s*\(\s*len\s*\(/m,
    what: 'index loop over a sequence',
    fix: 'iterate directly, or enumerate when the index is needed',
  },
  {
    tag: 'stdlib', ext: GO, confidence: LIKELY,
    test: /ioutil\.(?:ReadFile|WriteFile|ReadAll)/,
    what: 'deprecated ioutil',
    fix: 'os.ReadFile, os.WriteFile, io.ReadAll',
  },
  {
    tag: 'validation', ext: JS.concat(PY, RB), confidence: LIKELY,
    test: /["'`/]\^?[^"'`\n]{0,40}\[[^\]]*[A-Za-z0-9][^\]]*\]\+@[^"'`\n]{0,60}\{2,\}/,
    what: 'bespoke email regex, every one of them rejects valid addresses',
    fix: 'check for a single "@", then confirm by sending mail',
  },
  {
    tag: 'native', ext: WEB, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"](?:flatpickr|react-datepicker|air-datepicker|pikaday)['"]/,
    what: 'date picker component library', dep: 'flatpickr',
    fix: '<input type="date">',
  },
  {
    tag: 'native', ext: WEB, confidence: CERTAIN,
    test: /(?:require\(|from\s+)['"](?:react-modal|@reach\/dialog)['"]/,
    what: 'modal dialog library', dep: 'react-modal',
    fix: '<dialog> with showModal(), focus trap and Escape included',
  },
  {
    tag: 'native', ext: WEB, confidence: HEURISTIC,
    test: /addEventListener\s*\(\s*['"]scroll['"][\s\S]{0,120}getBoundingClientRect/,
    what: 'scroll listener computing visibility',
    fix: 'IntersectionObserver',
  },
];

const ABSTRACTION = [
  { test: /^\s*(?:export\s+)?interface\s+([A-Z][\w]*)/m, kind: 'interface' },
  { test: /^\s*(?:export\s+)?abstract\s+class\s+([A-Z][\w]*)/m, kind: 'abstract class' },
  { test: /^\s*class\s+([A-Z][\w]*)\s*\(\s*(?:ABC|Protocol)\s*\)/m, kind: 'abstract base class' },
];

const WRAPPERS = {
  js: /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{\s*return\s+(?:await\s+)?([A-Za-z_$][\w$.]*)\s*\(([^)]*)\)\s*;?\s*\}/g,
  py: /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:->[^:]+)?:\s*\n\s*return\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)\s*$/gm,
  go: /func\s+([A-Za-z_]\w*)\s*\(([^)]*)\)[^{\n]*\{\s*return\s+([A-Za-z_][\w.]*)\s*\(([^)]*)\)\s*\}/g,
  rb: /^\s*def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\n\s*([A-Za-z_][\w.]*)\s*\(([^)]*)\)\s*\n\s*end/gm,
};

const IGNORE_LINE = /ratchet-ignore\b/;

function extension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function wrapperPattern(ext) {
  if (PY.includes(ext)) return WRAPPERS.py;
  if (GO.includes(ext)) return WRAPPERS.go;
  if (RB.includes(ext)) return WRAPPERS.rb;
  if (JS.includes(ext)) return WRAPPERS.js;
  return null;
}

function paramNames(text) {
  return String(text)
    .split(',')
    .map((part) => part.split(':')[0].replace(/[*&]/g, '').trim().split(/\s+/)[0] || '')
    .filter(Boolean)
    .join(',');
}

function suppressedLines(after) {
  const suppressed = new Set();
  splitLines(after).forEach((text, index) => {
    if (!IGNORE_LINE.test(text)) return;
    suppressed.add(index + 1);
    suppressed.add(index + 2);
  });
  return suppressed;
}

function locate(lines, pattern) {
  for (const entry of lines) {
    if (pattern.test(entry.text)) return entry.line;
  }
  return lines.length ? lines[0].line : 1;
}

function make(tag, confidence, change, line, what, fix, dep) {
  const finding = { tag, confidence, path: change.path, line, what, fix };
  if (dep) finding.dep = dep;
  return finding;
}

function scanPatterns(change, added) {
  const ext = extension(change.path);
  const region = added.map((entry) => entry.text).join('\n');
  if (!region) return [];
  return PATTERNS.filter((p) => p.ext.includes(ext) && p.test.test(region)).map((p) =>
    make(p.tag, p.confidence, change, locate(added, p.test), p.what, p.fix, p.dep)
  );
}

function scanWrappers(change, added) {
  const pattern = wrapperPattern(extension(change.path));
  const region = added.map((entry) => entry.text).join('\n');
  if (!pattern || !region) return [];
  const findings = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(region);
  while (match) {
    const name = match[1];
    const callee = match[3];
    if (paramNames(match[2]) === paramNames(match[4]) && name !== callee.split('.').pop()) {
      findings.push(
        make('wrapper', LIKELY, change, locate(added, new RegExp(name.replace(/[$]/g, '\\$'))),
          name + ' only forwards to ' + callee,
          'call ' + callee + ' directly and delete the wrapper')
      );
    }
    match = pattern.exec(region);
  }
  return findings;
}

function scanAbstractions(change, added, context) {
  const region = added.map((entry) => entry.text).join('\n');
  const findings = [];
  for (const rule of ABSTRACTION) {
    const match = region.match(rule.test);
    if (!match) continue;
    const name = match[1];
    const implementations = context.countImplementations ? context.countImplementations(name) : 2;
    if (implementations <= 1) {
      findings.push(
        make('yagni', LIKELY, change, locate(added, new RegExp(name)),
          rule.kind + ' ' + name + ' has ' + implementations + ' implementation',
          'inline it, reintroduce when a second implementation exists')
      );
    }
  }
  return findings;
}

function scanDuplicates(change, added, context) {
  if (!context.symbols) return [];
  const region = added.map((entry) => entry.text).join('\n');
  const findings = [];
  for (const name of extractSymbols(region)) {
    const hit = lookup(context.symbols, name, change.path, context.root);
    if (!hit) continue;
    findings.push(
      make('exists', LIKELY, change,
        locate(added, new RegExp(name.replace(/[$]/g, '\\$'))),
        name + ' duplicates ' + hit.name + ' in ' + hit.file,
        'import the existing one')
    );
  }
  return findings;
}

function scanManifest(change) {
  if (!isManifest(change.path)) return [];
  return addedDependencies(change.path, change.before, change.after).map((name) =>
    make('dep', CERTAIN, change, 1, 'new dependency ' + name,
      'justify it against the stdlib and the platform, or drop it', name)
  );
}

function fingerprint(finding, relative) {
  return [finding.tag, relative || finding.path, String(finding.what).replace(/\d+/g, '#')].join('|');
}

function inspect(change, context = {}) {
  const added = addedLines(change.before, change.after);
  const removed = addedLines(change.after, change.before);
  if (!added.length && !isManifest(change.path)) return { added: [], removed, findings: [] };

  const suppressed = suppressedLines(change.after);
  const findings = [
    ...scanManifest(change),
    ...scanPatterns(change, added),
    ...scanWrappers(change, added),
    ...scanAbstractions(change, added, context),
    ...scanDuplicates(change, added, context),
  ].filter((finding) => !suppressed.has(finding.line));

  const unique = new Map();
  for (const finding of findings) {
    const key = finding.tag + '|' + finding.what;
    const previous = unique.get(key);
    if (!previous || RANK[finding.confidence] < RANK[previous.confidence]) unique.set(key, finding);
  }

  const ordered = [...unique.values()].sort(
    (a, b) => RANK[a.confidence] - RANK[b.confidence] || a.line - b.line
  );
  return { added, removed, findings: ordered };
}

function budgetFindings(session, budget) {
  if (!budget) return [];
  const findings = [];
  const net = session.addedLines - (session.removedLines || 0);

  if (session.newFiles.length > budget.newFiles) {
    findings.push({
      tag: 'budget', confidence: CERTAIN, path: '', line: 0,
      what: session.newFiles.length + ' new files, budget is ' + budget.newFiles,
      fix: 'fold the extras into files that already exist',
    });
  }
  if (session.deps.length > budget.newDeps) {
    findings.push({
      tag: 'budget', confidence: CERTAIN, path: '', line: 0,
      what: session.deps.length + ' new dependencies, budget is ' + budget.newDeps,
      fix: 'drop ' + session.deps.slice(budget.newDeps).join(', '),
    });
  }
  if (net > budget.addedLines) {
    findings.push({
      tag: 'budget', confidence: CERTAIN, path: '', line: 0,
      what: net + ' net added lines, budget is ' + budget.addedLines,
      fix: 'stop adding and start deleting, or raise the budget explicitly',
    });
  }
  return findings;
}

function format(finding) {
  const where = finding.path ? finding.path + ':' + finding.line + ' ' : '';
  return where + finding.tag + ': ' + finding.what + '. ' + finding.fix + '.';
}

module.exports = {
  CERTAIN, HEURISTIC, LIKELY, PATTERNS, RANK,
  budgetFindings, fingerprint, format, inspect, splitLines, suppressedLines,
};
