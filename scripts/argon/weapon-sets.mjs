/**
 * Weapon sets.
 *
 * Argon persists the player's chosen sets to actor flags and handles drag-drop
 * itself; the only thing a system module supplies is a sensible starting layout.
 */

import { extractWeapons, getActorItems } from '../actor-adapter.mjs';

export function createWeaponSets(ARGON) {
  return class DGWeaponSets extends ARGON.WeaponSets {
    /**
     * Seed set 1 with the actor's equipped weapons so the HUD is useful before
     * anyone configures anything. Argon merges saved flags over this.
     */
    async getDefaultSets() {
      const defaults = await super.getDefaultSets();

      const items = getActorItems(this.actor);
      const equipped = extractWeapons(this.actor)
        .filter((weapon) => weapon.equipped)
        .map((weapon) => items.find((item) => (item.id ?? item._id) === weapon.id))
        .filter((item) => item?.uuid);

      if (equipped[0]) defaults[1].primary = equipped[0].uuid;
      if (equipped[1]) defaults[1].secondary = equipped[1].uuid;

      return defaults;
    }

    /**
     * Switching sets equips that set's weapons and unequips the rest, which is
     * what drives the Attacks panel.
     *
     * Abstract on the base class — Argon logs "not implemented" until a system
     * supplies it.
     */
    async _onSetChange({ sets, active }) {
      const activeSet = sets?.[active] ?? {};
      const activeIds = new Set([activeSet.primary?.id, activeSet.secondary?.id].filter(Boolean));

      // An unconfigured set would otherwise silently unequip everything the Agent
      // is carrying, which reads as the HUD losing their weapons (UX-1).
      if (!activeIds.size) return;

      const updates = getActorItems(this.actor)
        .filter((item) => item.type === 'weapon')
        .map((item) => ({ item, equipped: activeIds.has(item.id) }))
        .filter(({ item, equipped }) => Boolean(item.system?.equipped) !== equipped)
        .map(({ item, equipped }) => ({ _id: item.id, 'system.equipped': equipped }));

      if (!updates.length) return;

      await this.actor.updateEmbeddedDocuments('Item', updates);

      // Argon's `updateItem` path only re-renders buttons whose item already
      // matches — it never re-runs a panel's `_getButtons()`. Without an explicit
      // refresh, a newly equipped weapon does not appear in the Attacks panel
      // until the HUD rebinds (which is why switching actors "fixed" it).
      await ui.ARGON.refresh();
    }
  };
}
