/**
 * Attack resolution arithmetic.
 *
 * This is the one place the module encodes a Delta Green rule rather than
 * reading it (see the header of scripts/resolution.mjs), so it is tested
 * closely — including the boundaries where it must refuse rather than guess.
 */

import { describe, it, expect } from 'vitest';
import { resolveDamage } from '../scripts/resolution.mjs';

describe('Armour', () => {
  it('subtracts armour from rolled damage', () => {
    const result = resolveDamage({ damage: 8, hp: 12, armor: 3 });

    expect(result.damageAfterArmor).toBe(5);
    expect(result.applied).toBe(5);
    expect(result.hpAfter).toBe(7);
  });

  it('lets armour piercing reduce the armour for that attack', () => {
    const result = resolveDamage({ damage: 8, hp: 12, armor: 3, armorPiercing: 2 });

    expect(result.armorApplied).toBe(1);
    expect(result.applied).toBe(7);
  });

  it('never turns excess armour piercing into bonus damage', () => {
    const result = resolveDamage({ damage: 8, hp: 12, armor: 2, armorPiercing: 5 });

    expect(result.armorApplied).toBe(0);
    expect(result.applied).toBe(8);
  });

  it('reports a hit stopped entirely by armour', () => {
    const result = resolveDamage({ damage: 3, hp: 12, armor: 5 });

    expect(result.blocked).toBe(true);
    expect(result.applied).toBe(0);
    expect(result.hpAfter).toBe(12);
  });

  it('does not call a zero-damage roll "blocked"', () => {
    expect(resolveDamage({ damage: 0, hp: 12, armor: 5 }).blocked).toBe(false);
  });
});

describe('Hit points', () => {
  it('floors at zero, because the schema forbids negative', () => {
    // general.js resourceField: value is NumberField({ min: 0 }).
    const result = resolveDamage({ damage: 20, hp: 5 });

    expect(result.hpAfter).toBe(0);
    expect(result.applied).toBe(5);
  });

  it('reports damage beyond the target rather than dropping it', () => {
    const result = resolveDamage({ damage: 20, hp: 5 });

    expect(result.damageAfterArmor).toBe(20);
    expect(result.overkill).toBe(15);
  });
});

describe('Lethality', () => {
  it('kills outright, ignoring armour', () => {
    const result = resolveDamage({ damage: 0, hp: 14, armor: 6, lethalKill: true });

    expect(result.lethalKill).toBe(true);
    expect(result.armorApplied).toBe(0);
    expect(result.hpAfter).toBe(0);
    expect(result.applied).toBe(14);
  });

  it('applies armour to the fallback damage of a failed Lethality roll', () => {
    // The tens+ones total is computed by DGLethalityRoll and passed in; armour
    // applies to it as to any other damage.
    const result = resolveDamage({ damage: 11, hp: 14, armor: 3, lethalKill: false });

    expect(result.applied).toBe(8);
    expect(result.hpAfter).toBe(6);
  });
});

describe('Missing input is refused, never defaulted', () => {
  it('refuses when hit points cannot be read', () => {
    const result = resolveDamage({ damage: 8, hp: undefined });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('DG_HUD.Notifications.TargetHpUnreadable');
  });

  // Number(null) is 0, Number('') is 0. Coercing absence into a confident zero
  // is exactly the failure SYS-5 forbids, so each is rejected explicitly.
  it.each([null, '', []])('refuses hit points given as %p rather than reading them as 0', (hp) => {
    expect(resolveDamage({ damage: 8, hp }).ok).toBe(false);
  });

  it('refuses when damage cannot be read', () => {
    const result = resolveDamage({ damage: null, hp: 10 });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('DG_HUD.Notifications.DamageUnreadable');
  });

  it('still resolves a kill when there is no damage number to read', () => {
    // A successful Lethality roll needs no damage total.
    expect(resolveDamage({ damage: null, hp: 10, lethalKill: true }).ok).toBe(true);
  });

  it('treats absent armour as no armour, which is what absent armour means', () => {
    const result = resolveDamage({ damage: 8, hp: 12 });
    expect(result.armorApplied).toBe(0);
    expect(result.applied).toBe(8);
  });
});
