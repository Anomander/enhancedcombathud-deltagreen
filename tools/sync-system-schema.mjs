#!/usr/bin/env node
/**
 * Regenerate the committed Delta Green schema snapshot from an installed system.
 *
 *   npm run sync:schema
 *   DG_SYSTEM_PATH=/path/to/systems/deltagreen npm run sync:schema
 *
 * The snapshot at tests/fixtures/system-schema.json is what CI validates fixtures
 * against, so CI stays deterministic without a Foundry install. When the system IS
 * installed, tests/schema-drift.test.mjs re-extracts and fails if the snapshot has
 * drifted — that is the signal to re-run this script and review the diff.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSystemPath, extractSystemSchema } from './system-schema.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(here, '..', 'tests', 'fixtures', 'system-schema.json');

const systemPath = resolveSystemPath();

if (!systemPath) {
  console.error(
    'Could not find an installed `deltagreen` system.\n' +
      'Set DG_SYSTEM_PATH to its directory, e.g.\n' +
      '  DG_SYSTEM_PATH="$HOME/Library/Application Support/FoundryVTT/Data/systems/deltagreen" npm run sync:schema'
  );
  process.exit(1);
}

const schema = extractSystemSchema(systemPath);
const previous = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : null;

fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
fs.writeFileSync(snapshotPath, `${JSON.stringify(schema, null, 2)}\n`);

console.log(`Read system from: ${systemPath}`);
console.log(`deltagreen ${schema.system.version} — ${schema.skills.human.length} human skills, ${schema.actorTypes.length} actor types`);

if (previous && previous.system.version !== schema.system.version) {
  console.log(`\nSystem version changed: ${previous.system.version} -> ${schema.system.version}`);
  console.log('Review the snapshot diff before committing (PROC-4).');
}

console.log(`\nWrote ${path.relative(process.cwd(), snapshotPath)}`);
