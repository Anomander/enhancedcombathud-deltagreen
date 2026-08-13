/**
 * Attack resolution arithmetic. Pure — no I/O, no Foundry, no documents.
 *
 * ─── A deliberate, narrow exception to "not a rules engine" (OOS-1) ───────────
 *
 * The Delta Green system does **not** apply damage. It derives
 * `system.health.protection` from equipped armour, but nothing in the system ever
 * consumes it, and there is no `applyDamage` anywhere in `module/`. So unlike
 * success, criticals, damage totals and the Lethality fallback — all of which are
 * read from the system's own roll objects and never recomputed — this arithmetic
 * has nowhere else to live.
 *
 * It is isolated here, kept to the smallest possible surface, and stated openly
 * rather than scattered through a click handler. **Exactly three rules are
 * encoded, and nothing else may be added without revisiting OOS-1:**
 *
 *   1. Armour subtracts from incoming damage.
 *   2. Armour Piercing reduces the target's armour for that attack.
 *   3. A successful Lethality roll kills outright, and armour does not apply.
 *      A failed one deals the system's own `nonLethalDamage` total, against
 *      which armour does apply. (Agent's Handbook p. 57 — the fallback total is
 *      computed by `DGLethalityRoll`, not here.)
 */

/**
 * An integer, or null if the input was not a usable number.
 *
 * An allowlist, not a blocklist: only numbers and non-empty numeric strings are
 * readable. Left to `Number()`, each of `null`, `''` and `[]` coerces to a
 * confident `0` — turning "this could not be read" into "this is zero", which is
 * the failure SYS-5 exists to prevent.
 */
function toInt(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : null;
  }

  return null;
}

/**
 * @typedef {object} Resolution
 * @property {boolean} ok - False when a required input was missing.
 * @property {string} [reason] - Localisation key, when `ok` is false.
 * @property {boolean} lethalKill - The Lethality roll killed outright.
 * @property {number} rolled - Damage before armour.
 * @property {number} armor - The target's armour rating.
 * @property {number} armorPiercing - The weapon's AP.
 * @property {number} armorApplied - Armour actually subtracted, after AP.
 * @property {number} damageAfterArmor - What got through the armour.
 * @property {number} applied - Hit points actually removed (never more than the target had).
 * @property {number} hpBefore
 * @property {number} hpAfter - Floored at 0; the schema forbids negative.
 * @property {boolean} blocked - Armour absorbed the whole hit.
 * @property {number} overkill - Damage beyond what the target had left.
 */

/**
 * Resolve rolled damage against a target.
 *
 * Missing input is refused rather than defaulted (SYS-5, AUTO-5): a target whose
 * hit points cannot be read produces `{ok: false}`, never a confident zero.
 *
 * @param {object} params
 * @param {number} params.damage - The rolled damage total, or the Lethality fallback.
 * @param {number} params.hp - The target's current hit points.
 * @param {number} [params.armor=0] - The target's derived armour.
 * @param {number} [params.armorPiercing=0] - The weapon's armour piercing.
 * @param {boolean} [params.lethalKill=false] - Did a Lethality roll kill outright?
 * @returns {Resolution}
 */
export function resolveDamage({ damage, hp, armor = 0, armorPiercing = 0, lethalKill = false }) {
  const hpBefore = toInt(hp);
  if (hpBefore === null) {
    return refusal('DG_HUD.Notifications.TargetHpUnreadable');
  }

  const rating = Math.max(0, toInt(armor) ?? 0);
  const piercing = Math.max(0, toInt(armorPiercing) ?? 0);

  // Rule 3: a kill bypasses armour entirely.
  if (lethalKill) {
    return {
      ok: true,
      lethalKill: true,
      rolled: 0,
      armor: rating,
      armorPiercing: piercing,
      armorApplied: 0,
      damageAfterArmor: hpBefore,
      applied: hpBefore,
      hpBefore,
      hpAfter: 0,
      blocked: false,
      overkill: 0
    };
  }

  const rolled = toInt(damage);
  if (rolled === null) {
    return refusal('DG_HUD.Notifications.DamageUnreadable');
  }

  // Rules 1 and 2.
  const armorApplied = Math.max(0, rating - piercing);
  const damageAfterArmor = Math.max(0, rolled - armorApplied);

  // `system.health.value` is a NumberField with `min: 0` (general.js
  // resourceField), so hit points cannot go negative. Anything beyond what the
  // target had is reported as overkill rather than silently dropped.
  const applied = Math.min(damageAfterArmor, hpBefore);

  return {
    ok: true,
    lethalKill: false,
    rolled,
    armor: rating,
    armorPiercing: piercing,
    armorApplied,
    damageAfterArmor,
    applied,
    hpBefore,
    hpAfter: hpBefore - applied,
    blocked: damageAfterArmor === 0 && rolled > 0,
    overkill: damageAfterArmor - applied
  };
}

function refusal(reason) {
  return {
    ok: false,
    reason,
    lethalKill: false,
    rolled: 0,
    armor: 0,
    armorPiercing: 0,
    armorApplied: 0,
    damageAfterArmor: 0,
    applied: 0,
    hpBefore: 0,
    hpAfter: 0,
    blocked: false,
    overkill: 0
  };
}
