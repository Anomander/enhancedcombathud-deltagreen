/**
 * Target-aware damage automation.
 *
 * `proposeFrom` takes its target as an argument, so the interesting behaviour is
 * reachable headless with no canvas and no Foundry globals (TEST-6). Permission
 * handling is tested through `applyResolution`, which is the only place that
 * writes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { proposeFrom, applyResolution } from '../scripts/automation.mjs';
import { makeAgent, makeNpc, makeWeapon } from './fixtures/dg-actors.mjs';

/** A targeted token, as Foundry hands it over. */
function makeTarget(actor, { name = 'Cultist' } = {}) {
  return { name, actor };
}

function damageOutcome({ total = 8, item = makeWeapon({ armorPiercing: 0 }) } = {}) {
  return { type: 'damage', total, item, actor: null, token: null };
}

function lethalityOutcome({ lethal = true, nonLethalDamage = null, item = makeWeapon() } = {}) {
  return { type: 'lethality', total: 15, lethal, nonLethalDamage, item, actor: null, token: null };
}

beforeEach(() => {
  globalThis.game = { user: { isGM: false, targets: new Set() } };
  globalThis.ui = { notifications: { warn: vi.fn(), info: vi.fn() } };
});

describe('Only damaging rolls engage automation', () => {
  it.each(['skill', 'stat', 'sanity', 'weapon'])('stands down for a %s roll', (type) => {
    const target = makeTarget(makeNpc());
    expect(proposeFrom({ type, total: 40, item: null }, target)).toBeNull();
  });

  it('engages for a damage roll', () => {
    const proposal = proposeFrom(damageOutcome(), makeTarget(makeNpc()));
    expect(proposal).not.toBeNull();
  });
});

describe('Resolving against a target', () => {
  it('reads the target\'s derived armour rather than recomputing it', () => {
    const npc = makeNpc();
    npc.system.health.value = 12;
    npc.system.health.protection = 3;

    const { resolution } = proposeFrom(damageOutcome({ total: 8 }), makeTarget(npc));

    expect(resolution.armor).toBe(3);
    expect(resolution.applied).toBe(5);
    expect(resolution.hpAfter).toBe(7);
  });

  it('takes armour piercing from the weapon', () => {
    const npc = makeNpc();
    npc.system.health.value = 12;
    npc.system.health.protection = 3;

    const outcome = damageOutcome({ total: 8, item: makeWeapon({ armorPiercing: 2 }) });
    const { resolution } = proposeFrom(outcome, makeTarget(npc));

    expect(resolution.armorApplied).toBe(1);
    expect(resolution.applied).toBe(7);
  });

  it('refuses a target with no readable hit points', () => {
    // A vehicle-shaped actor with no health block at all.
    const target = makeTarget({ type: 'npc', name: 'Wreck', system: {} });
    expect(proposeFrom(damageOutcome(), target)).toBeNull();
  });

  it('refuses when nothing is targeted', () => {
    expect(proposeFrom(damageOutcome(), null)).toBeNull();
  });
});

describe('Lethality', () => {
  it('kills outright, ignoring armour', () => {
    const npc = makeNpc();
    npc.system.health.value = 14;
    npc.system.health.protection = 6;

    const { resolution } = proposeFrom(lethalityOutcome({ lethal: true }), makeTarget(npc));

    expect(resolution.lethalKill).toBe(true);
    expect(resolution.hpAfter).toBe(0);
  });

  it('uses the system\'s own fallback total when the Lethality roll fails', () => {
    const npc = makeNpc();
    npc.system.health.value = 14;
    npc.system.health.protection = 0;

    const outcome = lethalityOutcome({ lethal: false, nonLethalDamage: 9 });
    const { resolution } = proposeFrom(outcome, makeTarget(npc));

    expect(resolution.lethalKill).toBe(false);
    expect(resolution.applied).toBe(9);
  });
});

describe('Permission — rung B', () => {
  it('writes when the current user owns the target', async () => {
    const actor = makeAgent();
    actor.isOwner = true;
    actor.update = vi.fn(async () => {});

    const applied = await applyResolution(actor, { hpAfter: 4, applied: 3 });

    expect(applied).toBe(true);
    expect(actor.update).toHaveBeenCalledWith({ 'system.health.value': 4 });
  });

  it('refuses out loud, and writes nothing, when the user does not own the target', async () => {
    const actor = makeNpc();
    actor.isOwner = false;
    actor.update = vi.fn(async () => {});

    const applied = await applyResolution(actor, { hpAfter: 4, applied: 3 });

    expect(applied).toBe(false);
    expect(actor.update).not.toHaveBeenCalled();
    expect(globalThis.ui.notifications.warn).toHaveBeenCalled();
  });
});
