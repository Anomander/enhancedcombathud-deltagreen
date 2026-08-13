/**
 * Roll service.
 *
 * The system roll API is injected through the constructor's `loadApi` seam — a
 * production dependency boundary, not a test-only branch (TEST-3). The stub below
 * mirrors the real contract: DGPercentileRoll carries a mutable `modifier`, and
 * processDGRoll is the single exit point.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RollService } from '../scripts/roll-service.mjs';
import { EVENTS, on, clearListeners } from '../scripts/events.mjs';
import { makeAgent, makeWeapon } from './fixtures/dg-actors.mjs';

/**
 * Stub of systems/deltagreen/module/roll/roll.js.
 *
 * `processDGRoll` evaluates by default, because the real one does — and because
 * the service now charges Willpower and publishes outcomes only when a roll
 * actually happened. `rolls: false` reproduces the two ways the real pipeline
 * exits early: a blocked roll, and the player cancelling the modifier dialog.
 */
function makeRollApi({ rolls = true } = {}) {
  const processDGRoll = vi.fn(async (_event, roll) => {
    if (!rolls) return;
    roll._evaluated = true;
    roll.total = 42;
  });

  class DGPercentileRoll {
    constructor(formula, data, options) {
      this.formula = formula;
      this.options = options;
      this.modifier = 0;
    }
  }

  const createDGRollFromDataset = vi.fn((dataset, { actor, item, token }) => ({
    formula: '1D8',
    options: { rollType: dataset.rolltype, actor, item, token },
    modifier: 0
  }));

  return { DGPercentileRoll, processDGRoll, createDGRollFromDataset };
}

/** Stub of systems/deltagreen/module/roll/roll-dialogs.js */
function makeDialogApi(choice = 'damage') {
  return { showDamageOrLethalityChoiceDialog: vi.fn(async () => choice) };
}

let api;
let dialogs;
let service;
let actor;

function build({ rolls = true, choice = 'damage' } = {}) {
  api = makeRollApi({ rolls });
  dialogs = makeDialogApi(choice);
  service = new RollService({
    loadApi: async () => api,
    loadDialogApi: async () => dialogs
  });
}

beforeEach(() => {
  build();

  actor = makeAgent();
  actor.uuid = 'Actor.agent-1';
  actor.update = vi.fn(async (patch) => {
    const [, , key] = patch ? Object.keys(patch)[0].split('.') : [];
    if (key === 'value') actor.system.wp.value = Object.values(patch)[0];
  });

  globalThis.game = {
    settings: {
      get: (_module, key) => ({ enableWpBoost: true, wpBoostCost: 1, wpBoostPercent: 20 })[key]
    }
  };
});

afterEach(() => {
  clearListeners();
});

describe('Rolls go through the system pipeline', () => {
  it('routes a skill roll through processDGRoll', async () => {
    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(api.processDGRoll).toHaveBeenCalledOnce();
    const [, roll] = api.processDGRoll.mock.calls[0];
    expect(roll.options).toMatchObject({ rollType: 'skill', key: 'firearms', actor });
  });

  it('routes a sanity roll with the sanity key', async () => {
    await service.rollSanity({ actor, event: {} });
    const [, roll] = api.processDGRoll.mock.calls[0];
    expect(roll.options).toMatchObject({ rollType: 'sanity', key: 'sanity' });
  });

  it('routes a weapon attack with the weapon and its skill', async () => {
    const item = makeWeapon({ skill: 'firearms' });
    await service.rollWeaponAttack({ actor, item, event: {} });

    const [, roll] = api.processDGRoll.mock.calls[0];
    expect(roll.options).toMatchObject({ rollType: 'weapon', key: 'firearms', item });
  });

  it('passes the originating event through, so shift-click opens the modifier dialog', async () => {
    const event = { shiftKey: true };
    await service.rollSkill({ actor, skillKey: 'dodge', event });
    expect(api.processDGRoll.mock.calls[0][0]).toBe(event);
  });

});

describe('Damage and Lethality — the sheet\'s own control', () => {
  it('asks the system which to roll rather than deciding from isLethal', async () => {
    // A weapon can carry both a damage formula and a Lethality rating. Choosing
    // is the player's call (PAR-3), so the system's dialog is what decides.
    const item = makeWeapon({ damage: '2D10', lethality: 20, isLethal: true, skill: 'firearms' });

    await service.rollWeaponDamage({ actor, item, event: {} });

    expect(dialogs.showDamageOrLethalityChoiceDialog).toHaveBeenCalledOnce();
    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'damage' },
      expect.objectContaining({ actor, item })
    );
    expect(api.processDGRoll).toHaveBeenCalledOnce();
  });

  it('rolls Lethality when the player picks it', async () => {
    build({ choice: 'lethality' });
    const item = makeWeapon({ lethality: 20, isLethal: true });

    await service.rollWeaponDamage({ actor, item, event: {} });

    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'lethality' },
      expect.anything()
    );
  });

  it('rolls nothing when the player closes the dialog', async () => {
    build({ choice: null });
    // A weapon carrying both is the only one that opens the dialog at all.
    const item = makeWeapon({ damage: '2D10', lethality: 20, isLethal: true });

    const result = await service.rollWeaponDamage({ actor, item, event: {} });

    expect(result).toBeNull();
    expect(api.processDGRoll).not.toHaveBeenCalled();
  });

  /*
   * Reported from a live world. The sheet's weapon row renders *one* of three
   * controls (`weapons-section-partial.html`): the combined
   * `damage-or-lethality` control only when `hasWeaponDamageAndLethality`, a
   * plain `damage` control when only that, a plain `lethality` control when only
   * that, and an empty cell when neither. The HUD opened the choice dialog
   * unconditionally, so a Lethality-only weapon was asked a question the sheet
   * never asks — and offered a *Roll Damage* button that rolls an empty formula
   * (PAR-1, UX-1).
   */
  it('rolls Lethality straight away when the weapon has no damage formula', async () => {
    const item = makeWeapon({ damage: '', lethality: 20, isLethal: true });

    await service.rollWeaponDamage({ actor, item, event: {} });

    expect(dialogs.showDamageOrLethalityChoiceDialog).not.toHaveBeenCalled();
    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'lethality' },
      expect.objectContaining({ actor, item })
    );
    expect(api.processDGRoll).toHaveBeenCalledOnce();
  });

  it('treats a damage formula of "0" as no damage, exactly as the sheet does', async () => {
    const item = makeWeapon({ damage: '0', lethality: 15, isLethal: true });

    await service.rollWeaponDamage({ actor, item, event: {} });

    expect(dialogs.showDamageOrLethalityChoiceDialog).not.toHaveBeenCalled();
    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'lethality' },
      expect.anything()
    );
  });

  it('rolls damage straight away when the weapon has no Lethality rating', async () => {
    const item = makeWeapon({ damage: '1D12', lethality: 0 });

    await service.rollWeaponDamage({ actor, item, event: {} });

    expect(dialogs.showDamageOrLethalityChoiceDialog).not.toHaveBeenCalled();
    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'damage' },
      expect.objectContaining({ actor, item })
    );
  });

  it('refuses out loud when the weapon offers neither, rather than asking', async () => {
    const warn = vi.fn();
    globalThis.ui = { notifications: { warn } };
    const item = makeWeapon({ damage: '', lethality: 0 });

    const result = await service.rollWeaponDamage({ actor, item, event: {} });

    expect(result).toBeNull();
    expect(dialogs.showDamageOrLethalityChoiceDialog).not.toHaveBeenCalled();
    expect(api.processDGRoll).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('still honours a choice the caller has already made', async () => {
    // The damage prompt confirms the single option itself, then says which.
    const item = makeWeapon({ damage: '', lethality: 20, isLethal: true });

    await service.rollWeaponDamage({ actor, item, event: {}, choice: 'lethality' });

    expect(dialogs.showDamageOrLethalityChoiceDialog).not.toHaveBeenCalled();
    expect(api.createDGRollFromDataset).toHaveBeenCalledWith(
      { rolltype: 'lethality' },
      expect.anything()
    );
  });

  // Found in a live world, not by these tests. `processDGRoll` opens the
  // modifier dialog on `shiftKey || which === 3`, because right-clicking a roll
  // control on the character sheet is how you ask for modifiers. In the HUD,
  // right-click is how you *reach* damage — so forwarding the raw event made
  // every damage roll open a modifier dialog nobody asked for, and the roll
  // never completed.
  it('does not let the right-click gesture be read as a request for modifiers', async () => {
    const rightClick = { which: 3, button: 2, shiftKey: false };

    await service.rollWeaponDamage({ actor, item: makeWeapon(), event: rightClick });

    const [passed] = api.processDGRoll.mock.calls[0];
    expect(passed.which).toBeUndefined();
    expect(passed.shiftKey).toBe(false);
  });

  it('still opens the modifier dialog on shift+right-click, as the sheet does on shift-click', async () => {
    await service.rollWeaponDamage({ actor, item: makeWeapon(), event: { which: 3, shiftKey: true } });

    const [passed] = api.processDGRoll.mock.calls[0];
    expect(passed.shiftKey).toBe(true);
    expect(passed.which).toBeUndefined();
  });
});

describe('Token normalisation', () => {
  it('passes a TokenDocument, never a PIXI placeable', async () => {
    // The roll's options are serialised into the chat message. A Token placeable
    // is circular and throws "Converting circular structure to JSON", which loses
    // the roll silently. Argon hands components the placeable.
    const tokenDocument = { id: 'token-doc-1', name: 'C' };
    const placeable = { document: tokenDocument, /* circular, as PIXI objects are */ parent: {} };
    placeable.parent.self = placeable;

    await service.rollSkill({ actor, token: placeable, skillKey: 'firearms', event: {} });

    const [, roll] = api.processDGRoll.mock.calls[0];
    expect(roll.options.token).toBe(tokenDocument);
    expect(() => JSON.stringify(roll.options.token)).not.toThrow();
  });

  it('accepts a TokenDocument unchanged', async () => {
    const tokenDocument = { id: 'token-doc-2' };
    await service.rollSkill({ actor, token: tokenDocument, skillKey: 'dodge', event: {} });
    expect(api.processDGRoll.mock.calls[0][1].options.token).toBe(tokenDocument);
  });

  it('tolerates no token', async () => {
    await service.rollSanity({ actor, event: {} });
    expect(api.processDGRoll.mock.calls[0][1].options.token).toBeNull();
  });
});

describe('Willpower Boost — armed now, paid for after the roll', () => {
  it('arms without spending anything', async () => {
    const result = service.toggleWillpowerBoost(actor);

    expect(result.armed).toBe(true);
    expect(result.bonus).toBe(20);
    expect(actor.update).not.toHaveBeenCalled();
    expect(actor.system.wp.value).toBe(7);
  });

  it('charges only once the dice have been rolled', async () => {
    service.toggleWillpowerBoost(actor);
    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(api.processDGRoll.mock.calls[0][1].modifier).toBe(20);
    expect(actor.update).toHaveBeenCalledWith({ 'system.wp.value': 6 });
  });

  it('applies to the next roll only', async () => {
    service.toggleWillpowerBoost(actor);

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });
    expect(api.processDGRoll.mock.calls[0][1].modifier).toBe(20);

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });
    expect(api.processDGRoll.mock.calls[1][1].modifier).toBe(0);
  });

  it('clicking again disarms, at no cost', async () => {
    expect(service.toggleWillpowerBoost(actor).armed).toBe(true);
    expect(service.toggleWillpowerBoost(actor).armed).toBe(false);

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(api.processDGRoll.mock.calls[0][1].modifier).toBe(0);
    expect(actor.update).not.toHaveBeenCalled();
  });

  // The bug this design exists to prevent. `processDGRoll` exits early on a
  // blocked roll and when the player cancels the modifier dialog; charging
  // before it returned meant paying for a roll that never happened.
  it('charges nothing and stays armed when the roll never happens', async () => {
    build({ rolls: false });
    service.toggleWillpowerBoost(actor);

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(actor.update).not.toHaveBeenCalled();
    expect(actor.system.wp.value).toBe(7);
    expect(service.isBoostArmed(actor)).toBe(true);
  });

  it('does not add a modifier when no boost is armed', async () => {
    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });
    expect(api.processDGRoll.mock.calls[0][1].modifier).toBe(0);
  });

  it('keeps boosts separate between actors', () => {
    const other = makeAgent({ name: 'Agent Cole' });
    other.uuid = 'Actor.agent-2';

    service.toggleWillpowerBoost(actor);

    expect(service.isBoostArmed(actor)).toBe(true);
    expect(service.isBoostArmed(other)).toBe(false);
  });

  it('refuses to arm when the setting is disabled', () => {
    globalThis.game.settings.get = (_m, key) => (key === 'enableWpBoost' ? false : 1);

    const result = service.toggleWillpowerBoost(actor);
    expect(result.armed).toBe(false);
    expect(result.reason).toBe('DG_HUD.Notifications.WpBoostDisabled');
  });

  it('refuses to arm when Willpower is short', () => {
    actor.system.wp.value = 0;

    const result = service.toggleWillpowerBoost(actor);
    expect(result.armed).toBe(false);
    expect(service.isBoostArmed(actor)).toBe(false);
  });

  it('drops an armed boost that became unaffordable, and rolls unboosted', async () => {
    service.toggleWillpowerBoost(actor);
    actor.system.wp.value = 0; // spent elsewhere between arming and rolling

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(api.processDGRoll.mock.calls[0][1].modifier).toBe(0);
    expect(actor.update).not.toHaveBeenCalled();
    expect(service.isBoostArmed(actor)).toBe(false);
  });
});

describe('Roll outcomes are published', () => {
  it('publishes an outcome once a roll is evaluated', async () => {
    const heard = [];
    on(EVENTS.ROLL_OUTCOME, (outcome) => heard.push(outcome));

    const item = makeWeapon({ skill: 'firearms' });
    await service.rollWeaponAttack({ actor, item, event: {} });

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ type: 'weapon', actor, item, total: 42 });
  });

  it('publishes nothing when the roll never happened', async () => {
    build({ rolls: false });
    const heard = [];
    on(EVENTS.ROLL_OUTCOME, (outcome) => heard.push(outcome));

    await service.rollSkill({ actor, skillKey: 'firearms', event: {} });

    expect(heard).toHaveLength(0);
  });

  it('does not let a failing subscriber break the roll', async () => {
    on(EVENTS.ROLL_OUTCOME, () => {
      throw new Error('subscriber exploded');
    });

    await expect(service.rollSkill({ actor, skillKey: 'firearms', event: {} })).resolves.toBeTruthy();
  });
});
