/**
 * Public API for Delta Green Enhanced Combat HUD module.
 */

export class DeltaGreenCombatHudAPI {
  constructor(hudApp) {
    this.hudApp = hudApp;
  }

  /** Toggle HUD window visibility */
  toggle() {
    if (!this.hudApp) return;
    this.hudApp.toggle();
  }

  /** Show HUD window */
  show() {
    if (!this.hudApp) return;
    this.hudApp.show();
  }

  /** Hide HUD window */
  hide() {
    if (!this.hudApp) return;
    this.hudApp.hide();
  }

  /** Check if HUD is currently visible */
  get isVisible() {
    return this.hudApp ? this.hudApp.visible : false;
  }

  /**
   * Execute skill roll for selected agent.
   * @param {string} skillKey - Skill key identifier (e.g., 'firearms', 'stealth').
   */
  async rollSkill(skillKey) {
    if (this.hudApp) {
      await this.hudApp.triggerSkillRoll(skillKey);
    }
  }

  /**
   * Execute weapon attack for selected agent.
   * @param {string} weaponId - Weapon item ID or key.
   */
  async rollWeapon(weaponId) {
    if (this.hudApp) {
      await this.hudApp.triggerWeaponRoll(weaponId);
    }
  }

  /**
   * Spend 1 WP for +20% bonus boost.
   */
  async spendWillpower() {
    if (this.hudApp) {
      await this.hudApp.triggerWillpowerSpend();
    }
  }
}
