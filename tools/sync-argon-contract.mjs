#!/usr/bin/env node
/**
 * Regenerate the committed Argon contract snapshot from an installed Argon Core.
 *
 *   npm run sync:argon
 *   ARGON_PATH=/path/to/modules/enhancedcombathud npm run sync:argon
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveArgonPath, extractArgonContract } from './argon-contract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const snapshotPath = path.join(here, '..', 'tests', 'fixtures', 'argon-contract.json');

const argonPath = resolveArgonPath();
if (!argonPath) {
  console.error('Could not find an installed `enhancedcombathud` module. Set ARGON_PATH.');
  process.exit(1);
}

const contract = extractArgonContract(argonPath);
fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
fs.writeFileSync(snapshotPath, `${JSON.stringify(contract, null, 2)}\n`);

console.log(`Read Argon from: ${argonPath}`);
console.log(`Argon ${contract.argon.version} — ${Object.keys(contract.classes).length} classes, ${contract.partials.length} partials`);
console.log(`Wrote ${path.relative(process.cwd(), snapshotPath)}`);
