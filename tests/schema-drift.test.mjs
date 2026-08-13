/**
 * Schema drift guard (TEST-2).
 *
 * The committed snapshot at tests/fixtures/system-schema.json is what fixtures and
 * CI are built on. When a real Delta Green system is installed, this suite
 * re-extracts the schema and fails if the snapshot no longer matches it — the
 * signal to run `npm run sync:schema` and review what the system changed.
 *
 * Without an installed system (CI), the extraction checks are skipped, but the
 * invariants the module depends on are still asserted against the snapshot.
 */

import { describe, it, expect } from 'vitest';
import { resolveSystemPath, extractSystemSchema } from '../tools/system-schema.mjs';
import { SCHEMA } from './fixtures/dg-actors.mjs';

const systemPath = resolveSystemPath();

describe('Snapshot invariants the module depends on', () => {
  it('records the skill entry shape the adapter reads', () => {
    expect(SCHEMA.skillEntryFields).toContain('proficiency');
    expect(SCHEMA.skillEntryFields).toContain('label');
  });

  it('records resources as {min,value,max}', () => {
    expect(SCHEMA.resourceFields).toEqual(['max', 'min', 'value']);
  });

  it('has no `skill` or `equipment` item type', () => {
    expect(SCHEMA.itemTypes).not.toContain('skill');
    expect(SCHEMA.itemTypes).not.toContain('equipment');
    expect(SCHEMA.itemTypes).toContain('gear');
    expect(SCHEMA.itemTypes).toContain('weapon');
    expect(SCHEMA.itemTypes).toContain('armor');
  });

  it('derives armour onto system.health.protection rather than an actor field', () => {
    expect(SCHEMA.derivedArmorPath).toBe('system.health.protection');
  });

  it('gives agent and npc a numeric sanity, and unnatural only loss formulas', () => {
    expect(SCHEMA.actors.agent.sanity).toEqual(expect.arrayContaining(['value', 'max', 'currentBreakingPoint']));
    expect(SCHEMA.actors.npc.sanity).toEqual(expect.arrayContaining(['value', 'max', 'currentBreakingPoint']));

    expect(SCHEMA.actors.unnatural.sanity).not.toContain('value');
    expect(SCHEMA.actors.unnatural.sanity).not.toContain('max');
    expect(SCHEMA.actors.unnatural.sanity).toEqual(expect.arrayContaining(['failedLoss', 'successLoss']));
  });

  it('exposes weapon fields the HUD renders', () => {
    for (const field of ['skill', 'damage', 'lethality', 'isLethal', 'ammo', 'equipped', 'range']) {
      expect(SCHEMA.items.weapon).toContain(field);
    }
  });
});

describe.skipIf(!systemPath)('Installed system matches the committed snapshot', () => {
  it('has not drifted — run `npm run sync:schema` if this fails', () => {
    const live = extractSystemSchema(systemPath);
    expect(live).toEqual(SCHEMA);
  });
});

if (!systemPath) {
  console.warn(
    '[schema-drift] No deltagreen system installed — drift checks skipped.\n' +
      '              Set DG_SYSTEM_PATH to enable them locally.'
  );
}
