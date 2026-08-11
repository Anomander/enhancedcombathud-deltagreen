/**
 * Main entrypoint for Delta Green Enhanced Combat HUD module in Foundry VTT.
 */

import { registerSettings, MODULE_ID } from './settings.mjs';
import { DeltaGreenCombatHudApp } from './hud-app.mjs';
import { DeltaGreenCombatHudAPI } from './api.mjs';
import { extractVitals, extractSkills, extractWeapons, extractTacticalActions } from './actor-adapter.mjs';
import { evaluatePercentileRoll, evaluateLethalityRoll, spendWillpowerForBonus } from './roll-handler.mjs';
import { TargetManager } from './target-manager.mjs';
import { CombatTracker } from './combat-tracker.mjs';
import { Logger } from './logger.mjs';

// Module instance singletons
let hudInstance = null;
let apiInstance = null;

Hooks.once('init', () => {
  Logger.info('Initializing Enhanced Combat HUD');
  registerSettings();
});

Hooks.once('ready', () => {
  hudInstance = new DeltaGreenCombatHudApp();
  apiInstance = new DeltaGreenCombatHudAPI(hudInstance);

  // Mount HUD to DOM
  hudInstance.mount(document.body);
  Logger.debug('Mounted HUD element to DOM body');

  // Register public global API
  if (typeof game !== 'undefined') {
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = apiInstance;
  }

  if (typeof ui !== 'undefined') {
    ui.deltaGreenCombatHud = apiInstance;
  }
  Logger.debug('Registered global API instance ui.deltaGreenCombatHud');

  // Auto-show HUD if combat is already active on page load/refresh
  const autoOpen = typeof game !== 'undefined' && game.settings ? game.settings.get(MODULE_ID, 'autoOpenCombat') : true;
  const isCombatActive = typeof game !== 'undefined' && (game.combat?.started || (game.combats?.contents && game.combats.contents.some((c) => c.started)));
  if (autoOpen && isCombatActive) {
    Logger.debug('Active combat detected on page load/refresh — auto-showing HUD');
    hudInstance.show();
  }
});

// Auto-open or update HUD on token control change
Hooks.on('controlToken', (token, controlled) => {
  if (!hudInstance) return;
  Logger.debug('Hook: controlToken', { name: token?.name, controlled });
  if (controlled) {
    hudInstance.controlledActor = token.actor;
    if (hudInstance.visible) hudInstance.render();
  }
});

// Slide up on combat start
Hooks.on('combatStart', (combat) => {
  if (!hudInstance) return;
  const autoOpen = typeof game !== 'undefined' && game.settings ? game.settings.get(MODULE_ID, 'autoOpenCombat') : true;
  Logger.debug('Hook: combatStart', { combatId: combat.id, autoOpen });
  if (autoOpen) {
    hudInstance.show();
  }
});

// Slide down when combat ends / deleted
Hooks.on('deleteCombat', (combat) => {
  if (!hudInstance) return;
  const autoOpen = typeof game !== 'undefined' && game.settings ? game.settings.get(MODULE_ID, 'autoOpenCombat') : true;
  const remainingActive = typeof game !== 'undefined' && game.combats?.contents ? game.combats.contents.some((c) => c.id !== combat.id && c.started) : false;
  Logger.debug('Hook: deleteCombat', { combatId: combat.id, autoOpen, remainingActive });
  if (autoOpen && !remainingActive) {
    hudInstance.hide();
  }
});

// Update HUD on combat updates (round changes, turn changes, or combat state)
Hooks.on('updateCombat', (combat, delta) => {
  if (!hudInstance) return;

  const autoOpen = typeof game !== 'undefined' && game.settings ? game.settings.get(MODULE_ID, 'autoOpenCombat') : true;
  Logger.debug('Hook: updateCombat', { combatId: combat.id, round: combat.round, turn: combat.turn, started: combat.started, autoOpen });
  if (combat.started && autoOpen && !hudInstance.visible) {
    hudInstance.show();
  } else if (!combat.started && autoOpen && hudInstance.visible) {
    hudInstance.hide();
  }

  if (hudInstance.visible) {
    hudInstance.render();
  }
});

// Render Token HUD control icon
Hooks.on('getSceneControlButtons', (controls) => {
  try {
    let tokenGroup = null;
    if (Array.isArray(controls)) {
      tokenGroup = controls.find((c) => c.name === 'token');
    } else if (controls && typeof controls === 'object') {
      tokenGroup = controls.token || Object.values(controls).find((c) => c?.name === 'token');
    }

    if (!tokenGroup) return;

    const toolDef = {
      name: 'delta-green-combat-hud',
      title: 'DG_HUD.Controls.ToggleHudTitle',
      icon: 'fas fa-swords',
      visible: true,
      button: true,
      onClick: () => {
        if (ui.deltaGreenCombatHud) ui.deltaGreenCombatHud.toggle();
      },
      onChange: () => {
        if (ui.deltaGreenCombatHud) ui.deltaGreenCombatHud.toggle();
      }
    };

    if (Array.isArray(tokenGroup.tools)) {
      if (!tokenGroup.tools.some((t) => t.name === 'delta-green-combat-hud')) {
        tokenGroup.tools.push(toolDef);
      }
    } else if (tokenGroup.tools && typeof tokenGroup.tools === 'object') {
      tokenGroup.tools['delta-green-combat-hud'] = toolDef;
    }
  } catch (error) {
    console.error('Delta Green Combat HUD | Error adding control button:', error);
  }
});

export {
  hudInstance,
  apiInstance,
  DeltaGreenCombatHudApp,
  DeltaGreenCombatHudAPI,
  extractVitals,
  extractSkills,
  extractWeapons,
  extractTacticalActions,
  evaluatePercentileRoll,
  evaluateLethalityRoll,
  spendWillpowerForBonus,
  TargetManager,
  CombatTracker
};
