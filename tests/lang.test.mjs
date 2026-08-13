/**
 * Localisation.
 *
 * Parity between en and es is necessary but not sufficient: the previous suite
 * passed while 17 of 38 keys were unused and every HUD string was hardcoded
 * English. These tests also assert that keys and call sites match (UX-3).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const en = JSON.parse(fs.readFileSync(path.join(root, 'lang', 'en.json'), 'utf8'));
const es = JSON.parse(fs.readFileSync(path.join(root, 'lang', 'es.json'), 'utf8'));

/** Every .mjs under scripts/, concatenated. */
function readScripts() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs')) files.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(root, 'scripts'));
  return files.join('\n');
}

const source = readScripts();

/** Keys referenced as string literals anywhere in scripts/. */
const referenced = new Set([...source.matchAll(/['"`](DG_HUD\.[A-Za-z.]+)['"`]/g)].map((m) => m[1]));

/** Keys built dynamically, e.g. `DG_HUD.Stats.${key}` — recorded as prefixes. */
const dynamicPrefixes = [...source.matchAll(/[`'"](DG_HUD\.[A-Za-z.]*?)\$\{/g)].map((m) => m[1]);

function isReferenced(key) {
  return referenced.has(key) || dynamicPrefixes.some((prefix) => key.startsWith(prefix));
}

describe('Language parity', () => {
  it('defines the same keys in both directions', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('leaves no value empty', () => {
    for (const [key, value] of Object.entries({ ...en, ...es })) {
      expect(value, `${key} is empty`).toBeTruthy();
    }
  });

  it('uses the same interpolation placeholders in both languages', () => {
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

    for (const key of Object.keys(en)) {
      expect(placeholders(es[key]), `placeholders differ for ${key}`).toEqual(placeholders(en[key]));
    }
  });
});

describe('Keys and call sites agree', () => {
  it('references every key it defines', () => {
    const unused = Object.keys(en).filter((key) => !isReferenced(key));
    expect(unused, `unused keys: ${unused.join(', ')}`).toEqual([]);
  });

  it('defines every key it references', () => {
    const missing = [...referenced].filter((key) => !(key in en));
    expect(missing, `undefined keys: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('No hardcoded user-facing strings', () => {
  it('routes notifications through i18n', () => {
    // ui.notifications.warn("some prose") would be untranslatable.
    const literals = [...source.matchAll(/ui\.notifications\.\w+\(\s*['"`]([^'"`]+)/g)].map((m) => m[1]);
    expect(literals).toEqual([]);
  });
});
