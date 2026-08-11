/**
 * Application HUD controller for Delta Green Enhanced Combat HUD.
 */

import { extractVitals, extractSkills, extractWeapons, extractTacticalActions, getActorItems } from './actor-adapter.mjs';
import { evaluatePercentileRoll, evaluateLethalityRoll, spendWillpowerForBonus } from './roll-handler.mjs';
import { TargetManager } from './target-manager.mjs';
import { CombatTracker } from './combat-tracker.mjs';
import { Logger } from './logger.mjs';

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

    Logger.debug('HUD mounted to element wrapper');
    this.render();
  }

  /** Toggle HUD display */
  toggle() {
    this.visible = !this.visible;
    Logger.debug('HUD toggled', { visible: this.visible });
    if (this.element) {
      this.element.classList.toggle('dg-hud-hidden', !this.visible);
    }
    if (this.visible) this.render();
  }

  show() {
    this.visible = true;
    Logger.debug('HUD show() called — sliding up from bottom');
    if (this.element) {
      this.element.classList.remove('dg-hud-hidden');
    }
    this.render();
  }

  hide() {
    this.visible = false;
    Logger.debug('HUD hide() called — sliding down off-screen');
    if (this.element) {
      this.element.classList.add('dg-hud-hidden');
    }
  }

  /** Get active token / actor in Foundry */
  resolveActiveActor() {
    // 1. Explicitly controlled token on canvas
    if (typeof canvas !== 'undefined' && canvas.tokens?.controlled?.length) {
      const token = canvas.tokens.controlled[0];
      if (token?.actor) {
        Logger.debug('Resolved active actor from canvas controlled token', { actorName: token.actor.name, actorId: token.actor.id });
        return token.actor;
      }
    }

    // 2. Active combatant in combat turn order
    if (typeof game !== 'undefined' && game.combat?.started) {
      const combatantActor = game.combat.combatant?.actor || game.combat.combatant?.token?.actor;
      if (combatantActor) {
        Logger.debug('Resolved active actor from combatant turn order', { actorName: combatantActor.name, actorId: combatantActor.id });
        return combatantActor;
      }
    }

    // 3. Assigned user character
    if (typeof game !== 'undefined' && game.user?.character) {
      Logger.debug('Resolved active actor from user assigned character', { actorName: game.user.character.name });
      return game.user.character;
    }

    // 4. Cached controlled actor
    if (this.controlledActor) {
      Logger.debug('Resolved active actor from cached controlledActor property', { actorName: this.controlledActor.name });
      return this.controlledActor;
    }

    // 5. Fallback: First actor in game.actors if available
    if (typeof game !== 'undefined' && game.actors?.contents?.length) {
      Logger.debug('Resolved active actor fallback from world game.actors list', { actorName: game.actors.contents[0].name });
      return game.actors.contents[0];
    }

    Logger.debug('No active actor document could be resolved (null)');
    return null;
  }

  /**
   * Determine if it is currently the current user's turn in active combat.
   * @param {object} [actor]
   * @returns {boolean}
   */
  isUserTurn(actor) {
    if (typeof game === 'undefined') return true;
    if (!game.combat?.started) return true;
    if (game.user?.isGM) return true;

    const combatant = game.combat.combatant;
    if (!combatant) return false;

    const currentTurnActor = combatant.actor || combatant.token?.actor;
    if (!currentTurnActor) return false;

    if (currentTurnActor.isOwner) return true;

    const sameActorId =
      (actor?.id && currentTurnActor.id && actor.id === currentTurnActor.id) ||
      (actor?._id && currentTurnActor._id && actor._id === currentTurnActor._id);

    if (sameActorId && actor.isOwner) return true;

    return false;
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
    const isTurnActive = this.isUserTurn(actor);
    const isCombatStarted = typeof game !== 'undefined' && game.combat?.started;
    const showEndTurn = isCombatStarted && isTurnActive;

    Logger.debug('Rendering HUD state', {
      actorName: vitals.name,
      activeTab: this.activeTab,
      hp: `${vitals.hp.value}/${vitals.hp.max}`,
      wp: `${vitals.wp.value}/${vitals.wp.max}`,
      san: `${vitals.san.value}/${vitals.san.max}`,
      weaponsCount: weapons.length,
      skillsCount: skills.length,
      wpBonusActive: this.wpBonusActive,
      isTurnActive,
      showEndTurn
    });

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
            ${this.renderTabContent(this.activeTab, weapons, skills, tactics, vitals, isTurnActive)}
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
              <div class="round-indicator">${isCombatStarted ? `ROUND ${combatState.round}` : 'STANDBY'}</div>
              ${
                showEndTurn
                  ? `
                <button class="dg-btn-action btn-end-turn">
                  <i class="fas fa-step-forward"></i> END TURN
                </button>
              `
                  : ''
              }
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
  renderTabContent(tab, weapons, skills, tactics, vitals, isTurnActive = true) {
    const isCombatActive = typeof game !== 'undefined' && game.combat?.started;
    const canAttack = !isCombatActive || isTurnActive;

    if (tab === 'weapons') {
      return `
        <div class="dg-weapon-grid">
          ${weapons
            .map(
              (w) => `
            <div class="dg-weapon-card ${!canAttack ? 'weapon-disabled' : ''}" data-weapon-id="${w.id}">
              <img src="${w.img}" alt="${w.name}" class="weapon-img" />
              <div class="weapon-info">
                <div class="weapon-name">${w.name}</div>
                <div class="weapon-meta">
                  <span>${w.skill}</span> | <span>Dmg: ${w.damage}</span>
                  ${w.lethality > 0 ? `<span class="lethality-badge">Lethality: ${w.lethality}%</span>` : ''}
                </div>
              </div>
              <div class="weapon-card-buttons flexrow">
                <button class="dg-btn-roll btn-roll-weapon ${!canAttack ? 'disabled' : ''}"
                        data-weapon-id="${w.id}"
                        ${!canAttack ? 'disabled title="Not your turn"' : ''}>
                  ${!canAttack ? 'WAIT TURN' : 'ATTACK'}
                </button>
                <button class="dg-btn-sm btn-roll-damage ${!canAttack ? 'disabled' : ''}"
                        data-weapon-id="${w.id}"
                        ${!canAttack ? 'disabled title="Not your turn"' : 'title="Roll Damage / Lethality"'}>
                  <i class="fas fa-dice-d6"></i> DMG
                </button>
              </div>
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
        await this.triggerWeaponRoll(id, e);
      });
    });

    // Weapon Damage button
    this.element.querySelectorAll('.btn-roll-damage').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.weaponId;
        await this.triggerDamageRoll(id);
      });
    });

    // Skill Roll button
    this.element.querySelectorAll('.btn-roll-skill').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const key = e.currentTarget.dataset.skillKey;
        await this.triggerSkillRoll(key, e);
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
      btn.addEventListener('click', async (e) => {
        await this.triggerSanityRoll(e);
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

  /** Retrieve system roll class from CONFIG.Dice or game.deltagreen */
  getDGRollClass(className) {
    if (typeof CONFIG !== 'undefined' && CONFIG.Dice?.rolls) {
      const cls = CONFIG.Dice.rolls.find((c) => c.name === className);
      if (cls) return cls;
    }
    if (typeof game !== 'undefined' && game.deltagreen?.[className]) {
      return game.deltagreen[className];
    }
    return null;
  }

  /** Execute Skill Roll */
  async triggerSkillRoll(skillKey, event = {}) {
    const actor = this.resolveActiveActor();
    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const DGPercentileRoll = this.getDGRollClass('DGPercentileRoll');

    if (actor && DGPercentileRoll && typeof actor.sheet?.processRoll === 'function') {
      const rollOptions = {
        rollType: 'skill',
        key: skillKey,
        actor
      };

      const roll = new DGPercentileRoll('1D100', {}, rollOptions);
      if (wpBonus) roll.modifier += wpBonus;

      await actor.sheet.processRoll(event, roll);
      this.render();
      return roll;
    }

    // Fallback for unit testing or non-Foundry environment
    const skills = extractSkills(actor);
    const skill = skills.find((s) => s.key === skillKey) || { label: skillKey, value: 30 };
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
  async triggerWeaponRoll(weaponId, event = {}) {
    const actor = this.resolveActiveActor();

    if (typeof game !== 'undefined' && game.combat?.started && !this.isUserTurn(actor)) {
      Logger.warn('Weapon roll rejected: Not user turn in combat');
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('You cannot attack when it is not your turn.');
      }
      return null;
    }

    const weapons = extractWeapons(actor);
    const weaponData = weapons.find((w) => w.id === weaponId) || weapons[0];

    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const DGPercentileRoll = this.getDGRollClass('DGPercentileRoll');

    if (actor && DGPercentileRoll && typeof actor.sheet?.processRoll === 'function') {
      const items = getActorItems(actor);
      const item = items.find((i) => (i.id || i._id) === weaponId) || items.find((i) => i.name === weaponData.name);

      const skillKey = item?.system?.skill || weaponData.skillKey || 'firearms';
      const rollOptions = {
        rollType: 'weapon',
        key: skillKey,
        actor,
        item
      };

      const roll = new DGPercentileRoll('1D100', {}, rollOptions);
      if (wpBonus) roll.modifier += wpBonus;

      await actor.sheet.processRoll(event, roll);

      if (roll.isSuccess && item) {
        await this.promptDamageRoll(item, roll.isCritical, weaponData);
      }

      this.render();
      return roll;
    }

    // Fallback for unit testing or non-Foundry environment
    const skills = extractSkills(actor);
    const skillObj = skills.find((s) => s.label.toLowerCase() === weaponData.skill.toLowerCase()) || { value: 30 };
    const rollVal = Math.floor(Math.random() * 100) + 1;
    const attackOutcome = evaluatePercentileRoll(skillObj.value, rollVal, { wpBonus });

    let lethalityResult = null;
    if (attackOutcome.isSuccess && weaponData.lethality > 0) {
      const lethalityRollVal = Math.floor(Math.random() * 100) + 1;
      lethalityResult = evaluateLethalityRoll(weaponData.lethality, lethalityRollVal);
    }

    const message = `
      <div class="dg-chat-card">
        <h3>${actor?.name || 'Agent'} — ${weaponData.name} Attack</h3>
        <p>Skill: ${weaponData.skill} (${attackOutcome.effectiveTarget}%) | Roll: <strong>${rollVal}</strong></p>
        <div class="result-badge ${attackOutcome.resultType}">
          ${attackOutcome.resultType.toUpperCase().replace('_', ' ')}
        </div>
        ${
          lethalityResult
            ? `
          <div class="lethality-chat-box">
            <strong>Lethality Roll (${weaponData.lethality}%):</strong> ${lethalityResult.roll}
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

  /** Execute direct Damage/Lethality Roll for a weapon */
  async triggerDamageRoll(weaponId) {
    const actor = this.resolveActiveActor();

    if (typeof game !== 'undefined' && game.combat?.started && !this.isUserTurn(actor)) {
      Logger.warn('Damage roll rejected: Not user turn in combat');
      if (typeof ui !== 'undefined' && ui.notifications) {
        ui.notifications.warn('You cannot roll damage when it is not your turn.');
      }
      return null;
    }

    const weapons = extractWeapons(actor);
    const weaponData = weapons.find((w) => w.id === weaponId) || weapons[0];

    const items = getActorItems(actor);
    const item = items.find((i) => (i.id || i._id) === weaponId) || items.find((i) => i.name === weaponData.name);

    if (item && typeof item.roll === 'function') {
      Logger.debug('Triggering direct item damage roll', { weaponName: item.name });
      return await item.roll(false);
    }

    Logger.warn('Cannot roll damage: Item document or item.roll method not found');
    return null;
  }

  /** Prompt user with pop-up dialog for Damage/Lethality on successful attack */
  async promptDamageRoll(item, isCritical = false, weaponData = null) {
    if (!item) return;

    const isLethal = Boolean(item.system?.isLethal || weaponData?.lethality > 0);
    const title = `${item.name} — ${isCritical ? 'Critical Hit!' : 'Attack Hit!'}`;
    const damageTypeLabel = isLethal ? 'Lethality' : 'Damage';
    const formulaText = isLethal ? `${item.system?.lethality || weaponData?.lethality}% Lethality` : `${item.system?.damage || weaponData?.damage || '1d10'}`;

    Logger.debug('Prompting damage/lethality pop-up dialog', { itemName: item.name, isLethal, isCritical });

    // 1. Foundry V12 DialogV2
    if (typeof foundry !== 'undefined' && foundry.applications?.api?.DialogV2) {
      const { DialogV2 } = foundry.applications.api;
      try {
        const confirmRoll = await DialogV2.confirm({
          window: { title },
          content: `
            <div style="padding: 4px;">
              <p><strong>${isCritical ? '🎯 CRITICAL SUCCESS!' : '💥 SUCCESSFUL HIT!'}</strong></p>
              <p>Would you like to roll <strong>${damageTypeLabel}</strong> for <strong>${item.name}</strong> (${formulaText})?</p>
            </div>
          `,
          yes: { label: `<i class="fas fa-dice"></i> Roll ${damageTypeLabel}` },
          no: { label: 'Skip' }
        });

        if (confirmRoll && typeof item.roll === 'function') {
          await item.roll(isCritical);
        }
        return;
      } catch (err) {
        Logger.warn('DialogV2 error, falling back to Dialog', err);
      }
    }

    // 2. Standard Foundry Dialog fallback
    if (typeof Dialog !== 'undefined') {
      new Dialog({
        title,
        content: `
          <div style="padding: 4px;">
            <p><strong>${isCritical ? '🎯 CRITICAL SUCCESS!' : '💥 SUCCESSFUL HIT!'}</strong></p>
            <p>Would you like to roll <strong>${damageTypeLabel}</strong> for <strong>${item.name}</strong> (${formulaText})?</p>
          </div>
        `,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice"></i>',
            label: `Roll ${damageTypeLabel}`,
            callback: async () => {
              if (typeof item.roll === 'function') await item.roll(isCritical);
            }
          },
          skip: {
            label: 'Skip'
          }
        },
        default: 'roll'
      }).render(true);
      return;
    }

    // 3. Fallback for unit testing
    if (typeof item.roll === 'function') {
      await item.roll(isCritical);
    }
  }

  /** Execute Sanity Roll */
  async triggerSanityRoll(event = {}) {
    const actor = this.resolveActiveActor();
    const wpBonus = this.wpBonusActive ? (this.wpBonusAmount || 20) : 0;
    this.wpBonusActive = false;
    this.wpBonusAmount = 0;

    const DGPercentileRoll = this.getDGRollClass('DGPercentileRoll');

    if (actor && DGPercentileRoll && typeof actor.sheet?.processRoll === 'function') {
      const rollOptions = {
        rollType: 'sanity',
        key: 'sanity',
        actor
      };

      const roll = new DGPercentileRoll('1D100', {}, rollOptions);
      if (wpBonus) roll.modifier += wpBonus;

      await actor.sheet.processRoll(event, roll);
      this.render();
      return roll;
    }

    // Fallback for unit testing or non-Foundry environment
    const vitals = extractVitals(actor);
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
