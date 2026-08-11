/**
 * Settings registration for Delta Green Enhanced Combat HUD.
 */

export const MODULE_ID = 'delta-green-combat-hud';

export function registerSettings() {
  if (typeof game === 'undefined' || !game.settings) return;

  // Auto-open HUD on combat start
  game.settings.register(MODULE_ID, 'autoOpenCombat', {
    name: 'DG_HUD.Settings.AutoOpenCombatName',
    hint: 'DG_HUD.Settings.AutoOpenCombatHint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  // HUD Dock Position
  game.settings.register(MODULE_ID, 'hudPosition', {
    name: 'DG_HUD.Settings.HudPositionName',
    hint: 'DG_HUD.Settings.HudPositionHint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      bottom: 'DG_HUD.Settings.PosBottom',
      top: 'DG_HUD.Settings.PosTop'
    },
    default: 'bottom'
  });

  // Aesthetic Theme
  game.settings.register(MODULE_ID, 'theme', {
    name: 'DG_HUD.Settings.ThemeName',
    hint: 'DG_HUD.Settings.ThemeHint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      'dark-green': 'DG_HUD.Settings.ThemeDarkGreen',
      'classified-amber': 'DG_HUD.Settings.ThemeClassifiedAmber',
      'monochrome': 'DG_HUD.Settings.ThemeMonochrome'
    },
    default: 'dark-green'
  });

  // Enable Willpower Boost
  game.settings.register(MODULE_ID, 'enableWpBoost', {
    name: 'DG_HUD.Settings.EnableWpBoostName',
    hint: 'DG_HUD.Settings.EnableWpBoostHint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  // Willpower Boost Cost
  game.settings.register(MODULE_ID, 'wpBoostCost', {
    name: 'DG_HUD.Settings.WpBoostCostName',
    hint: 'DG_HUD.Settings.WpBoostCostHint',
    scope: 'world',
    config: true,
    type: Number,
    default: 1
  });

  // Willpower Boost Percentage
  game.settings.register(MODULE_ID, 'wpBoostPercent', {
    name: 'DG_HUD.Settings.WpBoostPercentName',
    hint: 'DG_HUD.Settings.WpBoostPercentHint',
    scope: 'world',
    config: true,
    type: Number,
    default: 20
  });

  // Register Shift+A keybinding
  if (game.keybindings) {
    game.keybindings.register(MODULE_ID, 'toggleHud', {
      name: 'DG_HUD.Keybinds.ToggleHud',
      editable: [
        {
          key: 'KeyA',
          modifiers: ['Shift']
        }
      ],
      onDown: () => {
        if (ui.deltaGreenCombatHud) {
          ui.deltaGreenCombatHud.toggle();
        }
        return true;
      }
    });
  }
}
