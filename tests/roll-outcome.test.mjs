/**
 * Reading a finished roll.
 *
 * The stubs here mirror the real Delta Green roll classes: DGPercentileRoll
 * exposes isSuccess/isCritical/effectiveTarget; DGLethalityRoll additionally
 * exposes nonLethalDamage and compares against the *unmodified* target in its
 * chat card. Both behaviours are asserted, because the second is a divergence
 * that would otherwise be easy to "tidy up" into a bug.
 */

import { describe, it, expect } from 'vitest';
import { describeRoll, wasEvaluated } from '../scripts/roll-outcome.mjs';

function percentileRoll({ total = 35, target = 50, modifier = 0, type = 'skill', ...rest } = {}) {
  return {
    _evaluated: true,
    total,
    target,
    modifier,
    options: { rollType: type, ...rest },
    get effectiveTarget() {
      return this.target + this.modifier;
    },
    get isSuccess() {
      return this.total <= this.effectiveTarget;
    },
    get isCritical() {
      return this.total % 11 === 0;
    }
  };
}

describe('Detecting whether the dice were actually rolled', () => {
  it('recognises an evaluated roll', () => {
    expect(wasEvaluated(percentileRoll())).toBe(true);
  });

  it('recognises a roll that never happened', () => {
    // processDGRoll returns undefined either way — this is the only witness.
    expect(wasEvaluated({ options: {} })).toBe(false);
  });

  it('falls back to the total when _evaluated is absent', () => {
    expect(wasEvaluated({ total: 17, options: {} })).toBe(true);
  });

  it('survives a subclass that throws on total before evaluation', () => {
    const hostile = {
      options: {},
      get total() {
        throw new Error('not evaluated');
      }
    };
    expect(wasEvaluated(hostile)).toBe(false);
  });

  it('handles no roll at all', () => {
    expect(wasEvaluated(null)).toBe(false);
  });
});

describe('Describing a percentile roll', () => {
  it('reads success and criticality from the system, never recomputing them', () => {
    const outcome = describeRoll(percentileRoll({ total: 22, target: 50 }));

    expect(outcome).toMatchObject({ type: 'skill', total: 22, success: true, critical: true });
  });

  it('reports the effective target, after modifiers', () => {
    expect(describeRoll(percentileRoll({ target: 50, modifier: 20 })).target).toBe(70);
  });

  it('carries the actor, token and item through', () => {
    const actor = { name: 'Agent Reyes' };
    const item = { name: 'M1911A1' };
    const outcome = describeRoll(percentileRoll({ actor, item, token: null }));

    expect(outcome.actor).toBe(actor);
    expect(outcome.item).toBe(item);
  });

  it('reports fields a roll type does not carry as null, not zero', () => {
    const damage = { _evaluated: true, total: 7, options: { rollType: 'damage' } };
    const outcome = describeRoll(damage);

    expect(outcome.total).toBe(7);
    expect(outcome.success).toBeNull();
    expect(outcome.lethal).toBeNull();
    expect(outcome.nonLethalDamage).toBeNull();
  });
});

describe('Describing a Lethality roll', () => {
  function lethalityRoll({ total, target = 20, modifier = 0 }) {
    return {
      ...percentileRoll({ total, target, modifier, type: 'lethality' }),
      get nonLethalDamage() {
        const digits = String(this.total).split('').map(Number).map((d) => d || 10);
        const [die1, die2] = digits.length === 1 ? [10, this.total] : digits;
        return { die1, die2, total: die1 + die2 };
      }
    };
  }

  it('reports a kill when the roll is at or under the weapon rating', () => {
    const outcome = describeRoll(lethalityRoll({ total: 15, target: 20 }));
    expect(outcome.lethal).toBe(true);
  });

  it('reports no kill above the rating', () => {
    expect(describeRoll(lethalityRoll({ total: 45, target: 20 })).lethal).toBe(false);
  });

  it('reads the system\'s own tens+ones fallback rather than computing one', () => {
    // 45 → 4 + 5
    expect(describeRoll(lethalityRoll({ total: 45, target: 20 })).nonLethalDamage).toBe(9);
  });

  it('agrees with the chat card, not with isSuccess, when a modifier is in play', () => {
    // DGLethalityRoll.toChat() prints LETHAL from `total <= target` (base),
    // while isSuccess compares against effectiveTarget. With +20 applied, a roll
    // of 30 against Lethality 20 shows FAILURE on the card. Automation must
    // agree with the card the table reads (PAR-1).
    const roll = lethalityRoll({ total: 30, target: 20, modifier: 20 });

    expect(roll.isSuccess).toBe(true); // what isSuccess would have said
    expect(describeRoll(roll).lethal).toBe(false); // what the card says
  });
});
