import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/wallet-input.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
// Reproduce an HTTP hotspot browser: crypto exists, but randomUUID is absent.
vm.runInNewContext(outputText, { exports, crypto: { getRandomValues: value => webcrypto.getRandomValues(value) } });
test('wallet operation IDs work without secure-context randomUUID', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => exports.walletOperationId()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('wallet accepts decimal money without floating-point rejection', () => {
  for (const value of ['1.10', '0.01', '100000', '900000000']) assert.equal(exports.walletAmount(value), Number(value));
  for (const value of ['', '-1', '0', '1.001', '900000000.01', 'NaN', 'Infinity']) assert.equal(exports.walletAmount(value), null);
});
