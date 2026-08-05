'use strict';

const path = require('path');

function toPosix(value) {
  return String(value).split('\\').join('/');
}

function relativePosix(from, to) {
  return toPosix(path.relative(from, to));
}

const TEST_DIR = /(^|\/)(tests?|__tests__|spec|specs|fixtures|__fixtures__|testdata|e2e)(\/|$)/i;
const TEST_FILE = /(\.|_|^)(test|spec)s?\.[a-z]+$|^test_[^/]+\.py$|(^|\/)conftest\.py$|\.stories\.[a-z]+$/i;

function isTestPath(relative) {
  const value = toPosix(relative);
  return TEST_DIR.test(value) || TEST_FILE.test(value.split('/').pop());
}

module.exports = { isTestPath, relativePosix, toPosix };
