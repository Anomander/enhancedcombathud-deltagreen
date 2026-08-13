/**
 * Naming who an attack was aimed at.
 *
 * An attack card reads *Rolling FIREARMS for M1911A1: 50% — Success*, and says
 * nothing about who was being shot. Around a table that is fine; in a firefight
 * with four Agents and six things in the dark it is not, and the Handler ends up
 * asking who that was aimed at after every roll.
 *
 * Stamped at `preCreateChatMessage`, which runs only on the client creating the
 * message — the one that also holds the targets. Stamping there rather than at
 * roll time is what keeps PAR-1 intact: the annotation follows **targeting**,
 * not the surface the roll came from, so an attack rolled from the character
 * sheet carries it exactly as one rolled from the HUD does.
 *
 * Only token uuids are stored. Names are resolved per viewer at render time,
 * because a Handler who hid a token's name has made a decision about what the
 * table knows, and a card that baked the name in would publish it to everyone
 * permanently — the reasoning behind UX-5, applied to tokens (`targeting.mjs`).
 */

import { canSeeTokenName } from './targeting.mjs';
import { MODULE_ID } from './settings.mjs';
import { Logger } from './logger.mjs';

/** Where the uuids live on the message. */
export const TARGETS_FLAG = 'attackTargets';

/**
 * Roll types worth annotating: attacks.
 *
 * Damage and Lethality are absent on purpose — the proposal card automation
 * posts for those already names the target and states what it would do, and a
 * second mention on the roll above it would be noise.
 */
const ANNOTATED = new Set(['weapon']);

/**
 * Should this message carry a target line, and for whom?
 *
 * Pure, so the decision is testable without a world (TEST-6). Returns null
 * rather than an empty array when there is nothing to say: an attack rolled with
 * nothing targeted gets no line at all, rather than an empty one (UX-1, SYS-5).
 *
 * @param {object|null} message - A ChatMessage document, pre-creation.
 * @param {Array<object>} targets - The roller's targeted tokens.
 * @returns {Array<string>|null} Token uuids.
 */
export function targetsForMessage(message, targets) {
  const rollType = message?.rolls?.[0]?.options?.rollType;
  if (!ANNOTATED.has(rollType)) return null;

  const uuids = (Array.isArray(targets) ? targets : [])
    .map((token) => token?.document?.uuid ?? token?.uuid ?? null)
    .filter(Boolean);

  return uuids.length > 0 ? uuids : null;
}

/**
 * Record the roller's targets on an attack message before it is written.
 *
 * `updateSource` rather than `update`: this runs before creation, so the flag
 * goes in with the document instead of costing a second write and a re-render.
 *
 * @param {object|null} message
 * @returns {Array<string>|null} What was recorded.
 */
export function stampTargets(message) {
  const targets = [...(globalThis.game?.user?.targets ?? [])];
  const uuids = targetsForMessage(message, targets);
  if (!uuids) return null;

  message.updateSource({ [`flags.${MODULE_ID}.${TARGETS_FLAG}`]: uuids });
  Logger.debug('Recorded attack targets', { count: uuids.length });
  return uuids;
}

/**
 * Resolve a token uuid without awaiting.
 *
 * Chat rendering is synchronous, so `fromUuidSync` is the only option; it
 * answers for anything already in the client's collections, which a token on a
 * loaded scene is.
 */
function resolveToken(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuidSync ?? globalThis.fromUuidSync;
  if (typeof resolver !== 'function') return null;

  try {
    return resolver(uuid) ?? null;
  } catch {
    // A uuid pointing at an unloaded compendium or a deleted scene throws
    // rather than returning null.
    return null;
  }
}

/**
 * What this viewer may be told each target is called.
 *
 * A token that cannot be resolved is reported as unnamed rather than skipped:
 * the count of things being shot at is not a secret, and dropping it silently
 * would misreport a two-target burst as a one-target one.
 */
function nameFor(uuid, isGM) {
  const token = resolveToken(uuid);
  const localize = (key) => globalThis.game?.i18n?.localize?.(key) ?? key;

  if (token && canSeeTokenName(token, { isGM })) {
    return token.name ?? localize('DG_HUD.Target.Unnamed');
  }
  return localize('DG_HUD.Target.Unnamed');
}

/**
 * Draw the target line onto a rendered attack card.
 *
 * Built as DOM, never markup — token names are user input (ARCH-3). Placed
 * under the system's own roll label where there is one, so it reads as part of
 * the same header, and prepended to the card body otherwise.
 *
 * @param {object|null} message
 * @param {HTMLElement|null} element - The rendered message element.
 * @returns {HTMLElement|null} The line, if one was drawn.
 */
export function renderTargetLine(message, element) {
  const uuids = message?.flags?.[MODULE_ID]?.[TARGETS_FLAG];
  if (!Array.isArray(uuids) || uuids.length === 0) return null;
  if (!element?.querySelector) return null;

  // Foundry re-renders a message on every update; the line must not stack up.
  if (element.querySelector('.dg-hud-attack-targets')) return null;

  const isGM = Boolean(globalThis.game?.user?.isGM);
  const names = uuids.map((uuid) => nameFor(uuid, isGM));

  const line = globalThis.document.createElement('div');
  line.classList.add('dg-hud-attack-targets');
  line.innerText =
    globalThis.game?.i18n?.format?.('DG_HUD.Target.Against', { targets: names.join(', ') }) ??
    names.join(', ');

  const label = element.querySelector('.dg-chat-card__roll-label');
  const body = element.querySelector('.dg-chat-card__body');

  if (label) label.after(line);
  else if (body) body.prepend(line);
  else element.prepend(line);

  return line;
}
