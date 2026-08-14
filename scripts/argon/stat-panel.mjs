/**
 * Statistics panel.
 *
 * STR, CON, DEX, INT, POW and CHA behind one button, each rolling its own x5
 * test through the system (SYS-3). They used to be printed in the drawer, which
 * is a reading surface — a statistic test is a thing a player does, not a thing
 * they look up, so it belongs on a control.
 */

import { extractStatistics } from '../actor-adapter.mjs';
import { rollService } from '../roll-service.mjs';
import { addMonogram } from './tile-monogram.mjs';

/**
 * Argon renders a button's `icon` as a CSS background-image, so this is an image
 * path and not a Font Awesome class. See ActionButton._renderInner.
 */
const STATISTICS_ICON = 'icons/svg/statue.svg';

export function createStatPanel(ARGON) {
  /** One statistic test. */
  class DGStatButton extends ARGON.MAIN.BUTTONS.ActionButton {
    constructor(statistic) {
      super();
      this.statistic = statistic;
    }

    get classes() {
      return [...super.classes, 'dg-stat-button'];
    }

    get name() {
      return game.i18n.localize(this.statistic.labelKey);
    }

    /** e.g. "Dexterity 13 (65%)" — the score, and the target it rolls against. */
    get label() {
      return `${this.name} ${this.statistic.value} (${this.statistic.x5}%)`;
    }

    get hasTooltip() {
      return true;
    }

    async getTooltipData() {
      return {
        title: this.name,
        subtitle: `${this.statistic.x5}%`
      };
    }

    async _renderInner() {
      await super._renderInner();
      addMonogram(this.element, this.name);
    }

    async _onLeftClick(event) {
      await rollService.rollStat({
        actor: this.actor,
        token: this.token,
        statKey: this.statistic.key,
        event
      });
    }
  }

  /**
   * Opens the statistics list. ButtonPanelButton takes no constructor arguments —
   * subclasses supply `label`, `icon` and the panel itself via `_getPanel()`.
   */
  class DGStatsButton extends ARGON.MAIN.BUTTONS.ButtonPanelButton {
    get label() {
      return 'DG_HUD.Panels.Statistics';
    }

    get icon() {
      return STATISTICS_ICON;
    }

    async _getPanel() {
      const { ButtonPanel } = ARGON.MAIN.BUTTON_PANELS;

      // Six buttons and no categories, so a flat panel rather than the skill
      // list's accordion. The id lets Argon remember whether it was left open.
      return new ButtonPanel({
        id: 'dg-statistics',
        buttons: extractStatistics(this.actor).map((statistic) => new DGStatButton(statistic))
      });
    }
  }

  /** All statistics, behind a single button. */
  class DGStatPanel extends ARGON.MAIN.ActionPanel {
    get classes() {
      return [...super.classes, 'dg-stat-panel'];
    }

    get label() {
      return 'DG_HUD.Panels.Statistics';
    }

    get colorScheme() {
      return 2; // free action — a statistic test costs nothing on its own
    }

    async _getButtons() {
      // Nothing to open on an actor with no statistics, so no button (UX-1).
      return extractStatistics(this.actor).length ? [new DGStatsButton()] : [];
    }
  }

  return { DGStatPanel };
}
