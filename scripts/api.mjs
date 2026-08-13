/**
 * Public API, exposed as `ui.deltaGreenCombatHud` and on the module entry.
 *
 * Visibility and actor binding belong to the presentation layer, and are reached
 * through the host seam rather than by naming a HUD (ARCH-6). With no HUD
 * registered these degrade to "nothing is bound" instead of throwing.
 */

import { rollService } from './roll-service.mjs';
import { extractSkills, extractWeapons, getActorItems, isSupportedActor } from './actor-adapter.mjs';
import { diagnose } from './diagnostics.mjs';
import { getHost } from './host.mjs';

export class DeltaGreenCombatHudAPI {
  /** The actor the HUD is currently showing. */
  get actor() {
    return getHost().actor;
  }

  get token() {
    return getHost().token;
  }

  /** Is the HUD currently shown? */
  get isVisible() {
    return getHost().isVisible;
  }

  /** Toggle the HUD, optionally against a specific token. */
  toggle(token = null) {
    return getHost().toggle(token);
  }

  /** Re-render the HUD from current actor state. */
  refresh() {
    return getHost().refresh();
  }

  /**
   * Roll a skill for the HUD's current actor.
   * @param {string} skillKey - e.g. 'firearms'. See the actor's system.skills.
   * @param {Event} [event] - Passed through; shift-click opens the modifier dialog.
   */
  async rollSkill(skillKey, event = {}) {
    const actor = this.#requireActor();
    return rollService.rollSkill({ actor, token: this.token, skillKey, event });
  }

  /** Roll a Sanity test for the current actor. */
  async rollSanity(event = {}) {
    const actor = this.#requireActor();
    return rollService.rollSanity({ actor, token: this.token, event });
  }

  /**
   * Roll a weapon attack.
   * @param {string} weaponId - The weapon item's id.
   */
  async rollWeaponAttack(weaponId, event = {}) {
    const actor = this.#requireActor();
    return rollService.rollWeaponAttack({ actor, token: this.token, item: this.#weapon(weaponId), event });
  }

  /**
   * Roll a weapon's damage or Lethality, via the system's own choice dialog.
   * @param {string} weaponId - The weapon item's id.
   */
  async rollWeaponDamage(weaponId, event = {}) {
    const actor = this.#requireActor();
    return rollService.rollWeaponDamage({ actor, token: this.token, item: this.#weapon(weaponId), event });
  }

  /**
   * Arm or disarm a Willpower Boost for the current actor's next roll.
   * Nothing is charged until a roll actually happens.
   * @returns {{armed: boolean, reason?: string, bonus?: number, cost?: number}}
   */
  toggleWillpowerBoost() {
    return rollService.toggleWillpowerBoost(this.#requireActor());
  }

  /** Is a Willpower Boost armed for the current actor? */
  isWillpowerBoostArmed() {
    return rollService.isBoostArmed(this.actor);
  }

  /** The current actor's skills, as the HUD sees them. */
  getSkills() {
    return extractSkills(this.actor);
  }

  /** The current actor's weapons, as the HUD sees them. */
  getWeapons() {
    return extractWeapons(this.actor);
  }

  /**
   * Collect a full diagnostic report of what the HUD sees and built.
   * Run this and share the output when something renders wrong.
   */
  async diagnose() {
    return diagnose();
  }

  #requireActor() {
    const actor = this.actor;
    if (!actor) throw new Error('No actor is currently shown in the HUD');
    if (!isSupportedActor(actor)) throw new Error(`Actor type "${actor.type}" is not supported by the HUD`);
    return actor;
  }

  #weapon(weaponId) {
    const actor = this.#requireActor();
    const item = getActorItems(actor).find((entry) => (entry.id ?? entry._id) === weaponId);
    if (!item) throw new Error(`No weapon "${weaponId}" on ${actor.name}`);
    return item;
  }
}
