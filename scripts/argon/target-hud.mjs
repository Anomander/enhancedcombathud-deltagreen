/**
 * Who you are pointing at.
 *
 * Targeting drives damage resolution, and until recently it was invisible:
 * nothing in the HUD said whether a target was set, who it was, or why
 * automation had declined. This fills Argon's `ButtonHud` slot — one of its
 * eight sanctioned extension points, and otherwise unused — rather than
 * inventing chrome (ARCH-1, ARCH-4).
 *
 * It shows the target's **token art** in a reticle. Never hit points, never
 * condition, and never the *actor's* portrait: the token is already on the
 * canvas, an actor portrait may be a face the Handler has not revealed. The
 * disclosure rules live in `targeting.mjs` so they can be tested (UX-5's
 * reasoning applied to tokens).
 */

import { describeTargets } from '../targeting.mjs';

/**
 * Argon's ButtonHud renders `icon` as Font Awesome *classes* — the opposite of
 * ItemButton and ActionButton, where `icon` is an image path used as a CSS
 * background. Same framework, opposite conventions.
 */
const ICONS = {
  retarget: 'fa-solid fa-crosshairs',
  empty: 'fa-solid fa-crosshairs'
};

/** Shown when a token carries no art of its own. */
const FALLBACK_IMAGE = 'icons/svg/mystery-man.svg';

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
 * Switch the canvas to the targeting tool.
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

/** Drop whatever is targeted and let the player pick again. */
function retarget() {
  clearTargets();
  startTargeting();
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

    /**
     * The reticle: token art framed as a crosshair, or an empty ring when there
     * is nothing targeted. Built as DOM rather than markup — actor names are
     * user input, and nothing here is ever parsed as HTML (ARCH-3).
     */
    #reticle(state) {
      const reticle = document.createElement('div');
      reticle.classList.add('dg-target-reticle');
      reticle.dataset.state = state.kind;

      if (state.kind === 'one') {
        const portrait = document.createElement('img');
        portrait.classList.add('dg-target-portrait');
        portrait.src = state.image ?? FALLBACK_IMAGE;
        // Decorative: the name is already stated beneath it.
        portrait.alt = '';
        reticle.appendChild(portrait);
        return reticle;
      }

      if (state.kind === 'many') {
        const count = document.createElement('span');
        count.classList.add('dg-target-count');
        count.innerText = String(state.count);
        reticle.appendChild(count);
        return reticle;
      }

      const glyph = document.createElement('i');
      glyph.classList.add(...ICONS.empty.split(' '));
      reticle.appendChild(glyph);
      return reticle;
    }

    /** Who it is — or that it is nobody. */
    #caption(state) {
      const caption = document.createElement('div');
      caption.classList.add('dg-target-name');
      caption.dataset.state = state.kind;

      if (state.kind === 'many') {
        caption.innerText = game.i18n.format('DG_HUD.Target.Many', { count: state.count });
      } else if (state.kind === 'one') {
        // A name the viewer may not see is reported as absent, not guessed at.
        caption.innerText = state.name ?? game.i18n.localize('DG_HUD.Target.Hidden');
      } else {
        caption.innerText = game.i18n.localize('DG_HUD.Target.None');
      }

      return caption;
    }

    /**
     * Draw the reticle and caption.
     *
     * Replaces the base implementation rather than extending it: that one
     * fetches `ButtonHud.hbs` and assigns its contents, and we have our own
     * structure. `replaceChildren()` rather than clearing `innerHTML` (ARCH-3).
     */
    async _renderInner() {
      const state = this.state;

      this.element.replaceChildren();
      this.element.dataset.state = state.kind;
      this.element.appendChild(this.#reticle(state));
      this.element.appendChild(this.#caption(state));

      this.setColorScheme();
      this.setVisibility();
    }

    /**
     * One control, in both states — so it always acts (UX-1). Argon builds,
     * styles and wires it; we only say what it is.
     */
    async _getButtons() {
      return [
        {
          icon: ICONS.retarget,
          label:
            this.state.kind === 'none'
              ? 'DG_HUD.Target.Select'
              : 'DG_HUD.Target.Retarget',
          onClick: retarget
        }
      ];
    }

    /**
     * Undo ButtonHud's grid and stack the reticle, caption and control.
     *
     * Set inline rather than in the stylesheet, because **Argon writes this
     * element's layout inline itself** — `ButtonHud.render` assigns
     * `display: grid` and grid rows sized to the button count. A stylesheet
     * cannot beat an inline declaration, and in practice Argon's own rules also
     * won `justify-content` and the button's `flex` against our classes. Layout
     * therefore lives here; everything purely visual stays in CSS.
     */
    async render(...args) {
      await super.render(...args);

      Object.assign(this.element.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // Centred, not bottom-aligned: the portrait's vitals bar runs along the
        // bottom of this row, and a control pushed against it reads as spill.
        justifyContent: 'center',
        gridTemplateRows: '',
        gridTemplateColumns: ''
      });

      // Sized for a grid row by Argon; in a column it would otherwise absorb
      // all the leftover height and leave the control floating in dead space.
      for (const button of this.element.querySelectorAll('.button-hud-button')) {
        button.style.flex = '0 0 auto';
        button.style.height = 'auto';
        button.style.width = '100%';

        // The column is narrow; "Select target" must wrap rather than clip.
        const label = button.querySelector('span');
        if (label) {
          Object.assign(label.style, {
            whiteSpace: 'normal',
            maxWidth: '100%',
            textAlign: 'center',
            lineHeight: '1.1'
          });
        }
      }
    }
  };
}
