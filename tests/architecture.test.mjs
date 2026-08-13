/**
 * ARCH-6, enforced mechanically.
 *
 * The Argon dependency was accepted on one condition: it stays evictable
 * (docs/DESIGN.md §4). That condition was stated in prose and violated anyway,
 * which is the argument for asserting it here — an invariant a machine does not
 * check is a preference.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

/**
 * Exempt by role, not by convenience.
 *  - the composition root exists to wire a presentation layer in
 *  - diagnostics exists to describe the environment, and a report that could
 *    not name Argon would be useless
 */
const EXEMPT = new Set(['delta-green-combat-hud.mjs', 'diagnostics.mjs']);

/** Every .mjs under scripts/, repo-relative, POSIX separators. */
function sourceFiles(dir = '') {
  return fs.readdirSync(path.join(SCRIPTS, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? sourceFiles(path.join(dir, entry.name))
      : entry.name.endsWith('.mjs')
      ? [path.posix.join(dir.split(path.sep).join('/'), entry.name).replace(/^\//, '')]
      : []
  );
}

const coreFiles = sourceFiles().filter(
  (file) => !file.startsWith('argon/') && !EXEMPT.has(file)
);

describe('ARCH-6 — the core is HUD-agnostic', () => {
  it('has core files to check', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
  });

  it('never reaches for Argon outside the presentation layer', () => {
    const offenders = coreFiles.filter((file) =>
      /ui\.ARGON|CONFIG\.ARGON/.test(fs.readFileSync(path.join(SCRIPTS, file), 'utf8'))
    );

    expect(offenders, `${offenders.join(', ')} must reach the HUD through host.mjs instead`).toEqual([]);
  });

  it('never imports from the presentation layer outside the composition root', () => {
    const offenders = coreFiles.filter((file) =>
      /from\s+['"]\.{1,2}\/argon\//.test(fs.readFileSync(path.join(SCRIPTS, file), 'utf8'))
    );

    expect(offenders, `${offenders.join(', ')} import presentation code`).toEqual([]);
  });

  it('routes every HUD capability in the public API through the host seam', () => {
    const api = fs.readFileSync(path.join(SCRIPTS, 'api.mjs'), 'utf8');
    expect(api).toMatch(/getHost\(\)/);
    expect(api).not.toMatch(/ui\.ARGON/);
  });
});

describe('The presentation layer registers a host', () => {
  it('supplies every member the core relies on', () => {
    const register = fs.readFileSync(path.join(SCRIPTS, 'argon', 'register.mjs'), 'utf8');

    expect(register).toMatch(/registerHost\(/);
    for (const member of ['actor', 'token', 'isVisible', 'toggle', 'refresh']) {
      expect(register, `host is missing "${member}"`).toMatch(new RegExp(`\\b${member}\\b`));
    }
  });
});
