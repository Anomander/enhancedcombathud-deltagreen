/**
 * Reference drawer.
 *
 * Argon's drawer is a tabular surface, so it carries the things a player reads
 * during play rather than clicks: statistics, Bonds, and Motivations/Disorders.
 */

import { getActorItems } from '../actor-adapter.mjs';

/** Statistic keys, in the order Delta Green character sheets print them. */
const STATISTICS = ['str', 'con', 'dex', 'int', 'pow', 'cha'];

export function createDrawerPanel(ARGON) {
  return class DGDrawerPanel extends ARGON.DRAWER.DrawerPanel {
    get title() {
      return game.i18n.localize('DG_HUD.Drawer.Title');
    }

    get categories() {
      const panels = [this.#statisticsPanel()];

      const bonds = this.#bondsPanel();
      if (bonds) panels.push(bonds);

      const motivations = this.#motivationsPanel();
      if (motivations) panels.push(motivations);

      return panels;
    }

    /** A two-column row: label on the left, value right-aligned. */
    #row(label, value) {
      return {
        gridCols: '7fr 3fr',
        captions: [{ label }, { label: String(value), align: 'right' }]
      };
    }

    #statisticsPanel() {
      const stats = this.actor?.system?.statistics ?? {};

      const rows = STATISTICS.filter((key) => stats[key]).map((key) => {
        const stat = stats[key];
        const x5 = stat.x5 ?? stat.value * 5;
        return this.#row(game.i18n.localize(`DG_HUD.Stats.${key}`), `${stat.value} (${x5}%)`);
      });

      return { title: game.i18n.localize('DG_HUD.Drawer.Statistics'), categories: rows };
    }

    #bondsPanel() {
      const bonds = getActorItems(this.actor).filter((item) => item.type === 'bond');
      if (!bonds.length) return null;

      const rows = bonds.map((bond) => {
        const damaged = bond.system?.hasBeenDamagedSinceLastHomeScene;
        const name = damaged ? `${bond.name} †` : bond.name;
        return this.#row(name, bond.system?.score ?? 0);
      });

      return { title: game.i18n.localize('DG_HUD.Drawer.Bonds'), categories: rows };
    }

    #motivationsPanel() {
      const motivations = getActorItems(this.actor).filter((item) => item.type === 'motivation');
      if (!motivations.length) return null;

      const rows = motivations.map((motivation) => {
        const sys = motivation.system ?? {};
        let state = '';

        if (sys.disorder) {
          if (sys.acuteEpisode) state = game.i18n.localize('DG_HUD.Drawer.AcuteEpisode');
          else if (sys.disorderCured) state = game.i18n.localize('DG_HUD.Drawer.Cured');
          else state = sys.disorder;
        }

        return this.#row(sys.crossedOut ? `${motivation.name} ✗` : motivation.name, state);
      });

      return { title: game.i18n.localize('DG_HUD.Drawer.Motivations'), categories: rows };
    }
  };
}
