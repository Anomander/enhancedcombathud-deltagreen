/**
 * Weapon attacks.
 *
 * Left-click rolls the attack through the system pipeline; on a hit, Argon's own
 * flow continues to damage. Right-click rolls damage or lethality directly.
 */

import { extractWeapons, getActorItems } from '../actor-adapter.mjs';
import { rollService } from '../roll-service.mjs';
import { Logger } from '../logger.mjs';

/**
 * @param {object} ARGON - The CONFIG.ARGON namespace.
 */
export function createWeaponPanel(ARGON) {
  /** One weapon. */
  class DGWeaponButton extends ARGON.MAIN.BUTTONS.ItemButton {
    get classes() {
      return [...super.classes, 'dg-weapon-button'];
    }

    get label() {
      return this.item?.name ?? '';
    }

    get icon() {
      return this.item?.img ?? 'icons/svg/sword.svg';
    }

    /** Argon shows this in the button corner; the schema stores ammo as a string. */
    get quantity() {
      return this.item?.system?.ammo || null;
    }

    /**
     * Ask Argon to collect a target before the attack rolls.
     *
     * `useTargetPicker` is deliberately *not* overridden. Argon gates the picker
     * on `useTargetPicker && targets > 0`, and its own `useTargetPicker` reads
     * the player's `rangepicker` setting — so forcing it true here both did
     * nothing (`targets` defaulted to 0) and overrode a HUD preference that
     * belongs to Argon (ARCH-1). Declaring how many targets an attack wants is
     * the system module's job; whether to prompt for them is the player's.
     */
    get targets() {
      return 1;
    }

    /*
     * `ranges` is deliberately not overridden either. Argon feeds it to
     * `showRangeRings`, which does arithmetic on the value — but the system
     * stores range as a free-text StringField ("10M", "Touch", "N/A"), so the
     * old override returned a string and produced `"10M" + offset`. Parsing it
     * would be a guess about a shape the schema does not promise (SYS-1), and
     * the tooltip already shows the text. The base class returns
     * `{normal: null, long: null}`, which draws no rings.
     */

    async getTooltipData() {
      const sys = this.item?.system ?? {};
      const details = [];

      if (sys.damage) details.push({ label: game.i18n.localize('DG_HUD.Weapon.Damage'), value: sys.damage });
      if (sys.lethality > 0) details.push({ label: game.i18n.localize('DG_HUD.Weapon.Lethality'), value: `${sys.lethality}%` });
      if (sys.armorPiercing > 0) details.push({ label: game.i18n.localize('DG_HUD.Weapon.ArmorPiercing'), value: sys.armorPiercing });
      if (sys.range) details.push({ label: game.i18n.localize('DG_HUD.Weapon.Range'), value: sys.range });
      if (sys.ammo) details.push({ label: game.i18n.localize('DG_HUD.Weapon.Ammo'), value: sys.ammo });

      return {
        title: this.item.name,
        subtitle: this.actor?.system?.skills?.[sys.skill]?.label ?? sys.skill ?? '',
        description: sys.description ?? '',
        details
      };
    }

    async _onLeftClick(event) {
      await rollService.rollWeaponAttack({
        actor: this.actor,
        token: this.token,
        item: this.item,
        event
      });
    }

    /** Mirrors the sheet's `damage-or-lethality` control: the system asks which. */
    async _onRightClick(event) {
      event?.preventDefault?.();
      await rollService.rollWeaponDamage({
        actor: this.actor,
        token: this.token,
        item: this.item,
        event
      });
    }
  }

  /** The panel holding them. */
  class DGWeaponPanel extends ARGON.MAIN.ActionPanel {
    get classes() {
      return [...super.classes, 'dg-weapon-panel'];
    }

    get label() {
      return 'DG_HUD.Panels.Attacks';
    }

    async _getButtons() {
      const items = getActorItems(this.actor);
      const equipped = extractWeapons(this.actor).filter((weapon) => weapon.equipped);

      Logger.debug('Building weapon panel', { actor: this.actor?.name, count: equipped.length });

      return equipped
        .map((weapon) => items.find((item) => (item.id ?? item._id) === weapon.id))
        .filter(Boolean)
        // `inActionPanel` is required here: ItemButton defaults it to `isWeaponSet`
        // (false), leaving the button styled as a `.feature-element` for the
        // accordion list, which collapses to zero width inside an action panel.
        .map((item) => new DGWeaponButton({ item, inActionPanel: true }));
    }
  }

  return { DGWeaponPanel, DGWeaponButton };
}
