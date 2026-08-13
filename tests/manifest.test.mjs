import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('module.json Manifest Verification', () => {
  const manifestPath = path.resolve(process.cwd(), 'module.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  it('uses the id Argon Core discovers system modules by', () => {
    // Argon looks up `enhancedcombathud-${game.system.id}` and shows a permanent
    // error if it is not active. See CoreHud.js performModuleCheck.
    expect(manifest.id).toBe('enhancedcombathud-deltagreen');
  });

  it('keeps the module id and the settings namespace in step', async () => {
    // Settings are namespaced by module id; a mismatch silently loses them all.
    const { MODULE_ID } = await import('../scripts/settings.mjs');
    expect(MODULE_ID).toBe(manifest.id);
  });

  it('has a title', () => {
    expect(manifest.title).toBeTruthy();
  });

  it('requires a Foundry version Argon Core supports', () => {
    // Argon Core 5.x declares minimum v14, so this module cannot claim less.
    expect(Number(manifest.compatibility.minimum)).toBeGreaterThanOrEqual(14);
    expect(Number(manifest.compatibility.verified)).toBeGreaterThanOrEqual(14);
  });

  it('requires Argon Core, without which it contributes nothing', () => {
    const requires = manifest.relationships?.requires ?? [];
    const argon = requires.find((entry) => entry.id === 'enhancedcombathud');

    expect(argon, 'enhancedcombathud must be in relationships.requires').toBeDefined();
    expect(argon.type).toBe('module');
    expect(Number.parseInt(argon.compatibility.minimum, 10)).toBeGreaterThanOrEqual(5);
  });

  it('requires a Delta Green system version with the 2.x data model', () => {
    const system = manifest.relationships.systems.find((entry) => entry.id === 'deltagreen');
    expect(Number.parseInt(system.compatibility.minimum, 10)).toBeGreaterThanOrEqual(2);
  });

  it('declares entrypoint ES module script that exists', () => {
    expect(manifest.esmodules).toContain('scripts/delta-green-combat-hud.mjs');
    for (const esmod of manifest.esmodules) {
      expect(fs.existsSync(path.resolve(process.cwd(), esmod))).toBe(true);
    }
  });

  it('declares stylesheet path that exists', () => {
    const stylePaths = manifest.styles.map((s) => (typeof s === 'string' ? s : s.src));
    expect(stylePaths).toContain('styles/delta-green-combat-hud.css');
    for (const style of stylePaths) {
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
