/**
 * Offering the damage roll after a hit.
 *
 * The decision of *whether* to offer, and *what* to offer, is pure and tested
 * here. The prompt itself is a Foundry dialog and is verified in a live world.
 */

import { describe, it, expect } from 'vitest';
import { shouldOfferDamage, weaponDamageOptions } from '../scripts/damage-prompt.mjs';
import { makeWeapon } from './fixtures/dg-actors.mjs';

function hit(item, overrides = {}) {
  return { type: 'weapon', success: true, item, actor: null, token: null, ...overrides };
}

describe('What a weapon can follow up with', () => {
  it('offers damage when the weapon has a damage formula', () => {
    expect(weaponDamageOptions(makeWeapon({ damage: '1D10', lethality: 0 }))).toEqual({
      damage: true,
      lethality: false
    });
  });

  it('offers lethality when the weapon has a rating', () => {
    expect(weaponDamageOptions(makeWeapon({ damage: '', lethality: 20 }))).toEqual({
      damage: false,
      lethality: true
    });
  });

  it('offers both when the weapon carries both', () => {
    expect(weaponDamageOptions(makeWeapon({ damage: '2D10', lethality: 20 }))).toEqual({
      damage: true,
      lethality: true
    });
  });

  // Mirrors the system's own hasWeaponDamage helper, which treats "0" as absent
  // — offering a roll the chat card would have withheld is a dead control.
  it.each(['', '   ', '0'])('treats a damage formula of %p as no damage', (damage) => {
    expect(weaponDamageOptions(makeWeapon({ damage, lethality: 0 })).damage).toBe(false);
  });

  it.each([0, -5, Number.NaN, null, undefined])('treats a lethality of %p as none', (lethality) => {
    expect(weaponDamageOptions(makeWeapon({ damage: '', lethality })).lethality).toBe(false);
  });

  it('handles no item', () => {
    expect(weaponDamageOptions(null)).toEqual({ damage: false, lethality: false });
  });
});

describe('When to offer', () => {
  it('offers after a successful weapon attack', () => {
    expect(shouldOfferDamage(hit(makeWeapon({ damage: '1D10' })))).toBe(true);
  });

  it('stays quiet after a miss', () => {
    expect(shouldOfferDamage(hit(makeWeapon({ damage: '1D10' }), { success: false }))).toBe(false);
  });

  // The system only shows its own buttons on a hit, and an undetermined result
  // is not a hit.
  it('stays quiet when success was never determined', () => {
    expect(shouldOfferDamage(hit(makeWeapon({ damage: '1D10' }), { success: null }))).toBe(false);
  });

  it.each(['skill', 'stat', 'sanity', 'damage', 'lethality'])('stays quiet after a %s roll', (type) => {
    expect(shouldOfferDamage(hit(makeWeapon({ damage: '1D10' }), { type }))).toBe(false);
  });

  // Rolling damage publishes its own outcome; offering again would loop.
  it('does not offer again off the back of the damage roll it caused', () => {
    expect(shouldOfferDamage({ type: 'damage', success: null, item: makeWeapon({ damage: '1D10' }) })).toBe(false);
  });

  it('stays quiet for a weapon with nothing to roll', () => {
    expect(shouldOfferDamage(hit(makeWeapon({ damage: '', lethality: 0 })))).toBe(false);
  });

  it('handles no outcome', () => {
    expect(shouldOfferDamage(null)).toBe(false);
  });
});
