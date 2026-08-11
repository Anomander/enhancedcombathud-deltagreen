import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('module.json Manifest Verification', () => {
  const manifestPath = path.resolve(process.cwd(), 'module.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  it('has required id and title', () => {
    expect(manifest.id).toBe('delta-green-combat-hud');
    expect(manifest.title).toBe('Delta Green Enhanced Combat HUD');
  });

  it('declares compatibility range for Foundry v11-v14', () => {
    expect(manifest.compatibility.minimum).toBe('11');
    expect(manifest.compatibility.verified).toBe('12');
  });

  it('declares entrypoint ES module script that exists', () => {
    expect(manifest.esmodules).toContain('scripts/delta-green-combat-hud.mjs');
    for (const esmod of manifest.esmodules) {
      expect(fs.existsSync(path.resolve(process.cwd(), esmod))).toBe(true);
    }
  });

  it('declares stylesheet path that exists', () => {
    expect(manifest.styles).toContain('styles/delta-green-combat-hud.css');
    for (const style of manifest.styles) {
      expect(fs.existsSync(path.resolve(process.cwd(), style))).toBe(true);
    }
  });

  it('declares languages that exist on disk', () => {
    expect(manifest.languages.length).toBeGreaterThan(0);
    for (const lang of manifest.languages) {
      expect(fs.existsSync(path.resolve(process.cwd(), lang.path))).toBe(true);
    }
  });
});
