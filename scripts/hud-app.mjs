/**
 * Application HUD controller for Delta Green Enhanced Combat HUD.
 */

import { extractVitals, extractSkills, extractWeapons, extractTacticalActions } from './actor-adapter.mjs';
import { evaluatePercentileRoll, evaluateLethalityRoll, spendWillpowerForBonus } from './roll-handler.mjs';
import { TargetManager } from './target-manager.mjs';
import { CombatTracker } from './combat-tracker.mjs';

export class DeltaGreenCombatHudApp {
  constructor() {
    this.visible = false;
    this.activeTab = 'weapons'; // 'weapons' | 'skills' | 'tactics' | 'sanity'
    this.targetManager = new TargetManager();
    this.combatTracker = new CombatTracker();
    this.element = null;
    this.controlledActor = null;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;
  }

  /** Retrieve dynamic WP Boost module settings */
  getWpBoostSettings() {
    const MOD_ID = 'delta-green-combat-hud';
    const enabled = typeof game !== 'undefined' && game.settings ? game.settings.get(MOD_ID, 'enableWpBoost') : true;
    const cost = typeof game !== 'undefined' && game.settings ? game.settings.get(MOD_ID, 'wpBoostCost') : 1;
    const percent = typeof game !== 'undefined' && game.settings ? game.settings.get(MOD_ID, 'wpBoostPercent') : 20;
    return { enabled, cost, percent };
  }

  /**
   * Bind DOM container or attach to Foundry UI.
   * @param {HTMLElement} [container]
   */
  mount(container = document.body) {
    if (this.element) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'delta-green-combat-hud';
    wrapper.className = 'dg-hud-container dg-hud-hidden';
    container.appendChild(wrapper);
    this.element = wrapper;

    this.render();
  }

  /** Toggle HUD display */
  toggle() {
    this.visible = !this.visible;
    if (this.element) {
      this.element.classList.toggle('dg-hud-hidden', !this.visible);
    }
    if (this.visible) this.render();
  }

  show() {
    this.visible = true;
    if (this.element) {
      this.element.classList.remove('dg-hud-hidden');
    }
    this.render();
  }

  hide() {
    this.visible = false;
    if (this.element) {
      this.element.classList.add('dg-hud-hidden');
    }
  }

  /** Get active token / actor in Foundry */
  resolveActiveActor() {
    if (typeof canvas !== 'undefined' && canvas.tokens?.controlled?.length) {
      const token = canvas.tokens.controlled[0];
      return token.actor || null;
    }
    if (typeof game !== 'undefined' && game.user?.character) {
      return game.user.character;
    }
    return this.controlledActor;
  }

  /** Render HUD HTML */
  render() {
    if (!this.element || !this.visible) return;

    const actor = this.resolveActiveActor();
    const vitals = extractVitals(actor);
    const skills = extractSkills(actor);
    const weapons = extractWeapons(actor);
    const tactics = extractTacticalActions();
    const combatState = this.combatTracker.update(typeof game !== 'undefined' ? game.combat : null, actor?.id);
    const targetState = this.targetManager.getState();
    const wpSettings = this.getWpBoostSettings();

    const html = `
      <div class="dg-hud-dock ${this.wpBonusActive ? 'wp-bonus-glow' : ''}">
        <!-- Left: Agent Vitals Box -->
        <div class="dg-hud-vitals-box">
          <img class="dg-hud-portrait" src="${vitals.img}" alt="${vitals.name}" />
          <div class="dg-hud-vitals-info">
            <div class="dg-hud-agent-name">${vitals.name}</div>
            
            <div class="dg-hud-stat-bar hp-bar">
              <span class="stat-label">HP</span>
              <div class="bar-fill-track">
                <div class="bar-fill" style="width: ${vitals.hp.percentage}%"></div>
              </div>
              <span class="stat-value">${vitals.hp.value}/${vitals.hp.max}</span>
            </div>

            <div class="dg-hud-stat-bar wp-bar">
              <span class="stat-label">WP</span>
              <div class="bar-fill-track">
                <div class="bar-fill" style="width: ${vitals.wp.percentage}%"></div>
              </div>
              <span class="stat-value">${vitals.wp.value}/${vitals.wp.max}</span>
            </div>

            <div class="dg-hud-stat-bar san-bar">
              <span class="stat-label">SAN</span>
              <div class="bar-fill-track">
                <div class="bar-fill" style="width: ${vitals.san.percentage}%"></div>
              </div>
              <span class="stat-value">${vitals.san.value}/${vitals.san.max}</span>
            </div>
            
            <div class="dg-hud-sub-vitals">
              <span>BP: <strong>${vitals.breakingPoint}</strong></span>
              <span>ARM: <strong>${vitals.armor}</strong></span>
            </div>
          </div>
        </div>

        <!-- Center: Action & Weapon Navigation -->
        <div class="dg-hud-action-center">
          <!-- Navigation Tabs -->
          <div class="dg-hud-tabs">
            <button class="dg-tab-btn ${this.activeTab === 'weapons' ? 'active' : ''}" data-tab="weapons">
              <i class="fas fa-gun"></i> Weapons
            </button>
            <button class="dg-tab-btn ${this.activeTab === 'skills' ? 'active' : ''}" data-tab="skills">
              <i class="fas fa-bullseye"></i> Skills
            </button>
            <button class="dg-tab-btn ${this.activeTab === 'tactics' ? 'active' : ''}" data-tab="tactics">
              <i class="fas fa-shield"></i> Tactics
            </button>
            <button class="dg-tab-btn ${this.activeTab === 'sanity' ? 'active' : ''}" data-tab="sanity">
              <i class="fas fa-brain"></i> Sanity / WP
            </button>
          </div>

          <!-- Tab Contents -->
          <div class="dg-hud-tab-content">
            ${this.renderTabContent(this.activeTab, weapons, skills, tactics, vitals)}
          </div>
        </div>

        <!-- Right: Turn Controls & Target Selection -->
        <div class="dg-hud-right-panel">
          ${
            targetState.active
              ? `
            <div class="dg-hud-target-overlay">
              <div class="target-title">TARGET MODE</div>
              <div class="target-count">Targets: ${targetState.selectedCount} / ${targetState.targetCount}</div>
              <div class="target-controls">
                <button class="dg-btn-sm btn-adj-dec">-</button>
                <button class="dg-btn-sm btn-adj-inc">+</button>
                <button class="dg-btn-sm btn-cancel-target">Cancel</button>
              </div>
            </div>
          `
              : `
            <div class="dg-hud-turn-box">
              <div class="round-indicator">ROUND ${combatState.round}</div>
              <button class="dg-btn-action btn-end-turn" ${combatState.active ? '' : 'disabled'}>
                <i class="fas fa-step-forward"></i> END TURN
              </button>
              ${
                wpSettings.enabled
                  ? `
                <button class="dg-btn-action btn-wp-boost ${vitals.wp.value < wpSettings.cost ? 'disabled' : ''}">
                  <i class="fas fa-bolt"></i> +${wpSettings.percent}% WP BOOST (${wpSettings.cost} WP)
                </button>
              `
                  : ''
              }
            </div>
          `
          }
        </div>
      </div>
    `;

    this.element.innerHTML = html;
    this.activateListeners();
  }

  /** Render individual tab contents */
  renderTabContent(tab, weapons, skills, tactics, vitals) {
    if (tab === 'weapons') {
      return `
        <div class="dg-weapon-grid">
          ${weapons
            .map(
              (w) => `
            <div class="dg-weapon-card" data-weapon-id="${w.id}">
              <img src="${w.img}" alt="${w.name}" class="weapon-img" />
              <div class="weapon-info">
                <div class="weapon-name">${w.name}</div>
                <div class="weapon-meta">
                  <span>${w.skill}</span> | <span>Dmg: ${w.damage}</span>
                  ${w.lethality > 0 ? `<span class="lethality-badge">Lethality: ${w.lethality}%</span>` : ''}
                </div>
              </div>
              <button class="dg-btn-roll btn-roll-weapon" data-weapon-id="${w.id}">
                ATTACK
              </button>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (tab === 'skills') {
      return `
        <div class="dg-skill-grid">
          ${skills
            .map(
              (s) => `
            <button class="dg-skill-pill btn-roll-skill" data-skill-key="${s.key}">
              <span class="skill-label">${s.label}</span>
              <span class="skill-value">${s.value}%</span>
            </button>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (tab === 'tactics') {
      return `
        <div class="dg-tactics-grid">
          ${tactics
            .map(
              (t) => `
            <button class="dg-tactic-card btn-tactic" data-tactic-id="${t.id}">
              <i class="${t.icon}"></i>
              <div class="tactic-details">
                <strong>${t.name}</strong>
                <span>${t.description}</span>
              </div>
            </button>
          `
            )
            .join('')}
        </div>
      `;
    }

    if (tab === 'sanity') {
      const wpSettings = this.getWpBoostSettings();
      return `
        <div class="dg-sanity-panel">
          <div class="san-action-card">
            <h4>SANITY TEST</h4>
            <p>Roll d100 against current Sanity (${vitals.san.value}%).</p>
            <button class="dg-btn-roll btn-roll-san">ROLL SANITY</button>
          </div>
          ${
            wpSettings.enabled
              ? `
            <div class="san-action-card">
              <h4>WILLPOWER BOOST</h4>
              <p>Spend ${wpSettings.cost} WP to add +${wpSettings.percent}% bonus to next roll or suppress panic.</p>
              <button class="dg-btn-roll btn-spend-wp" ${vitals.wp.value < wpSettings.cost ? 'disabled' : ''}>
                SPEND ${wpSettings.cost} WP (+${wpSettings.percent}%)
              </button>
            </div>
          `
              : ''
          }
        </div>
      `;
    }

    return '';
  }

  /** Activate event listeners for UI buttons */
  activateListeners() {
    if (!this.element) return;

    // Tab buttons
    this.element.querySelectorAll('.dg-tab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          this.activeTab = tab;
          this.render();
        }
      });
    });

    // Weapon Attack button
    this.element.querySelectorAll('.btn-roll-weapon').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.weaponId;
        await this.triggerWeaponRoll(id);
      });
    });

    // Skill Roll button
    this.element.querySelectorAll('.btn-roll-skill').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.skillKey;
        await this.triggerSkillRoll(key);
      });
    });

    // WP Spend button
    this.element.querySelectorAll('.btn-spend-wp, .btn-wp-boost').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.triggerWillpowerSpend();
      });
    });

    // SAN Roll button
    this.element.querySelectorAll('.btn-roll-san').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await this.triggerSanityRoll();
      });
    });

    // Target overlay controls
    const decBtn = this.element.querySelector('.btn-adj-dec');
    const incBtn = this.element.querySelector('.btn-adj-inc');
    const cancelTargetBtn = this.element.querySelector('.btn-cancel-target');

    if (decBtn) decBtn.addEventListener('click', () => { this.targetManager.adjustTargetCount(-1); this.render(); });
    if (incBtn) incBtn.addEventListener('click', () => { this.targetManager.adjustTargetCount(1); this.render(); });
    if (cancelTargetBtn) cancelTargetBtn.addEventListener('click', () => { this.targetManager.cancelTargeting(); this.render(); });

    // End Turn button
    const endTurnBtn = this.element.querySelector('.btn-end-turn');
    if (endTurnBtn) {
      endTurnBtn.addEventListener('click', async () => {
        if (typeof game !== 'undefined' && game.combat) {
          await game.combat.nextTurn();
        }
        this.render();
      });
    }
  }

  /** Execute Skill Roll */
  async triggerSkillRoll(skillKey) {
    const actor = this.resolveActiveActor();
    const skills = extractSkills(actor);
    const skill = skills.find((s) => s.key === skillKey) || { label: skillKey, value: 30 };
    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const rollVal = Math.floor(Math.random() * 100) + 1;
    const outcome = evaluatePercentileRoll(skill.value, rollVal, { wpBonus });

    const message = `
      <div class="dg-chat-card">
        <h3>${actor?.name || 'Agent'} — ${skill.label} Test</h3>
        <p>Target: <strong>${outcome.effectiveTarget}%</strong> (Roll: <strong>${rollVal}</strong>)</p>
        <div class="result-badge ${outcome.resultType}">
          ${outcome.resultType.toUpperCase().replace('_', ' ')}
        </div>
      </div>
    `;

    if (typeof ChatMessage !== 'undefined') {
      await ChatMessage.create({ content: message });
    }
    this.render();
    return outcome;
  }

  /** Execute Weapon Roll */
  async triggerWeaponRoll(weaponId) {
    const actor = this.resolveActiveActor();
    const weapons = extractWeapons(actor);
    const weapon = weapons.find((w) => w.id === weaponId) || weapons[0];
    const skills = extractSkills(actor);
    const skillObj = skills.find((s) => s.label.toLowerCase() === weapon.skill.toLowerCase()) || { value: 30 };

    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const rollVal = Math.floor(Math.random() * 100) + 1;
    const attackOutcome = evaluatePercentileRoll(skillObj.value, rollVal, { wpBonus });

    let lethalityResult = null;
    if (attackOutcome.isSuccess && weapon.lethality > 0) {
      const lethalityRollVal = Math.floor(Math.random() * 100) + 1;
      lethalityResult = evaluateLethalityRoll(weapon.lethality, lethalityRollVal);
    }

    const message = `
      <div class="dg-chat-card">
        <h3>${actor?.name || 'Agent'} — ${weapon.name} Attack</h3>
        <p>Skill: ${weapon.skill} (${attackOutcome.effectiveTarget}%) | Roll: <strong>${rollVal}</strong></p>
        <div class="result-badge ${attackOutcome.resultType}">
          ${attackOutcome.resultType.toUpperCase().replace('_', ' ')}
        </div>
        ${
          lethalityResult
            ? `
          <div class="lethality-chat-box">
            <strong>Lethality Roll (${weapon.lethality}%):</strong> ${lethalityResult.roll}
            <br/>${lethalityResult.isLethal ? '💥 <strong style="color:red">LETHAL KILL!</strong>' : `Damage: ${lethalityResult.nonLethalDamage} HP`}
          </div>
        `
            : ''
        }
      </div>
    `;

    if (typeof ChatMessage !== 'undefined') {
      await ChatMessage.create({ content: message });
    }
    this.render();
    return attackOutcome;
  }

  /** Execute Sanity Roll */
  async triggerSanityRoll() {
    const actor = this.resolveActiveActor();
    const vitals = extractVitals(actor);
    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const rollVal = Math.floor(Math.random() * 100) + 1;
    const outcome = evaluatePercentileRoll(vitals.san.value, rollVal, { wpBonus });

    const message = `
      <div class="dg-chat-card">
        <h3>${actor?.name || 'Agent'} — Sanity Check</h3>
        <p>SAN: <strong>${outcome.effectiveTarget}%</strong> | Roll: <strong>${rollVal}</strong></p>
        <div class="result-badge ${outcome.resultType}">
          ${outcome.resultType.toUpperCase().replace('_', ' ')}
        </div>
      </div>
    `;

    if (typeof ChatMessage !== 'undefined') {
      await ChatMessage.create({ content: message });
    }
    this.render();
    return outcome;
  }

  /** Trigger WP Spend for Bonus */
  async triggerWillpowerSpend() {
    const wpSettings = this.getWpBoostSettings();
    if (!wpSettings.enabled) {
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('Willpower Boost is disabled in module settings.');
      }
      return { success: false, reason: 'Disabled' };
    }

    const actor = this.resolveActiveActor();
    const vitals = extractVitals(actor);

    const spendResult = spendWillpowerForBonus(vitals, wpSettings.cost, wpSettings.percent);
    if (!spendResult.success) {
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn(spendResult.reason);
      }
      return spendResult;
    }

    this.wpBonusActive = true;
    this.wpBonusAmount = spendResult.bonus;

    // Update actor WP if in Foundry environment
    if (actor && typeof actor.update === 'function') {
      const wpPath = actor.system?.wp ? 'system.wp.value' : 'system.attributes.wp.value';
      await actor.update({ [wpPath]: spendResult.wpRemaining });
    }

    if (typeof ui !== 'undefined' && ui.notifications) {
      ui.notifications.info(`+${spendResult.bonus}% Willpower Boost Active for next roll!`);
    }

    this.render();
    return spendResult;
  }
}
