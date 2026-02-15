import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoolean, parseCsv, parseInteger } from '../src/config/env.js';

test('parseCsv trims entries and drops empty values', () => {
  assert.deepEqual(parseCsv(' https://a.com, ,https://b.com ,,  '), [
    'https://a.com',
    'https://b.com',
  ]);
});

test('parseBoolean supports common true/false strings', () => {
  assert.equal(parseBoolean('true'), true);
  assert.equal(parseBoolean('1'), true);
  assert.equal(parseBoolean('false'), false);
  assert.equal(parseBoolean('0'), false);
  assert.equal(parseBoolean(undefined, true), true);
});

test('parseInteger enforces bounds and fallback', () => {
  assert.equal(parseInteger(undefined, { name: 'PORT', fallback: 3000 }), 3000);
  assert.equal(parseInteger('42', { name: 'RATE_LIMIT_MAX', min: 1 }), 42);
  assert.throws(() => parseInteger('0', { name: 'RATE_LIMIT_MAX', min: 1 }));
});
