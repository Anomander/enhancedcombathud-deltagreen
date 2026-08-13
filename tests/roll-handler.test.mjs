/**
 * Willpower Boost math.
 *
 * Percentile/lethality/sanity evaluation used to be duplicated here; it is the
 * system's job and its tests', so those cases were deleted rather than kept as
 * coverage for code with no call site (TEST-5).
 */

import { describe, it, expect } from 'vitest';
import { spendWillpowerForBonus } from '../scripts/roll-handler.mjs';

describe('spendWillpowerForBonus', () => {
  it('deducts the cost and grants the bonus', () => {
    expect(spendWillpowerForBonus(8, 1, 20)).toMatchObject({
      success: true,
      wpRemaining: 7,
      bonus: 20,
      cost: 1
    });
  });

  it('honours a configured cost and percentage', () => {
    expect(spendWillpowerForBonus(10, 3, 40)).toMatchObject({ success: true, wpRemaining: 7, bonus: 40 });
  });

  it('refuses when Willpower is short, without deducting', () => {
    const result = spendWillpowerForBonus(1, 2, 20);
    expect(result.success).toBe(false);
    expect(result.wpRemaining).toBe(1);
    expect(result.reason).toMatch(/^DG_HUD\./);
  });

  it('allows spending down to exactly zero', () => {
    expect(spendWillpowerForBonus(2, 2, 20)).toMatchObject({ success: true, wpRemaining: 0 });
  });

  it('refuses when the actor has no Willpower at all', () => {
    const result = spendWillpowerForBonus(undefined);
    expect(result.success).toBe(false);
    expect(result.reason).toMatch(/^DG_HUD\./);
  });

  it('clamps a nonsensical cost to at least 1', () => {
    expect(spendWillpowerForBonus(5, 0, 20)).toMatchObject({ success: true, wpRemaining: 4 });
  });

  it('returns a localisation key as the refusal reason, not prose', () => {
    // UX-3: refusals are shown to players, so they must be translatable.
    expect(spendWillpowerForBonus(0, 1, 20).reason).toBe('DG_HUD.Notifications.WpInsufficient');
  });
});
