/**
 * Rolls the module did not make.
 *
 * The HUD is an accelerator, not an alternative (docs/PRODUCT.md), and it was
 * failing that on its own most important path. A player who declined the damage
 * prompt and clicked *Roll Lethality* on the system's own attack card got no
 * offer to apply the result: `DeltaGreenItem#roll` goes straight to
 * `actor.sheet.processRoll`, the system fires no hook anywhere in its roll
 * pipeline, and nothing in this module ever saw it. A failed Lethality — which
 * still deals its tens+ones damage (Agent's Handbook p. 57) — left that damage
 * printed on the card with no way to apply it.
 *
 * Every Delta Green roll does reach one observable place: its chat message. The
 * system registers its roll subclasses in `CONFIG.Dice.rolls` (`deltagreen.js`),
 * so a roll read back off a message is a real `DGLethalityRoll` — `target`,
 * `nonLethalDamage` and `isSuccess` all answer, including after a reload.
 * Verified in a live world before this was written.
 *
 * Two things keep it from firing twice. Only the **author's** client acts:
 * `createChatMessage` runs everywhere, and resolution belongs to the player who
 * rolled, whose targets are the ones that count. And rolls this module issued
 * are skipped, because the roll service has already published them with their
 * live documents attached.
 */

import { EVENTS, emit } from './events.mjs';
import { describeRoll } from './roll-outcome.mjs';
import { isHudOrigin } from './roll-service.mjs';
import { Logger } from './logger.mjs';

/**
 * Roll types worth republishing: the ones automation can act on.
 *
 * Attack rolls are deliberately absent. The system's own card already offers
 * *Roll Damage* and *Roll Lethality* beneath every hit, so treating a sheet
 * attack as though it had come from the HUD would put a second prompt in front
 * of a player who never asked the HUD for anything.
 */
const OBSERVED = new Set(['damage', 'lethality']);

/**
 * The roll on this message that this module should act on, if any.
 *
 * Pure: it reads the message and nothing else, so the decision is testable
 * without a world (TEST-6).
 *
 * @param {object|null} message - A ChatMessage document.
 * @returns {object|null} The roll, or null.
 */
export function observableRoll(message) {
  if (message?.isAuthor !== true) return null;

  const roll = message.rolls?.[0];
  if (!roll) return null;
  if (!OBSERVED.has(roll.options?.rollType)) return null;

  // Already published by the roll service, with documents rather than the
  // flattened copies below.
  if (isHudOrigin(roll)) return null;

  return roll;
}

/**
 * Put the live documents back.
 *
 * A roll read off a chat message carries `options.actor`, `options.item` and
 * `options.token` as the plain objects they serialised into. That is enough for
 * the arithmetic — armour piercing survives — but not for anything that needs a
 * document, and the published outcome should be one shape, not two.
 *
 * The speaker names the scene, token and actor, which is exactly how the system
 * recovers them itself (`chat/dg-chat-card.js`). The item is looked up on the
 * actor by the id the roll recorded.
 *
 * Where a lookup fails the serialised copy is kept rather than nulled: it is
 * what the roll actually recorded, and SYS-5 is about never inventing a value,
 * not about discarding a real one.
 */
function relink(outcome, message) {
  const speaker = message?.speaker ?? {};
  const scene = globalThis.game?.scenes?.get?.(speaker.scene);
  const token = scene?.tokens?.get?.(speaker.token) ?? null;
  const actor = token?.actor ?? globalThis.game?.actors?.get?.(speaker.actor) ?? null;

  const itemId = outcome.item?._id ?? outcome.item?.id ?? null;
  const item = itemId ? actor?.items?.get?.(itemId) ?? null : null;

  return {
    ...outcome,
    actor: actor ?? outcome.actor,
    token: token ?? outcome.token,
    item: item ?? outcome.item
  };
}

/**
 * Describe a roll that arrived by chat message.
 * @param {object|null} message
 * @returns {import('./roll-outcome.mjs').RollOutcome|null}
 */
export function outcomeFromMessage(message) {
  const roll = observableRoll(message);
  return roll ? relink(describeRoll(roll), message) : null;
}

/**
 * Publish it, if there is anything to publish.
 * Called by the composition root from Foundry's `createChatMessage` hook — the
 * Foundry surface stays there, so this file needs no globals to be tested.
 *
 * @param {object|null} message
 * @returns {object|null} The outcome published, or null.
 */
export function observeChatMessage(message) {
  const outcome = outcomeFromMessage(message);
  if (!outcome) return null;

  Logger.debug('Observed a roll the HUD did not make', {
    type: outcome.type,
    item: outcome.item?.name
  });

  emit(EVENTS.ROLL_OUTCOME, outcome);
  return outcome;
}
