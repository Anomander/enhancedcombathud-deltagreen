/**
 * Offering the damage roll after a hit.
 *
 * The decision of *whether* to offer, and *what* to offer, is pure and tested
 * here. The prompt itself is a Foundry dialog and is verified in a live world.
 */

import { describe, it, expect } from 'vitest';
import { shouldOfferDamage } from '../scripts/damage-prompt.mjs';
import { makeWeapon } from './fixtures/dg-actors.mjs';

function hit(item, overrides = {}) {
  return { type: 'weapon', success: true, item, actor: null, token: null, ...overrides };
}

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
