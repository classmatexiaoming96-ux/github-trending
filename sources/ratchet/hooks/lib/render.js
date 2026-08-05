'use strict';

const CODES = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bold: '\u001b[1m',
  red: '\u001b[38;5;174m',
  amber: '\u001b[38;5;179m',
  green: '\u001b[38;5;108m',
  blue: '\u001b[38;5;110m',
  grey: '\u001b[38;5;245m',
};

const enabled =
  process.env.NO_COLOR === undefined &&
  process.env.TERM !== 'dumb' &&
  Boolean(process.stdout.isTTY);

function paint(name, text) {
  if (!enabled || !CODES[name]) return String(text);
  return CODES[name] + text + CODES.reset;
}

function width(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, '').length;
}

function pad(text, size, right) {
  const gap = size - width(text);
  if (gap <= 0) return String(text);
  return right ? ' '.repeat(gap) + text : text + ' '.repeat(gap);
}

function table(rows, options = {}) {
  if (!rows.length) return '';
  const columns = rows[0].length;
  const widths = [];
  for (let i = 0; i < columns; i += 1) {
    widths.push(Math.max(...rows.map((row) => width(row[i] === undefined ? '' : row[i]))));
  }
  const align = options.align || [];
  const gap = options.gap === undefined ? 2 : options.gap;
  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const value = cell === undefined ? '' : cell;
          if (i === columns - 1 && align[i] !== 'right') return String(value);
          return pad(value, widths[i], align[i] === 'right');
        })
        .join(' '.repeat(gap))
        .replace(/\s+$/, '')
    )
    .join('\n');
}

const BLOCKS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

function sparkline(values) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min;
  if (!values.length) return '';
  return values
    .map((value) => (span === 0 ? BLOCKS[3] : BLOCKS[Math.round(((value - min) / span) * (BLOCKS.length - 1))]))
    .join('');
}

function bar(value, max, size = 24) {
  if (max <= 0) return '';
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '\u2588'.repeat(filled) + paint('grey', '\u00b7'.repeat(size - filled));
}

function heading(text) {
  return paint('bold', text) + '\n' + paint('grey', '\u2500'.repeat(width(text)));
}

function trend(current, previous) {
  if (previous === undefined || previous === null) return paint('grey', 'new');
  const delta = current - previous;
  if (delta === 0) return paint('grey', 'flat');
  return paint(delta < 0 ? 'green' : 'amber', (delta < 0 ? '\u25bc' : '\u25b2') + ' ' + Math.abs(delta));
}

module.exports = { bar, heading, paint, pad, sparkline, table, trend };

function groupByConfidence(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = finding.confidence || 'likely';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  return ['certain', 'likely', 'heuristic'].filter((key) => groups.has(key)).map((key) => [key, groups.get(key)]);
}

const TONE = { certain: 'red', likely: 'amber', heuristic: 'grey' };

function alignedFindings(findings, options = {}) {
  if (!findings.length) return '';
  const tint = (name, text) => (options.colour === true ? paint(name, text) : String(text));
  const where = (finding) => (finding.path ? finding.path + ':' + finding.line : 'session');
  const at = Math.max(...findings.map((finding) => where(finding).length));
  const tag = Math.max(...findings.map((finding) => finding.tag.length));
  const out = [];

  for (const [level, group] of groupByConfidence(findings)) {
    out.push(tint(TONE[level], level));
    for (const finding of group) {
      out.push('  ' + pad(where(finding), at) + '  ' + pad(finding.tag, tag) + '  ' + finding.what);
      out.push('  ' + ' '.repeat(at + tag + 2) + tint('grey', '  ' + finding.fix));
    }
  }
  return out.join('\n');
}

module.exports.alignedFindings = alignedFindings;
