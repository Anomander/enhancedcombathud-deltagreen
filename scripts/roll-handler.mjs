/**
 * Pure math for the module's own rules additions.
 *
 * Percentile success, criticals, lethality and Sanity loss are all computed by the
 * Delta Green system's roll classes (`DGPercentileRoll.isSuccess` / `.isCritical`,
 * `DGLethalityRoll`, `DGSanityDamageRoll`). This module must not reimplement them
 * (SYS-3), so the only math left here is the Willpower Boost house rule.
 */

/**
 * Validate and compute a Willpower Boost expenditure.
 *
 * @param {number} currentWp - The actor's current Willpower.
 * @param {number} [cost=1] - Willpower spent.
 * @param {number} [bonusPercent=20] - Percentile bonus granted.
 * @returns {{success: boolean, reason?: string, wpRemaining: number, bonus: number, cost: number}}
 */
export function spendWillpowerForBonus(currentWp, cost = 1, bonusPercent = 20) {
  const wp = Number(currentWp);
  const wpCost = Math.max(1, Number(cost) || 1);
  const bonus = Math.max(0, Number(bonusPercent) || 0);

  if (!Number.isFinite(wp)) {
    return { success: false, reason: 'DG_HUD.Notifications.WpUnavailable', wpRemaining: 0, bonus: 0, cost: wpCost };
  }

  if (wp < wpCost) {
    return { success: false, reason: 'DG_HUD.Notifications.WpInsufficient', wpRemaining: wp, bonus: 0, cost: wpCost };
  }

  return { success: true, wpRemaining: wp - wpCost, bonus, cost: wpCost };
}
