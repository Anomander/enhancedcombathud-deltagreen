/**
 * Weapon sets, and the Willpower Boost control that shares their line.
 *
 * Argon persists the player's chosen sets to actor flags and handles drag-drop
 * itself; the only thing a system module supplies is a sensible starting layout.
 *
 * Willpower Boost sits on this row rather than in the action bar because it
 * rolls nothing — it arms a modifier for the next roll. This line already holds
 * standing state a player sets and forgets, which is exactly what an armed boost
 * is, and there is room on it between the sets and Argon's own player buttons.
 */

import { getActorItems } from '../actor-adapter.mjs';
import { rollService } from '../roll-service.mjs';
import { getWpBoostSettings } from '../settings.mjs';
import { planLoadout, planSeedWrite, pruneWeaponSets, seedWeaponSets } from '../weapon-sets.mjs';

/** The sets are Argon's data, in Argon's flag scope. This module only tends them. */
const ARGON_SCOPE = 'enhancedcombathud';
const SETS_FLAG = 'weaponSets';

/**
 * Actors whose seed is mid-write. Argon renders this component more than once
 * during a bind, and each render calls `getDefaultSets`; without this the first
 * write is still in flight when the second render decides to make it again.
 */
const seeding = new Set();

export function createWeaponSets(ARGON) {
  return class DGWeaponSets extends ARGON.WeaponSets {
    /** Built as an element, never as markup (ARCH-3). */
    async _renderInner() {
      await super._renderInner();

      // Only rendered when the house rule is switched on (UX-2).
      if (!getWpBoostSettings().enabled) return;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.classList.add('dg-wp-boost');
      chip.setAttribute('aria-label', game.i18n.localize('DG_HUD.Actions.WillpowerBoostTitle'));
      chip.addEventListener('click', (event) => this.#onBoostClick(event, chip));

      // Two lines, because the row is 50px tall but only ~85px wide before
      // Argon's own player buttons: stacking keeps the control legible without
      // reaching across them, and keeps its width steady when the label changes.
      for (const part of ['tag', 'bonus']) {
        const line = document.createElement('span');
        line.classList.add(`dg-wp-boost-${part}`);
        chip.appendChild(line);
      }

      this.#describeBoost(chip);
      this.element.appendChild(chip);
    }

    /** Write the control's current state onto it. */
    #describeBoost(chip) {
      const { cost, percent } = getWpBoostSettings();
      const armed = rollService.isBoostArmed(this.actor);

      chip.classList.toggle('dg-boost-armed', armed);
      chip.setAttribute('aria-pressed', String(armed));

      // The control states the bonus; what it costs and when belongs in the hint.
      chip.title = game.i18n.format(
        armed ? 'DG_HUD.Actions.WillpowerBoostArmedHint' : 'DG_HUD.Actions.WillpowerBoostHint',
        { cost, percent }
      );
      chip.querySelector('.dg-wp-boost-tag').textContent = game.i18n.localize(
        armed ? 'DG_HUD.Actions.WillpowerBoostArmedTag' : 'DG_HUD.Actions.WillpowerBoostTag'
      );
      chip.querySelector('.dg-wp-boost-bonus').textContent = game.i18n.format(
        'DG_HUD.Actions.WillpowerBoostBonus',
        { percent }
      );
    }

    /**
     * A toggle, not a purchase — the Willpower is not taken until a roll actually
     * happens, so clicking again disarms at no cost.
     *
     * The control is updated in place rather than by re-rendering this component:
     * `WeaponSets.activateListeners` re-runs `_onSetChange` on every render, which
     * equips items and refreshes the whole HUD. Arming a boost must not touch the
     * Agent's weapons.
     */
    async #onBoostClick(event, chip) {
      event.preventDefault();
      event.stopPropagation();

      const result = rollService.toggleWillpowerBoost(this.actor);

      if (result.reason) {
        // Refusals explain themselves rather than failing silently (UX-6).
        ui.notifications.warn(game.i18n.localize(result.reason));
        return;
      }

      if (result.armed) {
        ui.notifications.info(
          game.i18n.format('DG_HUD.Notifications.WpBoostArmed', { bonus: result.bonus })
        );
      }

      this.#describeBoost(chip);
    }

    /**
     * Seed set 1 with the actor's equipped weapons so the HUD is useful before
     * anyone configures anything — then persist that seed and stop seeding.
     *
     * Argon calls this on every render and merges the saved flags over the
     * result, so anything left here as a live default keeps recomputing. That is
     * fatal for this particular default, because it is computed from what is
     * equipped and switching sets is precisely what changes that
     * (see `planSeedWrite`).
     */
    async getDefaultSets() {
      const defaults = await super.getDefaultSets();
      const actor = this.actor;
      if (!actor) return defaults;

      const seeded = seedWeaponSets(defaults, getActorItems(actor));
      const write = planSeedWrite(actor.getFlag(ARGON_SCOPE, SETS_FLAG), seeded);

      // The player already owns set 1 — their data governs, not a fresh guess.
      if (!write) return defaults;

      // A Handler looking at someone else's Agent still sees the seed; only the
      // owner's client writes it (AUTO-4).
      if (!actor.isOwner || seeding.has(actor.id)) return seeded;

      seeding.add(actor.id);
      try {
        await actor.setFlag(ARGON_SCOPE, SETS_FLAG, write);
      } finally {
        seeding.delete(actor.id);
      }

      return seeded;
    }

    /**
     * Switching sets equips that set's weapons and unequips the rest, which is
     * what drives the Attacks panel.
     *
     * Abstract on the base class — Argon logs "not implemented" until a system
     * supplies it. Argon also calls it on every render, not only on a click, so
     * this doubles as the reconciliation pass that notices a weapon deleted out
     * from under a set.
     */
    async _onSetChange({ sets, active }) {
      const actor = this.actor;
      if (!actor) return;

      await this.#pruneDeadEntries();

      const activeSet = sets?.[active] ?? {};
      const { updates } = planLoadout(getActorItems(actor), [
        activeSet.primary,
        activeSet.secondary
      ]);

      if (!updates.length) return;

      // Never write to a document this user cannot update (AUTO-4). A Handler
      // watching a player's HUD renders it; they do not re-equip it.
      if (!actor.isOwner) return;

      await actor.updateEmbeddedDocuments('Item', updates);

      // Argon's `updateItem` path only re-renders buttons whose item already
      // matches — it never re-runs a panel's `_getButtons()`. Without an explicit
      // refresh, a newly equipped weapon does not appear in the Attacks panel
      // until the HUD rebinds (which is why switching actors "fixed" it).
      await ui.ARGON.refresh();
    }

    /**
     * Forget set entries that no longer name a weapon this Agent carries.
     *
     * Argon writes a slot once and never revisits it, so deleting a weapon
     * leaves the set pointing at a uuid that resolves to nothing — and the slot
     * keeps offering itself for dragging while doing nothing at all. Same for
     * anything dropped in from another sheet or a compendium.
     */
    async #pruneDeadEntries() {
      const actor = this.actor;
      if (!actor?.isOwner) return;

      const saved = actor.getFlag(ARGON_SCOPE, SETS_FLAG);
      if (!saved) return;

      const { sets, removed } = pruneWeaponSets(saved, getActorItems(actor));
      if (!removed.length) return;

      await actor.setFlag(ARGON_SCOPE, SETS_FLAG, sets);

      // An automatic change says what it changed (AUTO-3).
      ui.notifications.info(
        game.i18n.format('DG_HUD.Notifications.WeaponSetsPruned', { count: removed.length })
      );
    }
  };
}
