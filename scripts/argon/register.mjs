/**
 * Argon Core registration.
 *
 * Component classes are built inside the `argonInit` handler because their base
 * classes live on `CONFIG.ARGON`, which only exists once Argon is ready (ARCH-2).
 */

import { SUPPORTED_ACTOR_TYPES } from '../actor-adapter.mjs';
import { registerHost } from '../host.mjs';
import { createPortraitPanel } from './portrait-panel.mjs';
import { createWeaponPanel } from './weapon-panel.mjs';
import { createSkillPanels } from './skill-panels.mjs';
import { createDrawerPanel } from './drawer-panel.mjs';
import { createWeaponSets } from './weapon-sets.mjs';
import { createMovementHud } from './movement-hud.mjs';
import { createTargetHud } from './target-hud.mjs';
import { Logger } from '../logger.mjs';

/**
 * Register every Delta Green component with Argon Core.
 * @param {object} CoreHUD - The CoreHud class, passed by the argonInit hook.
 */
export function registerArgonComponents(CoreHUD) {
  const ARGON = CONFIG.ARGON;

  // The core reaches the HUD only through this (ARCH-6). Live getters, because
  // Argon rebinds `_actor` as the player selects tokens.
  registerHost({
    get actor() {
      return ui.ARGON?._actor ?? null;
    },
    get token() {
      return ui.ARGON?._token ?? null;
    },
    get isVisible() {
      return Boolean(ui.ARGON?.enabled);
    },
    toggle(token = null) {
      return ui.ARGON?.toggle(token);
    },
    refresh() {
      return ui.ARGON?.refresh();
    }
  });

  const { DGWeaponPanel } = createWeaponPanel(ARGON);
  const { DGSkillPanel, DGReactionPanel, DGSanityPanel } = createSkillPanels(ARGON);

  CoreHUD.definePortraitPanel(createPortraitPanel(ARGON));
  CoreHUD.defineDrawerPanel(createDrawerPanel(ARGON));
  CoreHUD.defineWeaponSets(createWeaponSets(ARGON));

  CoreHUD.defineMainPanels([
    DGWeaponPanel,
    DGReactionPanel,
    DGSkillPanel,
    DGSanityPanel,
    ARGON.PREFAB.PassTurnPanel
  ]);

  // `vehicle` is excluded: it has no Willpower, Sanity or skills.
  CoreHUD.defineSupportedActorTypes(SUPPORTED_ACTOR_TYPES);

  // Must be registered, not omitted: Argon falls back to its own MovementHud,
  // which renders "NaN" for a system that supplies no movementMax.
  CoreHUD.defineMovementHud(createMovementHud(ARGON));

  // Targeting drives damage resolution, so it needs to be visible.
  CoreHUD.defineButtonHud(createTargetHud(ARGON));

  // Argon re-renders on actor, item, token and combat changes, but not on
  // targeting — nothing in its own HUD depends on it. Registered here, once, and
  // not inside the component: Argon rebuilds components on every render, so a
  // hook bound in a constructor would accumulate a listener per render.
  Hooks.on('targetToken', (user) => {
    if (user !== game.user) return;
    ui.ARGON?.components?.buttonHud?.render();
  });

  Logger.info('Registered Delta Green components with Argon Core');
}
