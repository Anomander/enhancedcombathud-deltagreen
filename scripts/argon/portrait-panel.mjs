/**
 * Agent portrait panel.
 *
 * Argon writes stat blocks with `innerText`, so actor names and stats cannot
 * inject markup (ARCH-3). Stats the actor type does not have are omitted rather
 * than defaulted (SYS-5): an Unnatural shows no Sanity row at all.
 */

import { extractVitals } from '../actor-adapter.mjs';

/** Delta Green: 0 HP or less is incapacitated and dying. */
const DYING_THRESHOLD = 2;

/**
 * @param {object} ARGON - The CONFIG.ARGON namespace, available at argonInit.
 * @returns {typeof ARGON.PORTRAIT.PortraitPanel}
 */
export function createPortraitPanel(ARGON) {
  return class DGPortraitPanel extends ARGON.PORTRAIT.PortraitPanel {
    get classes() {
      return [...super.classes, 'dg-portrait'];
    }

    get name() {
      return this.actor?.name ?? '';
    }

    get image() {
      return this.actor?.img ?? 'icons/svg/mystery-man.svg';
    }

    get description() {
      const sys = this.actor?.system ?? {};
      return sys.biography?.profession || sys.shortDescription || '';
    }

    get isDead() {
      const { hp } = extractVitals(this.actor);
      return hp.available && hp.value <= 0;
    }

    get isDying() {
      const { hp } = extractVitals(this.actor);
      return hp.available && hp.value > 0 && hp.value <= DYING_THRESHOLD;
    }

    /**
     * Delta Green has no death-save mechanic — an Agent at 0 HP is dying and
     * needs First Aid. Overridden so the base class does not log "not implemented",
     * and left inert rather than rendering a control that does nothing (UX-1).
     */
    async _onDeathSave() {}

    /**
     * Vitals rows beneath the portrait. Each entry is `{text, color, id}` and is
     * written with innerText by Argon.
     */
    async getStatBlocks() {
      const vitals = extractVitals(this.actor);
      const blocks = [];

      const resources = [];
      if (vitals.hp.available) {
        resources.push({
          text: `${game.i18n.localize('DG_HUD.Vitals.HP')} ${vitals.hp.value}/${vitals.hp.max}`,
          color: this.#resourceColor(vitals.hp.percentage),
          id: 'dg-hp'
        });
      }
      if (vitals.wp.available) {
        resources.push({
          text: `${game.i18n.localize('DG_HUD.Vitals.WP')} ${vitals.wp.value}/${vitals.wp.max}`,
          color: this.#resourceColor(vitals.wp.percentage),
          id: 'dg-wp'
        });
      }
      if (resources.length) blocks.push(resources);

      // Sanity and Breaking Point exist on agent and npc only, and may be masked
      // by the system's keepSanityPrivate setting (UX-5).
      if (vitals.san.available) {
        const sanity = [];

        sanity.push({
          text: vitals.san.private
            ? `${game.i18n.localize('DG_HUD.Vitals.SAN')} ${game.i18n.localize('DG_HUD.Vitals.Hidden')}`
            : `${game.i18n.localize('DG_HUD.Vitals.SAN')} ${vitals.san.value}/${vitals.san.max}`,
          color: vitals.san.private ? null : this.#resourceColor(vitals.san.percentage),
          id: 'dg-san'
        });

        if (vitals.breakingPoint !== null) {
          sanity.push({
            text: `${game.i18n.localize('DG_HUD.Vitals.BP')} ${vitals.breakingPoint}`,
            color: vitals.breakingPointHit ? 'var(--dg-hud-critical, #cc4436)' : null,
            id: 'dg-bp'
          });
        }

        blocks.push(sanity);
      }

      if (vitals.armor > 0) {
        blocks.push([
          {
            text: `${game.i18n.localize('DG_HUD.Vitals.Armor')} ${vitals.armor}`,
            color: null,
            id: 'dg-armor'
          }
        ]);
      }

      return blocks;
    }

    /** Warn as a resource depletes; null keeps Argon's default colour. */
    #resourceColor(percentage) {
      if (percentage <= 25) return 'var(--dg-hud-critical, #cc4436)';
      if (percentage <= 50) return 'var(--dg-hud-warning, #c8a02e)';
      return null;
    }
  };
}
