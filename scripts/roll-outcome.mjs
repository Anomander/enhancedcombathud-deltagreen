/**
 * Reading a finished roll.
 *
 * Everything here is *read* off the system's own roll object — success, critical,
 * lethality, the non-lethal fallback. Nothing is recomputed (OOS-1). If a value
 * is not on the roll, it is reported as `null` rather than derived (SYS-5).
 */

/**
 * Did the system actually roll the dice?
 *
 * `processDGRoll` returns `undefined` whether it rolled or bailed out — it exits
 * early both for a blocked roll (`blockedRollMessage`) and when the player
 * cancels the modifier dialog. The roll object is therefore the only witness.
 * Foundry's `Roll#evaluate` sets `_evaluated`; `total` stays undefined until
 * then. Both are checked so that a change to either still reports correctly.
 *
 * @param {object|null} roll
 * @returns {boolean}
 */
export function wasEvaluated(roll) {
  if (!roll) return false;
  if (roll._evaluated === true) return true;

  try {
    return Number.isFinite(Number(roll.total));
  } catch {
    // Some Roll subclasses throw on `total` before evaluation.
    return false;
  }
}

/** Read a getter that may not exist on this roll subclass. */
function optional(roll, key) {
  try {
    const value = roll[key];
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} RollOutcome
 * @property {string} type - The system's `rollType`: skill, stat, sanity, weapon, damage, lethality…
 * @property {object|null} actor
 * @property {object|null} token
 * @property {object|null} item
 * @property {number|null} total
 * @property {number|null} target - The effective target, after modifiers.
 * @property {boolean|null} success - Percentile rolls only.
 * @property {boolean|null} critical - Percentile rolls only.
 * @property {boolean|null} lethal - Lethality rolls only: did it kill outright?
 * @property {number|null} nonLethalDamage - Lethality rolls only: the tens+ones fallback.
 */

/**
 * Describe an evaluated roll as plain data.
 * @param {object} roll - An evaluated Delta Green roll.
 * @returns {RollOutcome}
 */
export function describeRoll(roll) {
  const type = roll?.options?.rollType ?? roll?.type ?? null;
  const total = Number.isFinite(Number(roll?.total)) ? Number(roll.total) : null;

  // DGLethalityRoll sets `target` to the weapon's lethality and exposes the
  // tens+ones fallback as `nonLethalDamage` — read both, compute neither.
  const isLethality = type === 'lethality';
  const nonLethal = isLethality ? optional(roll, 'nonLethalDamage') : null;

  return {
    type,
    actor: roll?.options?.actor ?? null,
    token: roll?.options?.token ?? null,
    item: roll?.options?.item ?? null,
    total,
    target: optional(roll, 'effectiveTarget'),
    success: optional(roll, 'isSuccess'),
    critical: optional(roll, 'isCritical'),
    lethal: isLethality ? readLethal(roll, total) : null,
    nonLethalDamage: Number.isFinite(Number(nonLethal?.total)) ? Number(nonLethal.total) : null
  };
}

/**
 * Did a Lethality roll kill outright?
 *
 * Deliberately *not* `isSuccess`. The two disagree when a modifier is in play:
 * `DGPercentileRoll.isSuccess` compares against `effectiveTarget` (base +
 * modifiers, clamped 1–99), while `DGLethalityRoll.toChat()` prints LETHAL from
 * `this.total <= this.target` — the unmodified base. The chat card is what the
 * table reads and adjudicates from, so automation must agree with *it*; deciding
 * otherwise would let the HUD claim a kill on a card that says failure, which is
 * precisely the divergence PAR-1 exists to prevent.
 *
 * (The inconsistency is the system's, not ours. Worth raising upstream.)
 *
 * @param {object} roll
 * @param {number|null} total
 * @returns {boolean|null}
 */
function readLethal(roll, total) {
  const target = Number(roll?.target);
  if (total === null || !Number.isFinite(target)) return null;
  return total <= target;
}
