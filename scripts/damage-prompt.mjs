/**
 * Offering the damage roll the moment an attack lands.
 *
 * The system already offers this — a successful weapon attack renders *Roll
 * Damage* / *Roll Lethality* buttons on its chat card. But that means looking
 * away from the HUD, finding the card, and clicking a small button mid-firefight.
 * This brings the same choice to the front; the card stays as the record.
 *
 * It offers exactly what the card would, and rolls through the same path the
 * character sheet uses, so nothing here decides anything the system would not
 * (PAR-1, PAR-3).
 *
 * Only the player who rolled sees it: outcomes are published on the rolling
 * client, so no targeting of users — or socket — is involved.
 */

import { EVENTS, on } from './events.mjs';
import { weaponDamageOptions } from './actor-adapter.mjs';
import { rollService } from './roll-service.mjs';
import { Logger } from './logger.mjs';

/**
 * Should a successful attack be followed by an offer to roll damage?
 *
 * @param {import('./roll-outcome.mjs').RollOutcome|null} outcome
 * @returns {boolean}
 */
export function shouldOfferDamage(outcome) {
  if (outcome?.type !== 'weapon') return false;
  if (outcome.success !== true) return false;

  const { damage, lethality } = weaponDamageOptions(outcome.item);
  return damage || lethality;
}

/**
 * Ask, then roll.
 *
 * With both kinds available the system's own choice dialog is the question —
 * closing it declines. With only one, there is nothing to choose between, so a
 * plain confirmation is the honest prompt.
 */
async function offerDamage(outcome) {
  const { item, actor, token } = outcome;
  const options = weaponDamageOptions(item);

  if (options.damage && options.lethality) {
    // `rollWeaponDamage` shows the system's damage-or-lethality dialog itself.
    await rollService.rollWeaponDamage({ actor, token, item });
    return;
  }

  const choice = options.damage ? 'damage' : 'lethality';
  const confirmed = await confirmRoll(item, choice);
  if (!confirmed) return;

  await rollService.rollWeaponDamage({ actor, token, item, choice });
}

/**
 * A yes/no confirmation, in the player's language (UX-3).
 * @returns {Promise<boolean>}
 */
async function confirmRoll(item, choice) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) {
    Logger.warn('No DialogV2 available; skipping the damage prompt');
    return false;
  }

  const label = game.i18n.localize(
    choice === 'lethality' ? 'DG_HUD.Prompt.RollLethality' : 'DG_HUD.Prompt.RollDamage'
  );

  return DialogV2.confirm({
    window: { title: game.i18n.localize('DG_HUD.Prompt.Title') },
    content: `<p>${foundry.utils.escapeHTML(
      game.i18n.format('DG_HUD.Prompt.Question', { weapon: item?.name ?? '', roll: label })
    )}</p>`,
    yes: { label },
    no: { label: game.i18n.localize('DG_HUD.Prompt.Decline') },
    // Dismissing the window is a decline, not a hung promise.
    rejectClose: false,
    modal: false
  });
}

/** Subscribe to roll outcomes. Called once, from the composition root. */
export function registerDamagePrompt() {
  return on(EVENTS.ROLL_OUTCOME, (outcome) => {
    if (!shouldOfferDamage(outcome)) return;

    offerDamage(outcome).catch((error) => Logger.error('Damage prompt failed', error));
  });
}
