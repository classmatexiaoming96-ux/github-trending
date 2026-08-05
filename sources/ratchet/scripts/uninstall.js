#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { configPath } = require('../hooks/lib/config');
const { stateDir } = require('../hooks/lib/state');

function remove(target, label) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
    if (fs.existsSync(target)) return;
    console.log('removed ' + label + ': ' + target);
  } catch (e) {
    console.warn('could not remove ' + label + ': ' + e.message);
  }
}

remove(stateDir(), 'session state');
remove(configPath(), 'user config');

console.log('left in place: .ratchet/ in each repository, that is your ledger and belongs to the project');
console.log('remove the plugin itself with your host command, for example /plugin remove ratchet');
