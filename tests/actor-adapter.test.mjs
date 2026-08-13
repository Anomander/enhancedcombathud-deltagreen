/**
 * Actor adapter, tested against fixtures derived from the real system schema.
 *
 * The previous version of this suite asserted the adapter agreed with mocks that
 * were invented to match it (`system.san`, `system.breakingPoint`, `system.armor`,
 * `skills.firearms.value`). None of those paths exist in deltagreen 2.0.1, so the
 * suite was green while Sanity, Breaking Point and Armor were constants on every
 * real Agent. See TEST-1.
 */

import { describe, it, expect } from 'vitest';
import { extractVitals, extractSkills, extractWeapons, getActorItems } from '../scripts/actor-adapter.mjs';
import { makeAgent, makeNpc, makeUnnatural, makeVehicle, makeWeapon, makeArmor, makeGear, SCHEMA } from './fixtures/dg-actors.mjs';

describe('Vitals — Agent', () => {
  it('reads HP from system.health', () => {
    const vitals = extractVitals(makeAgent({ hp: [9, 11] }));
    expect(vitals.hp).toMatchObject({ value: 9, max: 11 });
    expect(vitals.hp.percentage).toBe(82);
  });

  it('reads WP from system.wp', () => {
    const vitals = extractVitals(makeAgent({ wp: [7, 12] }));
    expect(vitals.wp).toMatchObject({ value: 7, max: 12 });
  });

  it('reads Sanity from system.sanity, not system.san', () => {
    const vitals = extractVitals(makeAgent({ sanity: 44, sanityMax: 99 }));
    expect(vitals.san).toMatchObject({ value: 44, max: 99 });
  });

  it('reads Breaking Point from system.sanity.currentBreakingPoint', () => {
    const vitals = extractVitals(makeAgent({ breakingPoint: 38 }));
    expect(vitals.breakingPoint).toBe(38);
  });

  it('surfaces the system-derived breaking point flag', () => {
    expect(extractVitals(makeAgent({ sanity: 44, breakingPoint: 38 })).breakingPointHit).toBe(false);
    expect(extractVitals(makeAgent({ sanity: 30, breakingPoint: 38 })).breakingPointHit).toBe(true);
  });

  it('reads armour from the system-derived system.health.protection', () => {
    const agent = makeAgent({ items: [makeArmor({ protection: 3 })] });
    expect(extractVitals(agent).armor).toBe(3);
  });

  it('sums only equipped armour', () => {
    const agent = makeAgent({
      items: [
        makeArmor({ id: 'a1', protection: 3, equipped: true }),
        makeArmor({ id: 'a2', protection: 5, equipped: false })
      ]
    });
    expect(extractVitals(agent).armor).toBe(3);
  });

  it('reports every stat as unavailable when there is no actor', () => {
    // No actor means no HP — reporting 0 would be a fabricated value (SYS-5).
    const vitals = extractVitals(null);
    for (const stat of ['hp', 'wp', 'san']) {
      expect(vitals[stat]).toMatchObject({ value: null, available: false });
    }
    expect(vitals.breakingPoint).toBeNull();
  });
});

describe('Vitals — actor types other than Agent', () => {
  it('reads sanity and breaking point for an NPC', () => {
    const vitals = extractVitals(makeNpc({ sanity: 50, breakingPoint: 40 }));
    expect(vitals.san).toMatchObject({ value: 50, available: true });
    expect(vitals.breakingPoint).toBe(40);
  });

  it('omits sanity for an Unnatural rather than substituting a default', () => {
    // system.sanity on `unnatural` holds only {notes, failedLoss, successLoss}.
    const vitals = extractVitals(makeUnnatural());
    expect(vitals.san.available).toBe(false);
    expect(vitals.san.value).toBeNull();
    expect(vitals.breakingPoint).toBeNull();
  });

  it('still reads HP and WP for an Unnatural', () => {
    const vitals = extractVitals(makeUnnatural({ hp: [30, 30], wp: [20, 20] }));
    expect(vitals.hp).toMatchObject({ value: 30, max: 30 });
    expect(vitals.wp).toMatchObject({ value: 20, max: 20 });
  });

  it('omits sanity, WP and skills for a Vehicle', () => {
    const vitals = extractVitals(makeVehicle({ hp: [15, 15] }));
    expect(vitals.hp).toMatchObject({ value: 15, max: 15 });
    expect(vitals.san.available).toBe(false);
    expect(vitals.wp.available).toBe(false);
  });
});

describe('Skills', () => {
  it('returns every skill the system defines, not a hardcoded subset', () => {
    const skills = extractSkills(makeAgent());
    expect(skills).toHaveLength(SCHEMA.skills.human.length);
    expect(skills.map((s) => s.key).sort()).toEqual(SCHEMA.skills.human);
  });

  it('reads proficiency, not value', () => {
    const skills = extractSkills(makeAgent({ proficiencies: { firearms: 60 } }));
    expect(skills.find((s) => s.key === 'firearms').value).toBe(60);
  });

  it('takes labels from the actor rather than a duplicated table', () => {
    const skills = extractSkills(makeAgent());
    expect(skills.find((s) => s.key === 'humint').label).toBe('Humint');
  });

  it('includes skills the old hardcoded list omitted', () => {
    const keys = extractSkills(makeAgent()).map((s) => s.key);
    for (const key of ['persuade', 'ride', 'sigint', 'surgery', 'survival', 'forensics', 'law']) {
      expect(keys).toContain(key);
    }
  });

  it('does not invent skills the system has no key for', () => {
    const keys = extractSkills(makeAgent()).map((s) => s.key);
    expect(keys).not.toContain('military_science');
  });

  it('includes typed skills defined on the actor', () => {
    const agent = makeAgent();
    agent.system.typedSkills = {
      tsk1: { label: 'Art', group: 'Painting', proficiency: 40, failure: false }
    };
    const typed = extractSkills(agent).find((s) => s.key === 'tsk1');
    expect(typed).toMatchObject({ value: 40, typed: true });
    expect(typed.label).toContain('Art');
  });

  it('reads the unnatural skill set for an Unnatural actor', () => {
    const skills = extractSkills(makeUnnatural());
    expect(skills.find((s) => s.key === 'alertness').value).toBe(50);
  });

  it('returns nothing for an actor type with no skills', () => {
    expect(extractSkills(makeVehicle())).toEqual([]);
  });
});

describe('Weapons', () => {
  it('extracts weapon items from a Foundry EmbeddedCollection', () => {
    const agent = makeAgent({ items: [makeWeapon({ name: 'M4 Carbine' })] });
    const weapons = extractWeapons(agent);
    expect(weapons).toHaveLength(1);
    expect(weapons[0]).toMatchObject({ name: 'M4 Carbine', skillKey: 'firearms', damage: '1D12' });
  });

  it('ignores armour and gear', () => {
    const agent = makeAgent({ items: [makeWeapon(), makeArmor(), makeGear()] });
    expect(extractWeapons(agent)).toHaveLength(1);
  });

  it('reads ammo as the string the schema declares', () => {
    const agent = makeAgent({ items: [makeWeapon({ ammo: '30' })] });
    expect(extractWeapons(agent)[0].ammo).toBe('30');
  });

  it('carries lethality through for lethal weapons', () => {
    const agent = makeAgent({ items: [makeWeapon({ lethality: 20, isLethal: true })] });
    expect(extractWeapons(agent)[0]).toMatchObject({ lethality: 20, isLethal: true });
  });

  it('reports no weapons rather than fabricating an unarmed strike', () => {
    // The HUD decides how to present an empty loadout; the adapter reports facts.
    expect(extractWeapons(makeAgent({ items: [] }))).toEqual([]);
  });
});

describe('getActorItems', () => {
  it('unwraps an EmbeddedCollection', () => {
    const agent = makeAgent({ items: [makeWeapon(), makeArmor()] });
    expect(getActorItems(agent)).toHaveLength(2);
  });

  it('accepts a plain array', () => {
    expect(getActorItems({ items: [makeWeapon()] })).toHaveLength(1);
  });

  it('returns an empty array for a null actor', () => {
    expect(getActorItems(null)).toEqual([]);
  });
});
