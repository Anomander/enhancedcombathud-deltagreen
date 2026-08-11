import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('Build Pipeline & Distribution Verification', () => {
  it('executes tools/build.mjs cleanly and produces valid dist/ directory', () => {
    // Run npm run build
    expect(() => {
      execSync('npm run build', { cwd: process.cwd(), stdio: 'pipe' });
    }).not.toThrow();

    const distDir = path.resolve(process.cwd(), 'dist');
    expect(fs.existsSync(distDir)).toBe(true);

    const scriptBundle = path.join(distDir, 'scripts/delta-green-combat-hud.mjs');
    expect(fs.existsSync(scriptBundle)).toBe(true);
    expect(fs.statSync(scriptBundle).size).toBeGreaterThan(1000);

    const styleSheet = path.join(distDir, 'styles/delta-green-combat-hud.css');
    expect(fs.existsSync(styleSheet)).toBe(true);

    const manifestCopy = path.join(distDir, 'module.json');
    expect(fs.existsSync(manifestCopy)).toBe(true);

    const enLangCopy = path.join(distDir, 'lang/en.json');
    expect(fs.existsSync(enLangCopy)).toBe(true);
  });
});
