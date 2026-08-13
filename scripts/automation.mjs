/**
 * Target-aware attack resolution.
 *
 * Subscribes to roll outcomes (FR-25) rather than hooking into a click handler,
 * so nothing in the roll path knows this exists — and Sequencer effects will
 * attach the same way.
 *
 * **Rung B** of the permission ladder: the result is offered as a chat card with
 * an Apply button, and the write runs in whoever clicks it. A Handler's click
 * therefore carries GM permissions, and no socket relay or extra dependency is
 * needed (AUTO-4).
 *
 * Automation acts on outcomes, never on decisions (AUTO-2): it applies the
 * result of a damage roll that already happened. It never decides whether an
 * attack hit, what to target, or what to roll.
 */

import { EVENTS, on } from './events.mjs';
import { extractVitals } from './actor-adapter.mjs';
import { resolveDamage } from './resolution.mjs';
import { getDamageAutomation, MODULE_ID } from './settings.mjs';
import { Logger } from './logger.mjs';

/** Chat flag namespace for a pending application. */
export const APPLY_FLAG = 'pendingDamage';

/** Roll types that resolve into damage on a target. */
const DAMAGING = new Set(['damage', 'lethality']);

/**
 * Read the acting user's current target.
 * Deliberately the *user's* target, not the scene's — resolution belongs to the
 * player who rolled.
 * @returns {object|null} A Token placeable.
 */
function currentTarget() {
  const targets = globalThis.game?.user?.targets;
  if (!targets || targets.size === 0) return null;
  // With several targeted, resolution is ambiguous — refuse rather than guess.
  if (targets.size > 1) return null;
  return [...targets][0] ?? null;
}

/**
 * Turn a roll outcome into a proposed application against the current target.
 * @param {import('./roll-outcome.mjs').RollOutcome} outcome
 * @returns {{target: object, actor: object, resolution: object}|null}
 */
export function proposeFrom(outcome, target = currentTarget()) {
  if (!DAMAGING.has(outcome?.type)) return null;
  if (!target?.actor) return null;

  const vitals = extractVitals(target.actor);
  if (!vitals.hp.available) {
    Logger.debug('Target has no readable hit points', { target: target.name });
    return null;
  }

  // A Lethality roll resolves one of two ways, and the system has already
  // decided which: a kill, or its own tens+ones fallback total. Read, never
  // recompute (OOS-1).
  const lethalKill = outcome.type === 'lethality' && outcome.lethal === true;
  const damage = outcome.type === 'lethality' ? outcome.nonLethalDamage : outcome.total;

  const resolution = resolveDamage({
    damage,
    hp: vitals.hp.value,
    armor: vitals.armor,
    armorPiercing: Number(outcome.item?.system?.armorPiercing ?? 0),
    lethalKill
  });

  return { target, actor: target.actor, resolution };
}

/**
 * Write the result to the target.
 * Refuses rather than failing silently when the current user cannot write
 * (AUTO-4) — a player is told to ask their Handler, who can click the same
 * button and have it succeed.
 *
 * @returns {Promise<boolean>} Whether the write happened.
 */
export async function applyResolution(actor, resolution) {
  if (!actor?.isOwner) {
    notify('warn', 'DG_HUD.Notifications.NoPermissionToApply');
    return false;
  }

  await actor.update({ 'system.health.value': resolution.hpAfter });
  Logger.debug('Damage applied', { actor: actor.name, applied: resolution.applied });
  return true;
}

/**
 * Post the proposal to chat, with an Apply button when it has not been applied.
 * Every automatic change states what changed, on whom, and why (AUTO-3).
 */
async function postCard({ target, actor, resolution, applied }) {
  const i18n = globalThis.game?.i18n;
  const format = (key, data) => i18n?.format?.(key, data) ?? key;

  const lines = [];

  if (resolution.lethalKill) {
    lines.push(format('DG_HUD.Apply.Lethal', { target: target.name }));
  } else {
    lines.push(format('DG_HUD.Apply.Arithmetic', {
      rolled: resolution.rolled,
      armor: resolution.armorApplied,
      through: resolution.damageAfterArmor
    }));
    if (resolution.armorPiercing > 0) {
      lines.push(format('DG_HUD.Apply.Piercing', {
        armor: resolution.armor,
        ap: resolution.armorPiercing
      }));
    }
    if (resolution.blocked) lines.push(format('DG_HUD.Apply.Blocked', {}));
    if (resolution.overkill > 0) lines.push(format('DG_HUD.Apply.Overkill', { overkill: resolution.overkill }));
  }

  lines.push(format('DG_HUD.Apply.Result', {
    target: target.name,
    applied: resolution.applied,
    before: resolution.hpBefore,
    after: resolution.hpAfter
  }));

  const heading = applied
    ? format('DG_HUD.Apply.HeadingApplied', {})
    : format('DG_HUD.Apply.HeadingProposed', {});

  const content = document.createElement('div');
  content.classList.add('dg-hud-apply');

  const title = document.createElement('strong');
  title.innerText = heading;
  content.appendChild(title);

  for (const line of lines) {
    const paragraph = document.createElement('p');
    // innerText, never innerHTML — actor names are user input (ARCH-3).
    paragraph.innerText = line;
    content.appendChild(paragraph);
  }

  if (!applied) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'dg-hud-apply-damage';
    button.innerText = format('DG_HUD.Apply.Button', { applied: resolution.applied });
    content.appendChild(button);
  }

  await globalThis.ChatMessage?.create({
    content: content.outerHTML,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
    flags: {
      [MODULE_ID]: {
        [APPLY_FLAG]: applied ? null : { actorUuid: actor.uuid, resolution }
      }
    }
  });
}

/**
 * Handle one completed roll.
 * @param {import('./roll-outcome.mjs').RollOutcome} outcome
 */
async function onRollOutcome(outcome) {
  if (!DAMAGING.has(outcome?.type)) return;

  const target = currentTarget();
  if (!target) {
    if ((globalThis.game?.user?.targets?.size ?? 0) > 1) {
      // Several targeted is a deliberate act the module cannot resolve, so it
      // says so (AUTO-5, UX-6). Silence here reads as a broken Apply button:
      // the player rolled damage at three things and nothing happened.
      notify('warn', 'DG_HUD.Notifications.SeveralTargets');
      return;
    }

    // Nothing targeted is different: rolling damage with no target is ordinary
    // play, and a notification on every such roll would be noise. AUTO-5's "say
    // so" applies once automation has engaged, which it has not.
    Logger.debug('Damage rolled with no target — automation stood down');
    return;
  }

  const proposal = proposeFrom(outcome, target);
  if (!proposal) return;

  if (!proposal.resolution.ok) {
    notify('warn', proposal.resolution.reason);
    return;
  }

  const mode = getDamageAutomation();
  const canWrite = Boolean(proposal.actor?.isOwner);

  // Auto-apply degrades to Propose when the acting user cannot write, rather
  // than failing (AUTO-4). A Handler clicking the button applies it.
  const applied = mode === 'auto' && canWrite
    ? await applyResolution(proposal.actor, proposal.resolution)
    : false;

  if (mode === 'auto' && !canWrite) {
    Logger.debug('Auto-apply degraded to propose: no permission on target');
  }

  await postCard({ ...proposal, applied });
}

/**
 * Bind the Apply button on a rendered chat message.
 * The write executes as whoever clicked, which is what makes rung B work.
 */
export function activateCardListeners(message, element) {
  const pending = message?.flags?.[MODULE_ID]?.[APPLY_FLAG];
  if (!pending) return;

  const button = element?.querySelector?.('[data-action="dg-hud-apply-damage"]');
  if (!button) return;

  button.addEventListener('click', async () => {
    button.disabled = true;
    const actor = await resolveUuid(pending.actorUuid);

    if (!actor) {
      notify('warn', 'DG_HUD.Notifications.TargetGone');
      button.disabled = false;
      return;
    }

    const ok = await applyResolution(actor, pending.resolution);
    if (!ok) {
      button.disabled = false;
      return;
    }

    // Clearing the flag retires the button so the same damage cannot be applied
    // twice by a second click elsewhere.
    await message.update({ [`flags.${MODULE_ID}.${APPLY_FLAG}`]: null });
  });
}

/** Subscribe to roll outcomes. Called once, from the composition root. */
export function registerAutomation() {
  return on(EVENTS.ROLL_OUTCOME, (outcome) => {
    onRollOutcome(outcome).catch((error) => Logger.error('Damage automation failed', error));
  });
}

/**
 * Resolve a document by uuid.
 *
 * `foundry.utils.fromUuid` is the form the Delta Green system itself uses
 * (`chat/dg-chat-card.js`); the bare global is the older spelling. Preferring
 * the namespaced one and falling back keeps this working either way.
 */
async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  return typeof resolver === 'function' ? resolver(uuid) : null;
}

function notify(level, key) {
  const message = globalThis.game?.i18n?.localize?.(key) ?? key;
  globalThis.ui?.notifications?.[level]?.(message);
}
