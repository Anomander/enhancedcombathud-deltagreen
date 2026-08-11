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

// Module instance singletons
let hudInstance = null;
let apiInstance = null;

Hooks.once('init', () => {
  console.log('Delta Green | Initializing Enhanced Combat HUD');
  registerSettings();
});

Hooks.once('ready', () => {
  hudInstance = new DeltaGreenCombatHudApp();
  apiInstance = new DeltaGreenCombatHudAPI(hudInstance);

  // Mount HUD to DOM
  hudInstance.mount(document.body);

  // Register public global API
  if (typeof game !== 'undefined') {
    const mod = game.modules.get(MODULE_ID);
    if (mod) mod.api = apiInstance;
  }

  if (typeof ui !== 'undefined') {
    ui.deltaGreenCombatHud = apiInstance;
  }
});

// Auto-open or update HUD on token control change
Hooks.on('controlToken', (token, controlled) => {
  if (!hudInstance) return;
  if (controlled) {
    hudInstance.controlledActor = token.actor;
    if (hudInstance.visible) hudInstance.render();
  }
});

// Update HUD on combat updates
Hooks.on('updateCombat', (combat, delta) => {
  if (!hudInstance) return;

  const autoOpen = typeof game !== 'undefined' ? game.settings.get(MODULE_ID, 'autoOpenCombat') : true;
  if (combat.started && autoOpen && !hudInstance.visible) {
    hudInstance.show();
  }

  if (hudInstance.visible) {
    hudInstance.render();
  }
});

// Render Token HUD control icon
Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.find((c) => c.name === 'token');
  if (tokenControls && Array.isArray(tokenControls.tools)) {
    tokenControls.tools.push({
      name: 'delta-green-combat-hud',
      title: 'DG_HUD.Controls.ToggleHudTitle',
      icon: 'fas fa-swords',
      visible: true,
      onClick: () => {
        if (ui.deltaGreenCombatHud) ui.deltaGreenCombatHud.toggle();
      },
      button: true
    });
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
