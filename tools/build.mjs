#!/usr/bin/env node
/**
 * Release build script for Delta Green Enhanced Combat HUD.
 * Produces `dist/` - the exact tree that ships inside module.zip.
 * 
 * Run: `npm run build`
 */

import * as esbuild from 'esbuild';
import Handlebars from 'handlebars';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const src = (...p) => path.join(ROOT, ...p);
const out = (...p) => path.join(DIST, ...p);

const VERBATIM = [
  'LICENSE',
  'module.json',
  'release_notes.txt'
];

const size = (file) => fs.statSync(file).size;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

async function buildScripts() {
  const result = await esbuild.build({
    entryPoints: [src('scripts/delta-green-combat-hud.mjs')],
    outfile: out('scripts/delta-green-combat-hud.mjs'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    keepNames: true,
    legalComments: 'none',
    sourcemap: 'external',
    metafile: true
  });

  const bundled = new Set(Object.keys(result.metafile.inputs));
  const orphans = fs
    .readdirSync(src('scripts'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => `scripts/${f}`)
    .filter((f) => !bundled.has(f));

  if (orphans.length) {
    throw new Error(
      `These modules are not reachable from scripts/delta-green-combat-hud.mjs and would not ship:\n  ${orphans.join('\n  ')}`
    );
  }
}

async function buildStyles() {
  await esbuild.build({
    entryPoints: [src('styles/delta-green-combat-hud.css')],
    outfile: out('styles/delta-green-combat-hud.css'),
    minify: true,
    legalComments: 'none'
  });
}

function buildLang() {
  for (const file of fs.readdirSync(src('lang'))) {
    if (!file.endsWith('.json')) continue;
    const parsed = JSON.parse(fs.readFileSync(src('lang', file), 'utf8'));
    write(out('lang', file), JSON.stringify(parsed));
  }
}

function buildTemplates() {
  const walk = (dir = '') =>
    fs.readdirSync(src('templates', dir), { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith('.hbs')
        ? [path.join(dir, entry.name)]
        : []
    );

  for (const file of walk()) {
    const minified = fs
      .readFileSync(src('templates', file), 'utf8')
      .replace(/\{\{!--[\s\S]*?--\}\}/g, '')
      .replace(/\{\{![^}]*\}\}/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    try {
      Handlebars.precompile(minified);
    } catch (error) {
      throw new Error(`templates/${file} does not compile after minification: ${error.message}`);
    }

    write(out('templates', file), minified);
  }
}

function verifyManifest() {
  const manifest = JSON.parse(fs.readFileSync(src('module.json'), 'utf8'));
  const declared = [
    ...(manifest.esmodules || []),
    ...(manifest.scripts || []),
    ...(manifest.styles || []).map((s) => (typeof s === 'string' ? s : s.src)),
    ...(manifest.languages || []).map((l) => l.path)
  ];

  const missing = declared.filter((p) => !fs.existsSync(out(p)));
  if (missing.length) {
    throw new Error(`module.json declares paths that the build did not produce:\n  ${missing.join('\n  ')}`);
  }

  const bundle = out(manifest.esmodules[0]);
  if (size(bundle) < 1_000) {
    throw new Error(`${manifest.esmodules[0]} is only ${size(bundle)} bytes - bundle appears incomplete`);
  }
}

function report() {
  const treeSize = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .reduce((sum, e) => sum + (e.isDirectory() ? treeSize(path.join(dir, e.name)) : size(path.join(dir, e.name))), 0);

  const sourceSize =
    treeSize(src('scripts')) + treeSize(src('styles')) + treeSize(src('templates')) + treeSize(src('lang'));
  const mapSize = fs.existsSync(out('scripts/delta-green-combat-hud.mjs.map'))
    ? size(out('scripts/delta-green-combat-hud.mjs.map'))
    : 0;
  const distSize = treeSize(DIST) - mapSize;

  console.log(`  scripts   ${kb(size(out('scripts/delta-green-combat-hud.mjs')))}`);
  console.log(`  styles    ${kb(size(out('styles/delta-green-combat-hud.css')))}`);
  console.log(`  shipped   ${kb(distSize)} from ${kb(sourceSize)} of source (-${Math.round(100 - (100 * distSize) / sourceSize)}%)`);
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });

  await buildScripts();
  await buildStyles();
  buildLang();
  buildTemplates();
  for (const file of VERBATIM) write(out(file), fs.readFileSync(src(file)));

  verifyManifest();
  console.log('Successfully built dist/');
  report();
}

main().catch((error) => {
  console.error(`Build failed: ${error.message}`);
  process.exit(1);
});
