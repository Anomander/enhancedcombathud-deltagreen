/**
 * Static extractor for Argon Core's component contracts.
 *
 * Argon documents its component API only in source, and every rule it imposes
 * fails at render time in a live world rather than at author or test time. This
 * reads the installed module and records the three things that actually bit
 * during the migration:
 *
 *   1. abstract methods a subclass must implement (they only log to console)
 *   2. constructor options and their defaults (e.g. `inActionPanel ?? isWeaponSet`)
 *   3. accessors defined as getter/setter pairs (overriding the getter alone
 *      shadows the setter and throws on assignment)
 *
 * Same pattern as tools/system-schema.mjs: one extractor, used by both the
 * snapshot writer and the drift test, so the two cannot disagree.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function candidateDataRoots() {
  const home = os.homedir();
  return [
    path.join(home, 'Library', 'Application Support', 'FoundryVTT', 'Data'),
    path.join(home, 'AppData', 'Local', 'FoundryVTT', 'Data'),
    path.join(home, '.local', 'share', 'FoundryVTT', 'Data'),
    path.join(home, 'foundrydata', 'Data')
  ];
}

/**
 * Locate an installed Argon Core.
 * @param {string} [explicit] - Overrides discovery. Defaults to $ARGON_PATH.
 * @returns {string|null}
 */
export function resolveArgonPath(explicit = process.env.ARGON_PATH) {
  if (explicit) {
    return fs.existsSync(path.join(explicit, 'module.json')) ? explicit : null;
  }

  for (const root of candidateDataRoots()) {
    const candidate = path.join(root, 'modules', 'enhancedcombathud');
    if (fs.existsSync(path.join(candidate, 'module.json'))) return candidate;
  }

  return null;
}

/** Recursively collect .js files under a directory. */
function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/** Split a source file into `{name, extends, body}` per class declaration. */
function classBodies(source) {
  const matches = [...source.matchAll(/(?:export\s+)?class\s+(\w+)\s+extends\s+([\w.]+)\s*\{/g)];

  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    return { name: match[1], parent: match[2], body: source.slice(start, end) };
  });
}

/**
 * Read Argon Core and return its component contracts.
 * @param {string} argonPath - Absolute path to the installed module.
 * @returns {object} Contracts, safe to serialise and diff.
 */
export function extractArgonContract(argonPath) {
  const manifest = JSON.parse(fs.readFileSync(path.join(argonPath, 'module.json'), 'utf8'));
  const appDir = path.join(argonPath, 'scripts', 'app');

  const classes = {};

  for (const file of jsFiles(appDir)) {
    for (const { name, parent, body } of classBodies(fs.readFileSync(file, 'utf8'))) {
      // Methods whose body announces they are unimplemented.
      const abstractMethods = [...body.matchAll(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{[^{}]*?not implemented/g)]
        .map((m) => m[1])
        .sort();

      // Destructured constructor options, with whether each has a default.
      const ctor = body.match(/constructor\s*\(\s*\{([^}]*)\}/);
      const constructorOptions = ctor
        ? ctor[1]
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
              const [key, fallback] = part.split('=').map((s) => s.trim());
              return { name: key, default: fallback ?? null };
            })
        : [];

      const setters = [...body.matchAll(/^\s*set\s+(\w+)\s*\(/gm)].map((m) => m[1]).sort();
      const getters = [...body.matchAll(/^\s*get\s+(\w+)\s*\(/gm)].map((m) => m[1]).sort();

      classes[name] = {
        parent,
        abstractMethods,
        constructorOptions,
        // Overriding one of these with a getter alone shadows the setter.
        accessorPairs: getters.filter((g) => setters.includes(g)).sort()
      };
    }
  }

  return {
    argon: { id: manifest.id, version: manifest.version },
    // Argon resolves a component's template from its IMMEDIATE parent class name,
    // so components must sit exactly one level below an Argon base class.
    templateResolution: 'Object.getPrototypeOf(this.constructor).name',
    partials: fs
      .readdirSync(path.join(argonPath, 'templates', 'partials'))
      .filter((file) => file.endsWith('.hbs'))
      .map((file) => file.replace(/\.hbs$/, ''))
      .sort(),
    classes
  };
}
