import test from 'node:test';
import assert from 'node:assert/strict';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../web/src/lib/reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { normalizeReaderSettings, DEFAULT_READER_SETTINGS, spreadStart, readReaderSettings, readReadingPosition, saveReaderValue } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('corrupt or unavailable browser storage does not prevent reading', () => {
  globalThis.localStorage = { getItem() { throw new Error('storage denied'); }, setItem() { throw new Error('quota exceeded'); } };
  assert.deepEqual(readReaderSettings(), DEFAULT_READER_SETTINGS);
  assert.equal(readReadingPosition('book', 1), null);
  assert.doesNotThrow(() => saveReaderValue('muse:reader-settings', DEFAULT_READER_SETTINGS));
  globalThis.localStorage = { getItem() { return '{broken'; } };
  assert.deepEqual(readReaderSettings(), DEFAULT_READER_SETTINGS);
  assert.equal(readReadingPosition('book', 1), null);
  delete globalThis.localStorage;
});

test('preferences clamp invalid typography and preserve valid directions and themes', () => {
  assert.deepEqual(normalizeReaderSettings(null), DEFAULT_READER_SETTINGS);
  const invalid = normalizeReaderSettings({ fontSize: 1000, lineHeight: -1, font: 'injected', theme: '__proto__', direction: 'sideways' });
  assert.equal(invalid.fontSize, 32); assert.equal(invalid.lineHeight, 1.4); assert.equal(invalid.theme, 'paper'); assert.equal(invalid.direction, 'left');
  assert.equal(normalizeReaderSettings({ fontSize: NaN, lineHeight: Infinity }).fontSize, 20);
  const valid = { layout: 'double', direction: 'up', fontSize: 24, lineHeight: 2.1, font: 'sans', theme: 'night' };
  assert.deepEqual(normalizeReaderSettings(valid), valid);
});

test('resume is isolated by book and publishing version and rejects invalid positions', () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const position = { chapter: 2, offset: 1500, version: 3 };
  saveReaderValue('muse:reading:one', position);
  assert.deepEqual(readReadingPosition('one', 3), position);
  assert.equal(readReadingPosition('one', 4), null); assert.equal(readReadingPosition('two', 3), null);
  saveReaderValue('muse:reading:one', { chapter: -1, offset: 0, version: 3 });
  assert.equal(readReadingPosition('one', 3), null);
  saveReaderValue('muse:reading:one', { chapter: 0, offset: 1.5, version: 3 });
  assert.equal(readReadingPosition('one', 3), null);
  delete globalThis.localStorage;
});

test('spread navigation includes the odd last page without going beyond chapter bounds', () => {
  assert.equal(spreadStart(99, 5, 2), 4);
  assert.equal(spreadStart(99, 6, 2), 4);
  assert.equal(spreadStart(-2, 5, 2), 0);
  assert.equal(spreadStart(3, 5, 2), 2);
  assert.equal(spreadStart(0, 1, 2), 0);
  assert.equal(spreadStart(4, 5, 1), 4);
});
