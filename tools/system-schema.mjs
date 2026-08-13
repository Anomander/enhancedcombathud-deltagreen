/**
 * Static extractor for the Delta Green system's data model.
 *
 * The system's schema files call `foundry.data.fields.*` at module scope, so they
 * cannot be imported in Node. Instead we read them as text and pull out the facts
 * this module depends on. Both `tools/sync-system-schema.mjs` (which writes the
 * committed snapshot) and `tests/schema-drift.test.mjs` (which detects drift)
 * use this single extractor, so the two can never disagree about how to read it.
 *
 * Satisfies TEST-1 / TEST-2: fixtures and assertions derive from the system's own
 * schema files rather than from hand-written shapes.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** Candidate Foundry data directories, in order of preference. */
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
 * Locate an installed `deltagreen` system.
 * @param {string} [explicit] - Overrides discovery. Defaults to $DG_SYSTEM_PATH.
 * @returns {string|null} Absolute path to the system root, or null if not installed.
 */
export function resolveSystemPath(explicit = process.env.DG_SYSTEM_PATH) {
  if (explicit) {
    return fs.existsSync(path.join(explicit, 'system.json')) ? explicit : null;
  }

  for (const root of candidateDataRoots()) {
    const candidate = path.join(root, 'systems', 'deltagreen');
    if (fs.existsSync(path.join(candidate, 'system.json'))) return candidate;
  }

  return null;
}

/** Read a file from the system tree, returning '' when absent. */
function readSystemFile(systemPath, relative) {
  const full = path.join(systemPath, relative);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

/** Extract the keys declared via `<key>: skillField(` in a schema file. */
function extractSkillKeys(source) {
  return [...source.matchAll(/^\s+(\w+): skillField\(/gm)].map((m) => m[1]).sort();
}

/**
 * Extract the field names of a named `SchemaField` block.
 * Scans from `<name>: new SchemaField({` to the matching close brace.
 */
function extractSchemaFieldKeys(source, name) {
  const opener = new RegExp(`${name}:\\s*new SchemaField\\(\\{`);
  const start = source.search(opener);
  if (start === -1) return [];

  const from = source.indexOf('{', source.indexOf('SchemaField', start));
  let depth = 0;
  let end = from;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = source.slice(from + 1, end);
  // Only top-level keys: strip nested braces before matching.
  let flattened = body;
  let previous;
  do {
    previous = flattened;
    flattened = flattened.replace(/\{[^{}]*\}/g, '');
  } while (flattened !== previous);

  return [...flattened.matchAll(/(?:^|,)\s*(\w+):/g)].map((m) => m[1]).sort();
}

/**
 * Read the Delta Green system and return the facts this module relies on.
 * @param {string} systemPath - Absolute path to the installed system.
 * @returns {object} Schema facts, safe to serialise and diff.
 */
export function extractSystemSchema(systemPath) {
  const manifest = JSON.parse(readSystemFile(systemPath, 'system.json'));

  const humanSkills = readSystemFile(systemPath, 'module/data/actor/base/human-skills.js');
  const unnaturalSkills = readSystemFile(systemPath, 'module/data/actor/base/unnatural-skills.js');
  const general = readSystemFile(systemPath, 'module/data/actor/base/general.js');
  const baseActor = readSystemFile(systemPath, 'module/data/actor/base/base-actor.js');
  const agent = readSystemFile(systemPath, 'module/data/actor/agent.js');
  const npc = readSystemFile(systemPath, 'module/data/actor/npc.js');
  const unnatural = readSystemFile(systemPath, 'module/data/actor/unnatural.js');
  const weapon = readSystemFile(systemPath, 'module/data/item/weapon.js');
  const armor = readSystemFile(systemPath, 'module/data/item/armor.js');

  return {
    system: {
      id: manifest.id,
      version: manifest.version
    },
    actorTypes: Object.keys(manifest.documentTypes?.Actor ?? {}).sort(),
    itemTypes: Object.keys(manifest.documentTypes?.Item ?? {}).sort(),
    skills: {
      human: extractSkillKeys(humanSkills),
      unnatural: extractSkillKeys(unnaturalSkills)
    },
    // The shape of a single skill entry, e.g. ["failure", "label", "proficiency"].
    skillEntryFields: [...general.matchAll(/export function skillField[\s\S]*?\n\}/g)]
      .flatMap((block) => [...block[0].matchAll(/^\s{4}(\w+):\s*new \w+Field/gm)].map((m) => m[1]))
      .sort(),
    // The shape of a resource, e.g. ["max", "min", "value"].
    resourceFields: [...general.matchAll(/export function resourceField[\s\S]*?\n\}/g)]
      .flatMap((block) => [...block[0].matchAll(/(\w+):\s*new NumberField/g)].map((m) => m[1]))
      .sort(),
    actors: {
      // Which resource fields each actor type carries, and its sanity shape.
      base: {
        resources: ['health', 'wp'].filter((key) => new RegExp(`${key}:\\s*\\w*[rR]esourceField`).test(baseActor))
      },
      agent: {
        sanity: extractSchemaFieldKeys(agent, 'sanity'),
        hasSkills: /HumanSkillsActorData\.defineSchema\(\)/.test(agent)
      },
      npc: {
        sanity: extractSchemaFieldKeys(npc, 'sanity'),
        hasSkills: /HumanSkillsActorData\.defineSchema\(\)/.test(npc)
      },
      unnatural: {
        sanity: extractSchemaFieldKeys(unnatural, 'sanity'),
        hasSkills: /UnnaturalSkillsActorData\.defineSchema\(\)/.test(unnatural)
      }
    },
    // Armour is derived by the system onto `system.health.protection` for every
    // actor type. The module reads that field rather than recomputing it.
    derivedArmorPath: /this\.health\.protection\s*=\s*computeEquippedArmorProtection/.test(agent)
      ? 'system.health.protection'
      : null,
    items: {
      weapon: [...weapon.matchAll(/^\s{6}(\w+):\s*new \w+Field/gm)].map((m) => m[1]).sort(),
      armor: [...armor.matchAll(/^\s{6}(\w+):\s*new \w+Field/gm)].map((m) => m[1]).sort()
    }
  };
}
