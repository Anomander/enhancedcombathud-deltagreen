/**
 * Who you are pointing at.
 *
 * Targeting drives damage resolution, and until now it was invisible: nothing in
 * the HUD said whether a target was set, who it was, or why automation had
 * declined. This fills Argon's `ButtonHud` slot — one of its eight sanctioned
 * extension points, and previously unused — rather than inventing chrome
 * (ARCH-1, ARCH-4).
 *
 * It reports names only, never hit points or condition. What a Delta Green
 * Handler chooses to withhold about an adversary stays withheld; the disclosure
 * rules live in `targeting.mjs` so they can be tested (UX-5's reasoning applied
 * to tokens).
 */

import { describeTargets } from '../targeting.mjs';

/**
 * Argon's ButtonHud renders `icon` as Font Awesome *classes* — the opposite of
 * ItemButton and ActionButton, where `icon` is an image path used as a CSS
 * background. Same framework, opposite convention.
 */
const ICONS = {
  none: 'fa-solid fa-crosshairs',
  one: 'fa-solid fa-bullseye',
  many: 'fa-solid fa-triangle-exclamation'
};

/**
 * Clear every target this user holds.
 *
 * Via `Token#setTarget`, which is what Argon's own TargetPicker uses. Foundry
 * v14's `User` exposes no public bulk setter — `updateTokenTargets` is gone and
 * only the private `_onUpdateTokenTargets` remains. The set is copied first
 * because untargeting mutates it while iterating.
 */
function clearTargets() {
  for (const token of [...(game.user?.targets ?? [])]) {
    token.setTarget(false, { releaseOthers: false });
  }
}

/**
 * Switch the canvas to the targeting tool, so the button does something useful
 * when there is nothing to report (UX-1).
 *
 * `ui.controls.activate` is the supported route; Argon's own TargetPicker clicks
 * the tool in the DOM, which is the fallback if the API moves again.
 */
function startTargeting() {
  if (typeof ui.controls?.activate === 'function') {
    ui.controls.activate({ control: 'tokens', tool: 'target' });
    return;
  }
  document.querySelector('.control.tool[data-tool="target"]')?.click();
}

export function createTargetHud(ARGON) {
  return class DGTargetHud extends ARGON.ButtonHud {
    get classes() {
      return [...super.classes, 'dg-target-hud'];
    }

    /** The current state, read fresh on every render. */
    get state() {
      const targets = Array.from(game.user?.targets ?? []);
      return describeTargets(targets, { isGM: game.user?.isGM });
    }

    async _getButtons() {
      const { kind, count, name } = this.state;

      if (kind === 'many') {
        return [
          {
            icon: ICONS.many,
            label: game.i18n.format('DG_HUD.Target.Many', { count }),
            color: 'var(--dg-hud-warning, #c8a02e)',
            onClick: clearTargets
          }
        ];
      }

      if (kind === 'one') {
        return [
          {
            icon: ICONS.one,
            // A name the viewer may not see is reported as absent, not guessed at.
            label: name ?? game.i18n.localize('DG_HUD.Target.Hidden'),
            onClick: clearTargets
          }
        ];
      }

      return [
        {
          icon: ICONS.none,
          label: game.i18n.localize('DG_HUD.Target.None'),
          onClick: startTargeting
        }
      ];
    }
  };
}
