/**
 * The module's single path to the dice.
 *
 * Every roll goes through the system's public pipeline, `processDGRoll` from
 * systems/deltagreen/module/roll/roll.js (SYS-3, SYS-4). That pipeline owns the
 * modifier dialog, `blockedRollMessage`, success/critical evaluation, chat cards
 * and Dice So Nice — this module must never reimplement any of it.
 *
 * The system API is injected rather than imported at module scope, so the file
 * can be loaded outside Foundry without a `typeof game` branch (TEST-3). The
 * default loader is the real system module.
 */

import { Logger } from './logger.mjs';
import { spendWillpowerForBonus } from './roll-handler.mjs';
import { getWpBoostSettings } from './settings.mjs';
import { describeRoll, wasEvaluated } from './roll-outcome.mjs';
import { EVENTS, emit } from './events.mjs';

/** The system's documented public roll API. */
export const SYSTEM_ROLL_API_PATH = '/systems/deltagreen/module/roll/roll.js';

/** The system's roll dialogs, which `module/MODULES.md` designates public. */
export const SYSTEM_DIALOG_API_PATH = '/systems/deltagreen/module/roll/roll-dialogs.js';

/**
 * Normalise a token to its document.
 *
 * The HUD hands components a PIXI Token placeable, but the system stores
 * `options.token` on the roll and serialises it into the chat message — a
 * placeable is deeply circular and throws "Converting circular structure to
 * JSON", silently losing the roll. The system's own helper (`getDGRollToken`)
 * returns a TokenDocument for the same reason.
 *
 * @param {object|null} token - A Token placeable, a TokenDocument, or null.
 * @returns {object|null} A TokenDocument.
 */
export function toTokenDocument(token) {
  if (!token) return null;
  return token.document ?? token;
}

export class RollService {
  #rollApi;
  #loadApi;
  #dialogApi;
  #loadDialogApi;

  /**
   * Actors with a Willpower Boost armed, by uuid.
   *
   * Only a flag is held, never a computed bonus: cost and percentage are read
   * from settings, and affordability from the actor, at the moment the roll
   * happens. Nothing is charged until the dice have actually been rolled, so an
   * armed boost that is never used — cancelled dialog, blocked roll, page
   * reload — costs the player nothing.
   */
  #armed = new Set();

  /**
   * @param {object} [options]
   * @param {() => Promise<object>} [options.loadApi] - Resolves the system roll API.
   * @param {() => Promise<object>} [options.loadDialogApi] - Resolves the system dialog API.
   */
  constructor({ loadApi, loadDialogApi } = {}) {
    this.#loadApi = loadApi ?? (() => import(/* @vite-ignore */ SYSTEM_ROLL_API_PATH));
    this.#loadDialogApi = loadDialogApi ?? (() => import(/* @vite-ignore */ SYSTEM_DIALOG_API_PATH));
    this.#rollApi = null;
    this.#dialogApi = null;
  }

  /** Resolve and cache the system roll API. */
  async api() {
    this.#rollApi ??= await this.#loadApi();
    return this.#rollApi;
  }

  /** Resolve and cache the system dialog API. */
  async dialogApi() {
    this.#dialogApi ??= await this.#loadDialogApi();
    return this.#dialogApi;
  }

  // --- Willpower Boost -------------------------------------------------------

  /**
   * Arm or disarm a Willpower Boost for this actor's next percentile roll.
   *
   * Arming writes nothing. The cost is taken in `#chargeBoost`, after the system
   * confirms it actually rolled — so a boost the player never spends cannot cost
   * them Willpower (F-3).
   *
   * @param {object} actor - The Delta Green actor document.
   * @returns {{armed: boolean, reason?: string, bonus?: number, cost?: number}}
   */
  toggleWillpowerBoost(actor) {
    const uuid = actor?.uuid;
    if (!uuid) return { armed: false, reason: 'DG_HUD.Notifications.WpUnavailable' };

    if (this.#armed.has(uuid)) {
      this.#armed.delete(uuid);
      Logger.debug('Willpower Boost disarmed', { actor: actor.name });
      return { armed: false };
    }

    const settings = getWpBoostSettings();
    if (!settings.enabled) {
      return { armed: false, reason: 'DG_HUD.Notifications.WpBoostDisabled' };
    }

    // Validated now purely so the button can refuse immediately; re-validated at
    // roll time, because Willpower can change in between.
    const affordable = spendWillpowerForBonus(actor?.system?.wp?.value, settings.cost, settings.percent);
    if (!affordable.success) return { armed: false, reason: affordable.reason };

    this.#armed.add(uuid);
    Logger.debug('Willpower Boost armed', { actor: actor.name, bonus: affordable.bonus });
    return { armed: true, bonus: affordable.bonus, cost: affordable.cost };
  }

  /** Is a boost armed for this actor? */
  isBoostArmed(actor) {
    return this.#armed.has(actor?.uuid);
  }

  /**
   * Work out what an armed boost would cost right now, without charging for it.
   * Disarms and reports if the actor can no longer afford it.
   * @returns {{bonus: number, cost: number}|null}
   */
  #prepareBoost(actor) {
    if (!this.isBoostArmed(actor)) return null;

    const settings = getWpBoostSettings();
    const result = spendWillpowerForBonus(actor?.system?.wp?.value, settings.cost, settings.percent);

    if (!result.success) {
      // No longer affordable — drop it and say so rather than rolling as though
      // the boost applied (UX-6).
      this.#armed.delete(actor.uuid);
      notify('warn', result.reason);
      return null;
    }

    return { bonus: result.bonus, cost: result.cost };
  }

  /**
   * Take the Willpower. Called only once the system has confirmed it rolled.
   * Re-reads current Willpower rather than trusting the value read before the
   * modifier dialog, and never writes a negative (the schema forbids it).
   */
  async #chargeBoost(actor, charge) {
    this.#armed.delete(actor.uuid);

    const current = Number(actor?.system?.wp?.value);
    if (!Number.isFinite(current)) return;

    await actor.update({ 'system.wp.value': Math.max(0, current - charge.cost) });
    Logger.debug('Willpower Boost charged', { actor: actor.name, cost: charge.cost });
  }

  // --- Turn gating -----------------------------------------------------------

  /**
   * May this actor act right now?
   *
   * Advisory for the Handler and enforced for players (UX-6). Outside combat, or
   * before initiative is rolled, everyone may act.
   *
   * @param {object} actor
   * @returns {{allowed: boolean, reason?: string}}
   */
  canAct(actor) {
    const combat = globalThis.game?.combat;
    if (!combat?.started) return { allowed: true };
    if (globalThis.game?.user?.isGM) return { allowed: true };

    const current = combat.combatant?.actor;
    if (!current) return { allowed: true };

    // Compare the acting actor to the one whose turn it is — not merely "do I own
    // the current combatant", which let a player act with any actor they owned.
    if (current.id === actor?.id) return { allowed: true };

    return { allowed: false, reason: 'DG_HUD.Notifications.NotYourTurn' };
  }

  // --- Rolls -----------------------------------------------------------------

  /**
   * Build a percentile roll, apply any armed Willpower Boost, and send it through
   * the system pipeline.
   * @returns {Promise<object>} The evaluated roll.
   */
  async #percentileRoll({ actor, token = null, item = null, rollType, key, event = {}, specialTrainingName = null }) {
    const { DGPercentileRoll, processDGRoll } = await this.api();

    const roll = new DGPercentileRoll('1D100', {}, {
      rollType,
      key,
      actor,
      item,
      token: toTokenDocument(token),
      specialTrainingName
    });

    // The system already folds in the weapon's own skillModifier and any Active
    // Effect roll targets — only the Willpower Boost is ours to add (PAR-2).
    const charge = this.#prepareBoost(actor);
    if (charge) roll.modifier += charge.bonus;

    await processDGRoll(event, roll);
    return this.#settle(roll, { actor, charge });
  }

  /**
   * Everything that must happen only if the dice were actually rolled.
   *
   * `processDGRoll` returns nothing whether it rolled or bailed out — it exits
   * early for a blocked roll and when the player cancels the modifier dialog.
   * So the roll object is asked instead. On a bail-out: charge nothing, publish
   * nothing, and leave any boost armed for the next attempt.
   *
   * @returns {object} The roll, evaluated or not.
   */
  async #settle(roll, { actor = null, charge = null } = {}) {
    if (!wasEvaluated(roll)) {
      Logger.debug('Roll did not evaluate — nothing charged, boost left armed');
      return roll;
    }

    if (charge && actor) await this.#chargeBoost(actor, charge);

    emit(EVENTS.ROLL_OUTCOME, describeRoll(roll));
    return roll;
  }

  /**
   * Roll a skill or typed skill.
   * @param {{actor: object, token?: object, skillKey: string, event?: object}} params
   */
  async rollSkill({ actor, token, skillKey, event }) {
    return this.#percentileRoll({ actor, token, rollType: 'skill', key: skillKey, event });
  }

  /**
   * Roll a statistic (STR, CON, DEX, INT, POW, CHA).
   */
  async rollStat({ actor, token, statKey, event }) {
    return this.#percentileRoll({ actor, token, rollType: 'stat', key: statKey, event });
  }

  /**
   * Roll a Sanity test.
   */
  async rollSanity({ actor, token, event }) {
    return this.#percentileRoll({ actor, token, rollType: 'sanity', key: 'sanity', event });
  }

  /**
   * Roll Special Training against its backing attribute.
   */
  async rollSpecialTraining({ actor, token, training, event }) {
    return this.#percentileRoll({
      actor,
      token,
      rollType: 'special-training',
      key: training.attribute,
      specialTrainingName: training.name,
      event
    });
  }

  /**
   * Roll a weapon attack. Gated on whose turn it is (UX-6) — skills and Sanity
   * are not, since those are rolled reactively and out of turn all the time.
   * @param {{actor: object, token?: object, item: object, event?: object}} params
   */
  async rollWeaponAttack({ actor, token, item, event }) {
    const permitted = this.canAct(actor);
    if (!permitted.allowed) {
      notify('warn', permitted.reason);
      Logger.debug('Attack blocked: not this actor\'s turn', { actor: actor?.name });
      return null;
    }

    return this.#percentileRoll({
      actor,
      token,
      item,
      rollType: 'weapon',
      key: item?.system?.skill,
      event
    });
  }

  /**
   * Roll a weapon's damage or Lethality, exactly as the character sheet does.
   *
   * The sheet's weapon row carries a combined `damage-or-lethality` control that
   * opens the system's own choice dialog and then rolls whichever the player
   * picked (`roll-sheet-mixin.js` `_onRoll`). This mirrors that: same dialog,
   * same two calls, so parity holds by construction rather than by discipline
   * (PAR-1, PAR-3).
   *
   * Deliberately does *not* branch on `system.isLethal`. A weapon can carry both
   * a damage formula and a Lethality rating, and choosing between them is the
   * player's call, not the module's.
   *
   * @param {object} params
   * @param {object} [params.actor]
   * @param {object} [params.token]
   * @param {object} params.item
   * @param {object} [params.event]
   * @param {'damage'|'lethality'|null} [params.choice] - Already decided; skips the dialog.
   * @returns {Promise<object|null>} The roll, or null if refused or cancelled.
   */
  async rollWeaponDamage({ actor = null, token = null, item, event = {}, choice = null }) {
    if (actor) {
      const permitted = this.canAct(actor);
      if (!permitted.allowed) {
        notify('warn', permitted.reason);
        return null;
      }
    }

    if (!item) {
      Logger.warn('Cannot roll damage: no weapon');
      return null;
    }

    // A caller that already knows which to roll — because the weapon only
    // offers one, and the player has just confirmed it — must not be asked
    // again. Otherwise the system's own dialog decides (PAR-3).
    let rollType = choice;
    if (!rollType) {
      const { showDamageOrLethalityChoiceDialog } = await this.dialogApi();
      rollType = await showDamageOrLethalityChoiceDialog({ itemName: item.name ?? '' });
    }

    // The player closed the dialog — roll nothing.
    if (!rollType) return null;

    const { createDGRollFromDataset, processDGRoll } = await this.api();
    const roll = createDGRollFromDataset(
      { rolltype: rollType },
      { actor, item, token: toTokenDocument(token) }
    );

    await processDGRoll(asPlainRoll(event), roll);
    return this.#settle(roll);
  }
}

/**
 * Strip the right-button gesture out of an event before handing it to the system.
 *
 * `processDGRoll` opens the modifier dialog when `shiftKey` **or** `which === 3`
 * — on the character sheet, right-clicking a roll control is how you ask for
 * modifiers. In the HUD, right-click is instead how you *reach* damage at all,
 * so forwarding it raw made every damage roll open a modifier dialog nobody
 * asked for, and the roll never completed.
 *
 * Mapping HUD-right-click onto sheet-left-click is the correct parity
 * translation (PAR-1): the gesture that means "roll this" in each surface. Shift
 * is preserved, so shift+right-click still opens the modifier dialog exactly as
 * shift-click does on the sheet.
 */
export function asPlainRoll(event) {
  return { shiftKey: Boolean(event?.shiftKey) };
}

/** Localise and show a notification, when running inside Foundry. */
function notify(level, key) {
  const message = globalThis.game?.i18n?.localize?.(key) ?? key;
  globalThis.ui?.notifications?.[level]?.(message);
}

/** The instance the HUD components use. */
export const rollService = new RollService();
