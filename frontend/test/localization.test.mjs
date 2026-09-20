import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}

function variable(file, name) {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find(item => item.name.text === name);
    if (declaration) return declaration.initializer;
  }
  throw new Error(`Missing ${name}`);
}

function entries(object) {
  const properties = object.properties ?? object.expression.properties;
  return Object.fromEntries(properties.map(property => [property.name.text, property.initializer.text]));
}

const messages = source('../i18n/messages.ts');
const supplemental = source('../i18n/supplemental-messages.ts');
const base = entries(variable(messages, 'en'));
const primary = variable(messages, 'translations');
const extra = variable(supplemental, 'supplementalTranslations');
const extraByLocale = Object.fromEntries(extra.properties.map(property => [property.name.text, entries(property.initializer)]));

for (const locale of ['uz-UZ', 'kk-KZ', 'ky-KG', 'tg-TJ', 'ru-RU']) {
  test(`${locale} has every UI message and matching placeholders`, () => {
    const localized = {
      ...extraByLocale[locale],
      ...entries(primary.properties.find(property => property.name.text === locale).initializer),
    };
    const missing = Object.keys(base).filter(key => !localized[key]);
    assert.deepEqual(missing, [], `Untranslated keys in ${locale}`);
    const placeholders = text => [...text.matchAll(/\{[^{}]+\}/g)].map(match => match[0]).sort();
    for (const [key, text] of Object.entries(base)) {
      assert.deepEqual(placeholders(localized[key]), placeholders(text), `${locale}: ${key}`);
    }
  });
}

test('rendered JSX contains no hard-coded language-dependent text', () => {
  const frontend = fileURLToPath(new URL('..', import.meta.url));
  const files = [];
  function walk(folder) {
    for (const entry of readdirSync(path.join(frontend, folder), { withFileTypes: true })) {
      const relative = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (entry.name.endsWith('.tsx')) files.push(relative);
    }
  }
  walk('app'); walk('components');
  const hardCoded = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(path.join(frontend, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isJsxText(node)) {
        const value = node.getText(source).replace(/\s+/g, ' ').trim();
        if (/[A-Za-zА-Яа-я]/.test(value) && !['UZS', 'A', 'Agrologistik'].includes(value)) {
          hardCoded.push(`${file}: ${value}`);
        }
      }
      if (ts.isJsxAttribute(node) && ['aria-label', 'title', 'alt'].includes(node.name.text)
          && node.initializer && ts.isStringLiteral(node.initializer)
          && /[A-Za-zА-Яа-я]/.test(node.initializer.text)) {
        hardCoded.push(`${file}: ${node.name.text}=${node.initializer.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(hardCoded, []);
});
