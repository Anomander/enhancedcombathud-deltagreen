/**
 * Skill, reaction and sanity panels.
 *
 * Skills are grouped by a distinction derived from the actor — trained versus
 * untrained — rather than an invented category table, so the panels work for any
 * skill set the system defines, including the unnatural one (SYS-2).
 */

import { extractSkills, extractSpecialTraining, extractVitals } from '../actor-adapter.mjs';
import { rollService } from '../roll-service.mjs';
import { getWpBoostSettings } from '../settings.mjs';

/**
 * Argon renders a button's `icon` as a CSS background-image, so these are image
 * paths and not Font Awesome classes. See ActionButton._renderInner.
 */
const ICONS = {
  dodge: 'icons/svg/wingfoot.svg',
  fightBack: 'icons/svg/combat.svg',
  skills: 'icons/svg/book.svg',
  sanity: 'icons/svg/terror.svg',
  willpower: 'icons/svg/lightning.svg',
  improvement: 'icons/svg/upgrade.svg'
};

/** Delta Green names two reactions; each is only offered if the actor has the skill. */
const REACTIONS = [
  { key: 'dodge', icon: ICONS.dodge },
  { key: 'unarmed_combat', icon: ICONS.fightBack, labelKey: 'DG_HUD.Actions.FightBack' }
];

export function createSkillPanels(ARGON) {
  /** A single skill roll. */
  class DGSkillButton extends ARGON.MAIN.BUTTONS.ActionButton {
    constructor(skill) {
      super();
      this.skill = skill;
    }

    get label() {
      return `${this.skill.label} ${this.skill.value}%`;
    }

    get icon() {
      return this.skill.failed ? ICONS.improvement : '';
    }

    async getTooltipData() {
      return {
        title: this.skill.label,
        subtitle: `${this.skill.value}%`,
        description: this.skill.failed ? game.i18n.localize('DG_HUD.Skills.FlaggedForImprovement') : ''
      };
    }

    async _onLeftClick(event) {
      await rollService.rollSkill({
        actor: this.actor,
        token: this.token,
        skillKey: this.skill.key,
        event
      });
    }
  }

  /** A Special Training roll against its backing attribute. */
  class DGSpecialTrainingButton extends ARGON.MAIN.BUTTONS.ActionButton {
    constructor(training) {
      super();
      this.training = training;
    }

    get label() {
      return this.training.name;
    }

    async _onLeftClick(event) {
      await rollService.rollSpecialTraining({
        actor: this.actor,
        token: this.token,
        training: this.training,
        event
      });
    }
  }

  /**
   * Dodge and Fight Back.
   *
   * Extends ActionButton directly rather than DGSkillButton: Argon resolves a
   * component's template from its *immediate* parent class name
   * (`Object.getPrototypeOf(this.constructor).name`), so a two-deep subclass would
   * look for a non-existent `DGSkillButton.hbs`. Every component here must sit
   * exactly one level below an Argon base class.
   */
  class DGReactionButton extends ARGON.MAIN.BUTTONS.ActionButton {
    constructor(skill, { icon, labelKey }) {
      super();
      this.skill = skill;
      this.reactionIcon = icon;
      this.labelKey = labelKey;
    }

    get colorScheme() {
      return 3; // reaction
    }

    get icon() {
      return this.reactionIcon;
    }

    get label() {
      const name = this.labelKey ? game.i18n.localize(this.labelKey) : this.skill.label;
      return `${name} ${this.skill.value}%`;
    }

    async getTooltipData() {
      return { title: this.label, subtitle: `${this.skill.value}%` };
    }

    async _onLeftClick(event) {
      await rollService.rollSkill({
        actor: this.actor,
        token: this.token,
        skillKey: this.skill.key,
        event
      });
    }
  }

  class DGReactionPanel extends ARGON.MAIN.ActionPanel {
    get classes() {
      return [...super.classes, 'dg-reaction-panel'];
    }

    get label() {
      return 'DG_HUD.Panels.Reactions';
    }

    get colorScheme() {
      return 3;
    }

    async _getButtons() {
      const skills = extractSkills(this.actor);

      // A reaction whose skill the actor lacks is not rendered at all (UX-1).
      return REACTIONS.map((reaction) => {
        const skill = skills.find((entry) => entry.key === reaction.key);
        return skill ? new DGReactionButton(skill, reaction) : null;
      }).filter(Boolean);
    }
  }

  /**
   * Opens the full skill list. ButtonPanelButton takes no constructor arguments —
   * subclasses supply `label`, `icon` and the panel itself via `_getPanel()`.
   */
  class DGSkillsButton extends ARGON.MAIN.BUTTONS.ButtonPanelButton {
    get label() {
      return 'DG_HUD.Panels.Skills';
    }

    get icon() {
      return ICONS.skills;
    }

    async _getPanel() {
      const { AccordionPanel, AccordionPanelCategory } = ARGON.MAIN.BUTTON_PANELS.ACCORDION;
      const byLabel = (a, b) => a.label.localeCompare(b.label);

      const skills = extractSkills(this.actor);
      const trained = skills.filter((skill) => skill.value > 0 && !skill.typed).sort(byLabel);
      const untrained = skills.filter((skill) => skill.value === 0 && !skill.typed).sort(byLabel);
      const typed = skills.filter((skill) => skill.typed).sort(byLabel);
      const training = extractSpecialTraining(this.actor);

      const categories = [];
      const addCategory = (labelKey, buttons) => {
        if (!buttons.length) return;
        categories.push(new AccordionPanelCategory({ label: game.i18n.localize(labelKey), buttons }));
      };

      addCategory('DG_HUD.Skills.Trained', trained.map((skill) => new DGSkillButton(skill)));
      addCategory('DG_HUD.Skills.Typed', typed.map((skill) => new DGSkillButton(skill)));
      addCategory('DG_HUD.Skills.SpecialTraining', training.map((entry) => new DGSpecialTrainingButton(entry)));
      addCategory('DG_HUD.Skills.Untrained', untrained.map((skill) => new DGSkillButton(skill)));

      // The id lets Argon remember which categories the player left expanded.
      return new AccordionPanel({ id: 'dg-skills', accordionPanelCategories: categories });
    }
  }

  /** All skills, behind a single button. */
  class DGSkillPanel extends ARGON.MAIN.ActionPanel {
    get classes() {
      return [...super.classes, 'dg-skill-panel'];
    }

    get label() {
      return 'DG_HUD.Panels.Skills';
    }

    async _getButtons() {
      return extractSkills(this.actor).length ? [new DGSkillsButton()] : [];
    }
  }

  /** Sanity test, and the optional Willpower Boost house rule. */
  class DGSanityPanel extends ARGON.MAIN.ActionPanel {
    get classes() {
      return [...super.classes, 'dg-sanity-panel'];
    }

    get label() {
      return 'DG_HUD.Panels.Sanity';
    }

    get colorScheme() {
      return 2; // free action
    }

    get visible() {
      return extractVitals(this.actor).san.available;
    }

    async _getButtons() {
      const buttons = [new DGSanityButton()];

      // Only rendered when the house rule is switched on (UX-2).
      if (getWpBoostSettings().enabled) buttons.push(new DGWillpowerBoostButton());

      return buttons;
    }
  }

  class DGSanityButton extends ARGON.MAIN.BUTTONS.ActionButton {
    get label() {
      const { san } = extractVitals(this.actor);
      return san.private
        ? game.i18n.localize('DG_HUD.Actions.RollSanity')
        : `${game.i18n.localize('DG_HUD.Actions.RollSanity')} ${san.value}%`;
    }

    get icon() {
      return ICONS.sanity;
    }

    get colorScheme() {
      return 2;
    }

    async _onLeftClick(event) {
      await rollService.rollSanity({ actor: this.actor, token: this.token, event });
    }
  }

  /**
   * Arms a Willpower Boost for the next roll. A toggle, not a purchase — the
   * Willpower is not taken until a roll actually happens, so clicking again
   * disarms at no cost (UX-1: an armed state the player cannot cancel is a
   * control that only half works).
   */
  class DGWillpowerBoostButton extends ARGON.MAIN.BUTTONS.ActionButton {
    get icon() {
      return ICONS.willpower;
    }

    get colorScheme() {
      return 2;
    }

    get armed() {
      return rollService.isBoostArmed(this.actor);
    }

    get label() {
      const { cost, percent } = getWpBoostSettings();
      return this.armed
        ? game.i18n.format('DG_HUD.Actions.WillpowerBoostArmed', { percent })
        : game.i18n.format('DG_HUD.Actions.WillpowerBoost', { cost, percent });
    }

    async getTooltipData() {
      const { cost, percent } = getWpBoostSettings();
      return {
        title: game.i18n.localize('DG_HUD.Actions.WillpowerBoostTitle'),
        description: game.i18n.format(
          this.armed ? 'DG_HUD.Actions.WillpowerBoostArmedHint' : 'DG_HUD.Actions.WillpowerBoostHint',
          { cost, percent }
        )
      };
    }

    /** Argon applies `icon` as a background image; the armed state is a class. */
    async _renderInner() {
      await super._renderInner();
      this.element.classList.toggle('dg-boost-armed', this.armed);
    }

    async _onLeftClick() {
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

      await this.render();
    }
  }

  return { DGSkillPanel, DGReactionPanel, DGSanityPanel };
}
