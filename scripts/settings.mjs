/**
 * Settings registration for Delta Green Enhanced Combat HUD.
 *
 * Argon Core owns HUD position, theming, visibility and the toggle keybinding
 * (Shift+A), so this module registers none of those (ARCH-1, ARCH-4). Every
 * setting here has a reader — a setting with no effect is deleted, not left
 * registered (UX-2).
 */

/**
 * Argon Core discovers its system module by id: it looks up
 * `enhancedcombathud-${game.system.id}` and shows a permanent error if that
 * module is not active (CoreHud.js performModuleCheck). The id is therefore
 * fixed by Argon's convention and must not be renamed.
 */
export const MODULE_ID = 'enhancedcombathud-deltagreen';

export function registerSettings() {
  if (!globalThis.game?.settings) return;

  // --- Willpower Boost -------------------------------------------------------
  // A house rule, not core Delta Green: spend WP for a percentile bonus.
  // Defaults off so a stock game matches the book.
  game.settings.register(MODULE_ID, 'enableWpBoost', {
    name: 'DG_HUD.Settings.EnableWpBoostName',
    hint: 'DG_HUD.Settings.EnableWpBoostHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, 'wpBoostCost', {
    name: 'DG_HUD.Settings.WpBoostCostName',
    hint: 'DG_HUD.Settings.WpBoostCostHint',
    scope: 'world',
    config: true,
    type: Number,
    default: 1
  });

  game.settings.register(MODULE_ID, 'wpBoostPercent', {
    name: 'DG_HUD.Settings.WpBoostPercentName',
    hint: 'DG_HUD.Settings.WpBoostPercentHint',
    scope: 'world',
    config: true,
    type: Number,
    default: 20
  });

  // --- Damage automation -----------------------------------------------------
  // Two modes, never three (AUTO-1). Both run the same resolution; the mode
  // decides only where it commits. Propose is the default because a click by a
  // human is the safe commit point for a write to someone else's Agent.
  game.settings.register(MODULE_ID, 'damageAutomation', {
    name: 'DG_HUD.Settings.DamageAutomationName',
    hint: 'DG_HUD.Settings.DamageAutomationHint',
    scope: 'world',
    config: true,
    type: String,
    choices: {
      propose: 'DG_HUD.Settings.DamageAutomationPropose',
      auto: 'DG_HUD.Settings.DamageAutomationAuto'
    },
    default: 'propose'
  });

  // --- Diagnostics -----------------------------------------------------------
  game.settings.register(MODULE_ID, 'debugMode', {
    name: 'DG_HUD.Settings.DebugModeName',
    hint: 'DG_HUD.Settings.DebugModeHint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * How far damage automation goes.
 * @returns {'propose'|'auto'}
 */
export function getDamageAutomation() {
  const settings = globalThis.game?.settings;
  if (!settings) return 'propose';

  const mode = settings.get(MODULE_ID, 'damageAutomation');
  return mode === 'auto' ? 'auto' : 'propose';
}

/**
 * Read the Willpower Boost configuration.
 * @returns {{enabled: boolean, cost: number, percent: number}}
 */
export function getWpBoostSettings() {
  const settings = globalThis.game?.settings;
  if (!settings) return { enabled: false, cost: 1, percent: 20 };

  return {
    enabled: Boolean(settings.get(MODULE_ID, 'enableWpBoost')),
    cost: Number(settings.get(MODULE_ID, 'wpBoostCost')),
    percent: Number(settings.get(MODULE_ID, 'wpBoostPercent'))
  };
}
