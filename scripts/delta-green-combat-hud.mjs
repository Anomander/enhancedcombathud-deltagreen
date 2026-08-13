/**
 * Entrypoint — the composition root.
 *
 * The only file that wires layers together: it installs settings, hands the
 * presentation layer its registration hook, subscribes the automation layer to
 * roll outcomes, and publishes the API. It holds no logic of its own (ARCH-6).
 *
 * Argon owns HUD visibility, position, theming and the toggle keybinding, so
 * there are no combat or token hooks here (ARCH-1).
 */

import { registerSettings, MODULE_ID } from './settings.mjs';
import { registerArgonComponents } from './argon/register.mjs';
import { DeltaGreenCombatHudAPI } from './api.mjs';
import { registerAutomation, activateCardListeners } from './automation.mjs';
import { EVENTS, on } from './events.mjs';
import { Logger } from './logger.mjs';

Hooks.once('init', () => {
  registerSettings();
  registerAutomation();

  // Republish roll outcomes as a Foundry hook, so other modules — Sequencer
  // effects among them — can attach without importing anything of ours (FR-25).
  on(EVENTS.ROLL_OUTCOME, (outcome) => Hooks.callAll(`${MODULE_ID}.rollOutcome`, outcome));

  Logger.info('Initialised');
});

Hooks.on('argonInit', (CoreHUD) => {
  registerArgonComponents(CoreHUD);
});

// Binds the Apply button on a damage proposal. The write runs as whoever clicks,
// which is what lets a Handler apply a player's roll without a socket relay.
Hooks.on('renderChatMessageHTML', (message, element) => {
  activateCardListeners(message, element);
});

Hooks.once('ready', () => {
  const api = new DeltaGreenCombatHudAPI();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  ui.deltaGreenCombatHud = api;
});
