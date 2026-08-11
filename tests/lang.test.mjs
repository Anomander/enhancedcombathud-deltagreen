import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('i18n Language Parity Verification', () => {
  const langDir = path.resolve(process.cwd(), 'lang');
  const enJson = JSON.parse(fs.readFileSync(path.join(langDir, 'en.json'), 'utf8'));
  const esJson = JSON.parse(fs.readFileSync(path.join(langDir, 'es.json'), 'utf8'));

  const enKeys = Object.keys(enJson).sort();
  const esKeys = Object.keys(esJson).sort();

  it('en.json and es.json must carry the exact same set of keys', () => {
    expect(enKeys).toEqual(esKeys);
  });

  it('no localization values should be empty strings', () => {
    for (const key of enKeys) {
      expect(enJson[key].trim()).not.toBe('');
      expect(esJson[key].trim()).not.toBe('');
    }
  });
});
