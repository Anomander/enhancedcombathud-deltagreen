/**
 * Weapon set arithmetic.
 *
 * Every case here corresponds to something a player can do to a set — assign,
 * clear, switch, delete the weapon, drop in something that was never theirs —
 * because the defects this covers were all reachable that way and none of them
 * were reachable by any test, the logic having lived inside an Argon component
 * (TEST-6).
 */

import { describe, it, expect } from 'vitest';
import {
  SET_SLOTS,
  planLoadout,
  planSeedWrite,
  pruneWeaponSets,
  seedWeaponSets
} from '../scripts/weapon-sets.mjs';
import { makeWeapon, makeArmor, makeGear } from './fixtures/dg-actors.mjs';

/** Argon's own empty layout — three sets of two slots. See weaponSets.js. */
function emptySets() {
  return {
    1: { primary: null, secondary: null },
    2: { primary: null, secondary: null },
    3: { primary: null, secondary: null }
  };
}

const pistol = makeWeapon({ id: 'w-pistol', name: 'M1911', equipped: true });
const rifle = makeWeapon({ id: 'w-rifle', name: 'M4 Carbine', equipped: false });
const knife = makeWeapon({ id: 'w-knife', name: 'Combat Knife', equipped: true });

describe('SET_SLOTS', () => {
  it('names the two slots Argon renders', () => {
    expect([...SET_SLOTS]).toEqual(['primary', 'secondary']);
  });
});

describe('seedWeaponSets', () => {
  it('fills set 1 from the equipped weapons', () => {
    const sets = seedWeaponSets(emptySets(), [pistol, rifle, knife]);

    expect(sets['1']).toEqual({ primary: pistol.uuid, secondary: knife.uuid });
  });

  it('names weapons by uuid, because a set is stored as uuids', () => {
    const sets = seedWeaponSets(emptySets(), [pistol]);

    expect(sets['1'].primary).toBe('Actor.actor-agent.Item.w-pistol');
  });

  it('seeds nothing from an unequipped loadout', () => {
    const sets = seedWeaponSets(emptySets(), [rifle]);

    expect(sets['1']).toEqual({ primary: null, secondary: null });
  });

  it('ignores armour and gear', () => {
    const sets = seedWeaponSets(emptySets(), [makeArmor(), makeGear(), pistol]);

    expect(sets['1']).toEqual({ primary: pistol.uuid, secondary: null });
  });

  it('takes only the first two — a set holds two weapons', () => {
    const third = makeWeapon({ id: 'w-shotgun', equipped: true });
    const sets = seedWeaponSets(emptySets(), [pistol, knife, third]);

    expect(sets['1']).toEqual({ primary: pistol.uuid, secondary: knife.uuid });
  });

  it('leaves the other sets alone', () => {
    const sets = seedWeaponSets(emptySets(), [pistol, knife]);

    expect(sets['2']).toEqual({ primary: null, secondary: null });
    expect(sets['3']).toEqual({ primary: null, secondary: null });
  });

  it('does not mutate the layout Argon handed it', () => {
    const defaults = emptySets();
    seedWeaponSets(defaults, [pistol]);

    expect(defaults['1']).toEqual({ primary: null, secondary: null });
  });

  it('survives an actor carrying nothing', () => {
    expect(seedWeaponSets(emptySets(), [])['1']).toEqual({ primary: null, secondary: null });
  });

  it('survives a layout without a set 1', () => {
    expect(() => seedWeaponSets({}, [pistol])).not.toThrow();
  });
});

describe('planSeedWrite', () => {
  const seeded = { ...emptySets(), 1: { primary: pistol.uuid, secondary: knife.uuid } };

  it('writes the seed for an actor with no saved sets', () => {
    expect(planSeedWrite(undefined, seeded)['1']).toEqual({
      primary: pistol.uuid,
      secondary: knife.uuid
    });
  });

  it('writes nothing when there is nothing to seed from', () => {
    expect(planSeedWrite(undefined, emptySets())).toBeNull();
  });

  it('writes nothing once set 1 holds an assignment', () => {
    expect(planSeedWrite({ 1: { primary: rifle.uuid } }, seeded)).toBeNull();
  });

  it('respects a set 1 the player deliberately emptied', () => {
    // Clearing a slot stores an explicit null — the key being there is the
    // decision, and re-seeding over it would undo it on the next render.
    expect(planSeedWrite({ 1: { primary: null, secondary: null } }, seeded)).toBeNull();
  });

  it('still seeds set 1 for an actor who only ever configured set 2', () => {
    const write = planSeedWrite({ 2: { primary: rifle.uuid } }, seeded);

    expect(write['1']).toEqual({ primary: pistol.uuid, secondary: knife.uuid });
    expect(write['2']).toEqual({ primary: rifle.uuid });
  });
});

describe('pruneWeaponSets', () => {
  it('forgets a slot whose weapon was deleted', () => {
    const saved = { 1: { primary: pistol.uuid, secondary: 'Actor.actor-agent.Item.w-gone' } };
    const { sets, removed } = pruneWeaponSets(saved, [pistol]);

    expect(sets['1']).toEqual({ primary: pistol.uuid, secondary: null });
    expect(removed).toEqual([
      { set: '1', slot: 'secondary', uuid: 'Actor.actor-agent.Item.w-gone' }
    ]);
  });

  it('forgets a weapon dragged in off another Agent’s sheet', () => {
    const foreign = makeWeapon({ id: 'w-pistol', uuid: 'Actor.other.Item.w-pistol' });
    const { sets, removed } = pruneWeaponSets({ 2: { primary: foreign.uuid } }, [pistol]);

    expect(sets['2'].primary).toBeNull();
    expect(removed).toHaveLength(1);
  });

  it('forgets gear that is not a weapon at all', () => {
    const gear = makeGear();
    gear.uuid = 'Actor.actor-agent.Item.gear-1';
    const { removed } = pruneWeaponSets({ 1: { primary: gear.uuid } }, [pistol, gear]);

    expect(removed).toEqual([{ set: '1', slot: 'primary', uuid: gear.uuid }]);
  });

  it('reports nothing to do for sets that are all carried weapons', () => {
    const saved = { 1: { primary: pistol.uuid, secondary: null }, 2: { primary: rifle.uuid } };
    const { removed } = pruneWeaponSets(saved, [pistol, rifle]);

    expect(removed).toEqual([]);
  });

  it('treats an empty slot as nothing to prune', () => {
    const { removed } = pruneWeaponSets(emptySets(), []);

    expect(removed).toEqual([]);
  });

  it('does not mutate the saved sets', () => {
    const saved = { 1: { primary: 'Actor.actor-agent.Item.w-gone', secondary: null } };
    pruneWeaponSets(saved, [pistol]);

    expect(saved['1'].primary).toBe('Actor.actor-agent.Item.w-gone');
  });

  it('prunes across every set, not only the active one', () => {
    const dead = 'Actor.actor-agent.Item.w-gone';
    const { removed } = pruneWeaponSets({ 1: { primary: dead }, 3: { secondary: dead } }, []);

    expect(removed).toHaveLength(2);
  });
});

describe('planLoadout', () => {
  /** Argon resolves slots to documents before handing them over. */
  const items = () => [
    makeWeapon({ id: 'w-pistol', equipped: true }),
    makeWeapon({ id: 'w-rifle', equipped: false }),
    makeArmor()
  ];

  it('equips the set’s weapons and unequips the rest', () => {
    const carried = items();
    const { updates, configured } = planLoadout(carried, [carried[1], null]);

    expect(configured).toBe(true);
    expect(updates).toEqual([
      { _id: 'w-pistol', 'system.equipped': false },
      { _id: 'w-rifle', 'system.equipped': true }
    ]);
  });

  it('emits nothing for a set that is already equipped', () => {
    const carried = items();

    expect(planLoadout(carried, [carried[0], null]).updates).toEqual([]);
  });

  it('accepts raw uuids as readily as documents', () => {
    const carried = items();

    expect(planLoadout(carried, ['Actor.actor-agent.Item.w-rifle'])).toEqual(
      planLoadout(carried, [carried[1]])
    );
  });

  it('never touches armour', () => {
    const carried = items();
    const ids = planLoadout(carried, [carried[1]]).updates.map((update) => update._id);

    expect(ids).not.toContain('armor-1');
  });

  it('leaves the loadout alone for a set nobody configured', () => {
    const carried = items();
    const { updates, configured } = planLoadout(carried, [null, null]);

    // Reading an empty set as "equip none of them" strips the Agent's weapons
    // and reads as the HUD losing them (UX-1).
    expect(configured).toBe(false);
    expect(updates).toEqual([]);
  });

  it('leaves the loadout alone when the set’s weapon has been deleted', () => {
    const carried = items();

    // Argon resolves a dangling uuid to null before we ever see it.
    expect(planLoadout(carried, [null, null]).configured).toBe(false);
  });

  it('leaves the loadout alone for a set naming another Agent’s weapon', () => {
    const carried = items();
    const foreign = makeWeapon({ id: 'w-rifle', uuid: 'Actor.other.Item.w-rifle' });

    // Same id, different owner: matching on id alone would equip the wrong item,
    // and treating it as selected-but-absent would blank the Attacks panel.
    expect(planLoadout(carried, [foreign]).configured).toBe(false);
  });

  it('ignores a non-weapon slot but honours the weapon beside it', () => {
    const carried = items();
    const { updates, configured } = planLoadout(carried, [carried[2], carried[1]]);

    expect(configured).toBe(true);
    expect(updates).toContainEqual({ _id: 'w-rifle', 'system.equipped': true });
  });

  it('equips both slots of a two-weapon set', () => {
    const carried = items();
    const { updates } = planLoadout(carried, [carried[0], carried[1]]);

    expect(updates).toEqual([{ _id: 'w-rifle', 'system.equipped': true }]);
  });

  it('survives an actor with no items', () => {
    expect(planLoadout([], [null, null])).toEqual({ updates: [], configured: false });
  });
});
