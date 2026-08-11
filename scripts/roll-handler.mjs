/**
 * Pure roll engine and calculation utilities for Delta Green combat actions.
 */

/**
 * Determine if a d100 roll is a critical number (matching double digits or 01 / 100).
 * @param {number} rollVal - Integer between 1 and 100.
 * @returns {boolean} True if double digits or special critical.
 */
export function isMatchingDigits(rollVal) {
  if (rollVal === 1 || rollVal === 100) return true;
  if (rollVal < 10 || rollVal > 99) return false;
  const tens = Math.floor(rollVal / 10);
  const units = rollVal % 10;
  return tens === units;
}

/**
 * Calculate the outcome of a Delta Green d100 percentile skill test.
 * @param {number} targetValue - Target skill percentage (e.g. 50%).
 * @param {number} rollResult - Integer result of d100 roll (1 to 100).
 * @param {object} options - Additional modifiers.
 * @param {number} [options.wpBonus=0] - Additional modifier (e.g., +20 from spending 1 WP).
 * @returns {object} Detailed outcome object.
 */
export function evaluatePercentileRoll(targetValue, rollResult, options = {}) {
  const wpBonus = Number(options.wpBonus || 0);
  const effectiveTarget = Math.min(Math.max(targetValue + wpBonus, 0), 99);
  const isMatch = isMatchingDigits(rollResult);

  const isSuccess = rollResult <= effectiveTarget;
  let resultType = isSuccess ? 'success' : 'failure';

  if (rollResult === 1 || (isSuccess && isMatch)) {
    resultType = 'critical_success';
  } else if (rollResult === 100 || (!isSuccess && isMatch)) {
    resultType = 'critical_failure';
  }

  return {
    roll: rollResult,
    target: targetValue,
    effectiveTarget,
    wpBonus,
    isSuccess: resultType === 'success' || resultType === 'critical_success',
    isCriticalSuccess: resultType === 'critical_success',
    isCriticalFailure: resultType === 'critical_failure',
    resultType,
    margin: effectiveTarget - rollResult
  };
}

/**
 * Evaluate a Delta Green Lethality roll (d100 test against weapon Lethality %).
 * @param {number} lethalityPercent - Weapon lethality percentage (e.g. 15 for 15%).
 * @param {number} rollResult - d100 roll result (1 to 100).
 * @returns {object} Lethality outcome object.
 */
export function evaluateLethalityRoll(lethalityPercent, rollResult) {
  const isLethal = rollResult <= lethalityPercent;

  // Non-lethal damage is sum of the two d10 dice (Tens digit + Units digit, 10 count as 10)
  const tens = Math.floor(rollResult / 10);
  const units = rollResult % 10;
  const die1 = tens === 0 ? 10 : tens;
  const die2 = units === 0 ? 10 : units;
  const nonLethalDamage = isLethal ? 0 : die1 + die2;

  return {
    roll: rollResult,
    lethalityPercent,
    isLethal,
    nonLethalDamage,
    die1,
    die2
  };
}

/**
 * Calculate Sanity test outcome and SAN loss.
 * @param {number} currentSan - Agent's current SAN value.
 * @param {number} rollResult - d100 roll result.
 * @param {string} sanLossSuccessFormula - e.g. "0" or "1"
 * @param {string} sanLossFailureFormula - e.g. "1d6"
 * @returns {object} Sanity test outcome.
 */
export function evaluateSanityRoll(currentSan, rollResult, sanLossSuccessFormula = '0', sanLossFailureFormula = '1d6') {
  const evalResult = evaluatePercentileRoll(currentSan, rollResult);

  return {
    ...evalResult,
    sanLossFormula: evalResult.isSuccess ? sanLossSuccessFormula : sanLossFailureFormula
  };
}

/**
 * Handle spending Willpower Points for a bonus.
 * @param {object} vitals - Current vitals object containing wp.
 * @param {number} [cost=1] - WP cost to spend.
 * @param {number} [bonusPercent=20] - Percentage bonus to gain.
 * @returns {object} Updated vitals and bonus value.
 */
export function spendWillpowerForBonus(vitals, cost = 1, bonusPercent = 20) {
  const wpCost = Math.max(1, Number(cost || 1));
  const bonus = Math.max(0, Number(bonusPercent ?? 20));

  if (!vitals || !vitals.wp || vitals.wp.value < wpCost) {
    return {
      success: false,
      reason: `Insufficient Willpower Points (requires ${wpCost} WP)`,
      wpRemaining: vitals?.wp?.value || 0,
      bonus: 0
    };
  }

  const updatedWp = vitals.wp.value - wpCost;
  return {
    success: true,
    wpRemaining: updatedWp,
    bonus,
    cost: wpCost,
    message: `Spent ${wpCost} WP for +${bonus}% bonus to next roll!`
  };
}
