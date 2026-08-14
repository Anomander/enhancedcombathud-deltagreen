/**
 * Skill, reaction and sanity panels.
 *
 * Skills are grouped by a distinction derived from the actor — trained versus
 * untrained — rather than an invented category table, so the panels work for any
 * skill set the system defines, including the unnatural one (SYS-2).
 */

import { canRollSanity, extractSkills, extractSpecialTraining, extractVitals } from '../actor-adapter.mjs';
import { rollService } from '../roll-service.mjs';
import { getShowUntrainedSkills } from '../settings.mjs';
import { matchesSkill } from '../skill-display.mjs';
import { addMonogram } from './tile-monogram.mjs';

/**
 * Argon renders a button's `icon` as a CSS background-image, so these are image
 * paths and not Font Awesome classes. See ActionButton._renderInner.
 */
const ICONS = {
  dodge: 'icons/svg/wingfoot.svg',
  fightBack: 'icons/svg/combat.svg',
  skills: 'icons/svg/book.svg',
  sanity: 'icons/svg/terror.svg'
};

/** Delta Green names two reactions; each is only offered if the actor has the skill. */
const REACTIONS = [
  { key: 'dodge', icon: ICONS.dodge },
  { key: 'unarmed_combat', icon: ICONS.fightBack, labelKey: 'DG_HUD.Actions.FightBack' }
];

export function createSkillPanels(ARGON) {
  /**
   * The skills the list will show, given the setting.
   *
   * Untrained means a proficiency of 0 — the skill is still rollable from the
   * sheet, and the HUD refuses nothing (PAR-4); it is only left out of a list a
   * player reads mid-firefight. Typed skills and Special Training are entries
   * the player wrote down deliberately, so they are never hidden.
   * @param {object|null} actor
   */
  function listedSkills(actor) {
    const skills = extractSkills(actor);
    if (getShowUntrainedSkills()) return skills;

    return skills.filter((skill) => skill.typed || skill.value > 0);
  }

  /** A single skill roll. */
  class DGSkillButton extends ARGON.MAIN.BUTTONS.ActionButton {
    constructor(skill) {
      super();
      this.skill = skill;
    }

    get classes() {
      return [...super.classes, 'dg-skill-button'];
    }

    get label() {
      return `${this.skill.label} ${this.skill.value}%`;
    }

    /** The text the filter box matches against — the skill's name, not its rating. */
    get searchText() {
      return this.skill.label;
    }

    /** Argon only renders a tooltip for a component that declares one. */
    get hasTooltip() {
      return true;
    }

    async getTooltipData() {
      return {
        title: this.skill.label,
        subtitle: `${this.skill.value}%`,
        description: this.skill.failed ? game.i18n.localize('DG_HUD.Skills.FlaggedForImprovement') : ''
      };
    }

    /**
     * A skill flagged for improvement is marked in the corner rather than by
     * taking over the tile as a background image, so the monogram survives and
     * the two facts stay separately readable.
     */
    async _renderInner() {
      await super._renderInner();
      addMonogram(this.element, this.skill.label);
      this.element.classList.toggle('dg-skill-flagged', this.skill.failed);
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

    get classes() {
      return [...super.classes, 'dg-skill-button'];
    }

    get label() {
      return this.training.name;
    }

    get searchText() {
      return this.training.name;
    }

    async _renderInner() {
      await super._renderInner();
      addMonogram(this.element, this.training.name);
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
   * The skill list, with a filter box over it.
   *
   * Forty-odd skills in four categories is a lot to read under fire, so the
   * list can be narrowed by typing. Extends AccordionPanel directly, one level
   * below the Argon base class, so its template still resolves to
   * `AccordionPanel.hbs` (ARCH-7).
   */
  class DGSkillAccordionPanel extends ARGON.MAIN.BUTTON_PANELS.ACCORDION.AccordionPanel {
    get classes() {
      return [...super.classes, 'dg-skill-search-panel'];
    }

    /** Argon stores the categories it was constructed with here. */
    get categories() {
      return this._subPanels ?? [];
    }

    get searchInput() {
      return this.element.querySelector('.dg-skill-search');
    }

    /** Every button still showing under the current query. */
    get matchingButtons() {
      return this.categories.flatMap((category) =>
        (category.buttons ?? []).filter((button) => !button.element.classList.contains('dg-filtered-out'))
      );
    }

    async _renderInner() {
      await super._renderInner();
      this.element.appendChild(this.#buildSearch());
    }

    #buildSearch() {
      const input = document.createElement('input');
      input.type = 'text';
      input.classList.add('dg-skill-search');
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = game.i18n.localize('DG_HUD.Skills.SearchPlaceholder');
      input.setAttribute('aria-label', game.i18n.localize('DG_HUD.Skills.SearchLabel'));
      input.addEventListener('input', () => this.filter(input.value));
      input.addEventListener('keydown', (event) => this.#onKeyDown(event));

      return input;
    }

    /**
     * Narrow the list to what matches.
     *
     * A category holding a match is opened for as long as the query lasts — a
     * match hidden inside a collapsed category is the same as no match at all —
     * and the categories the player had open are put back when it is cleared.
     * @param {string} query
     */
    filter(query) {
      const active = Boolean(String(query ?? '').trim());
      if (active && !this._expandedBeforeFilter) {
        this._expandedBeforeFilter = this.categories.map((category) => category.visible);
      }

      for (const category of this.categories) {
        let matches = 0;

        for (const button of category.buttons ?? []) {
          const hit = matchesSkill(query, button.searchText ?? button.label);
          button.element.classList.toggle('dg-filtered-out', !hit);
          if (hit) matches += 1;
        }

        // A category with nothing left in it is not rendered at all (UX-1).
        category.element.classList.toggle('dg-filtered-out', active && matches === 0);

        if (active && matches > 0) {
          if (!category.visible) category.toggle(true);
          // Argon pins a category to the width it was measured at and lays its
          // buttons out on a fixed column count, both chosen for the full list.
          // Left alone, one match sits in the footprint of forty.
          category.element.style.width = 'auto';
          this.#setColumns(category, matches);
        }
      }

      if (!active && this._expandedBeforeFilter) {
        this.categories.forEach((category, index) => {
          // toggle() is where Argon applies the measured width, so this restores
          // the layout as well as the state.
          category.toggle(this._expandedBeforeFilter[index]);
          this.#restoreColumns(category);
        });
        this._expandedBeforeFilter = null;
      }
    }

    /** Lay a filtered category out on as many columns as it has matches. */
    #setColumns(category, matches) {
      const content = category.buttonContainer;
      if (!content) return;

      this._columns ??= new Map();
      if (!this._columns.has(category)) this._columns.set(category, content.style.gridTemplateColumns);

      const full = Number(/repeat\((\d+)/.exec(this._columns.get(category) ?? '')?.[1] ?? 3);
      content.style.gridTemplateColumns = `repeat(${Math.min(matches, full)}, 1fr)`;
    }

    /** Hand the category back the column count Argon measured it with. */
    #restoreColumns(category) {
      const content = category.buttonContainer;
      if (!content || !this._columns?.has(category)) return;

      content.style.gridTemplateColumns = this._columns.get(category);
      this._columns.delete(category);
    }

    /** Drop the query and show the whole list again. */
    clear() {
      const input = this.searchInput;
      if (input) input.value = '';
      this.filter('');
    }

    /** `preventScroll`: the panel is still mid-transition when this runs. */
    focusSearch() {
      this.searchInput?.focus({ preventScroll: true });
      this.searchInput?.select();
    }

    #onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation(); // Escape here means "drop the query", not "close Foundry's dialog"
        this.clear();
        this.searchInput?.blur();
        return;
      }

      if (event.key !== 'Enter') return;

      // Only when the query has narrowed the list to a single skill — otherwise
      // Enter would pick one arbitrarily, which is a roll nobody asked for.
      const matches = this.matchingButtons;
      if (matches.length !== 1) return;

      event.preventDefault();

      // A KeyboardEvent carries `shiftKey`, so Shift+Enter reaches the system's
      // roll exactly as Shift+click does — same dialog, same modifiers (PAR-1).
      matches[0]._onLeftClick(event);
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

    /**
     * Argon opens the panel; the filter box takes focus with it, so the list can
     * be narrowed by typing without a second click. Closing drops the query, so
     * the panel always opens on the whole list.
     */
    async _onClick(event) {
      await super._onClick(event);

      if (this.panel.visible) this.panel.focusSearch();
      else this.panel.clear();
    }

    async _getPanel() {
      const { AccordionPanelCategory } = ARGON.MAIN.BUTTON_PANELS.ACCORDION;
      const byLabel = (a, b) => a.label.localeCompare(b.label);

      const skills = listedSkills(this.actor);
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

      // Empty, and so skipped, when untrained skills are switched off.
      addCategory('DG_HUD.Skills.Untrained', untrained.map((skill) => new DGSkillButton(skill)));

      // The id lets Argon remember which categories the player left expanded.
      return new DGSkillAccordionPanel({ id: 'dg-skills', accordionPanelCategories: categories });
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
      // A button that opens an empty list is not rendered at all (UX-1) — which
      // an Agent with nothing but untrained skills would otherwise get.
      const hasSomethingToList =
        listedSkills(this.actor).length > 0 || extractSpecialTraining(this.actor).length > 0;

      return hasSomethingToList ? [new DGSkillsButton()] : [];
    }
  }

  /** The Sanity test. Willpower Boost lives on the portrait, beside the WP it spends. */
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

    /** An Agent at zero Sanity has nothing left to test (UX-1). */
    get visible() {
      return canRollSanity(extractVitals(this.actor));
    }

    async _getButtons() {
      return [new DGSanityButton()];
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

  return { DGSkillPanel, DGReactionPanel, DGSanityPanel };
}
