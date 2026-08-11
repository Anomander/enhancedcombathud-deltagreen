import { describe, it, expect } from 'vitest';
import {
  isMatchingDigits,
  evaluatePercentileRoll,
  evaluateLethalityRoll,
  evaluateSanityRoll,
  spendWillpowerForBonus
} from '../scripts/roll-handler.mjs';

describe('Roll Handler Verification', () => {
  it('detects matching double digits for criticals', () => {
    expect(isMatchingDigits(1)).toBe(true);
    expect(isMatchingDigits(11)).toBe(true);
    expect(isMatchingDigits(44)).toBe(true);
    expect(isMatchingDigits(99)).toBe(true);
    expect(isMatchingDigits(100)).toBe(true);

    expect(isMatchingDigits(23)).toBe(false);
    expect(isMatchingDigits(54)).toBe(false);
  });

  it('evaluates percentile skill tests correctly', () => {
    // Standard Success (Roll 35 <= Target 50)
    const success = evaluatePercentileRoll(50, 35);
    expect(success.isSuccess).toBe(true);
    expect(success.resultType).toBe('success');

    // Standard Failure (Roll 65 > Target 50)
    const failure = evaluatePercentileRoll(50, 65);
    expect(failure.isSuccess).toBe(false);
    expect(failure.resultType).toBe('failure');

    // Critical Success (Roll 22 <= Target 50, double digits)
    const critSuccess = evaluatePercentileRoll(50, 22);
    expect(critSuccess.isSuccess).toBe(true);
    expect(critSuccess.isCriticalSuccess).toBe(true);
    expect(critSuccess.resultType).toBe('critical_success');

    // Critical Failure (Roll 88 > Target 50, double digits)
    const critFailure = evaluatePercentileRoll(50, 88);
    expect(critFailure.isSuccess).toBe(false);
    expect(critFailure.isCriticalFailure).toBe(true);
    expect(critFailure.resultType).toBe('critical_failure');

    // WP Bonus application (+20% bonus)
    const wpBoost = evaluatePercentileRoll(50, 65, { wpBonus: 20 });
    expect(wpBoost.effectiveTarget).toBe(70);
    expect(wpBoost.isSuccess).toBe(true);
  });

  it('evaluates Delta Green lethality rolls', () => {
    // Lethal Kill (Roll 12 <= 15% Lethality)
    const lethal = evaluateLethalityRoll(15, 12);
    expect(lethal.isLethal).toBe(true);
    expect(lethal.nonLethalDamage).toBe(0);

    // Non-lethal roll (Roll 43 > 15% Lethality) -> sum of dice 4 + 3 = 7 HP damage
    const nonLethal = evaluateLethalityRoll(15, 43);
    expect(nonLethal.isLethal).toBe(false);
    expect(nonLethal.nonLethalDamage).toBe(7);
  });

  it('evaluates Sanity loss rolls', () => {
    const sanRoll = evaluateSanityRoll(45, 30, '0', '1d6');
    expect(sanRoll.isSuccess).toBe(true);
    expect(sanRoll.sanLossFormula).toBe('0');

    const failedSanRoll = evaluateSanityRoll(45, 60, '0', '1d6');
    expect(failedSanRoll.isSuccess).toBe(false);
    expect(failedSanRoll.sanLossFormula).toBe('1d6');
  });

  it('handles spending Willpower Points', () => {
    const vitals = { wp: { value: 5, max: 10 } };
    const res = spendWillpowerForBonus(vitals);
    expect(res.success).toBe(true);
    expect(res.wpRemaining).toBe(4);
    expect(res.bonus).toBe(20);

    const emptyVitals = { wp: { value: 0, max: 10 } };
    const emptyRes = spendWillpowerForBonus(emptyVitals);
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.reason).toContain('Insufficient');
  });
});
