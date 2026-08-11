import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaGreenCombatHudApp } from '../scripts/hud-app.mjs';

function createMockElement(tagName = 'div') {
  const classes = new Set();
  const children = [];
  let _className = '';
  return {
    tagName,
    get className() { return _className; },
    set className(val) {
      _className = val;
      classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        } else if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains: (name) => classes.has(name)
    },
    appendChild: (child) => children.push(child),
    querySelectorAll: () => [],
    querySelector: () => null
  };
}

describe('DeltaGreenCombatHudApp Display & Combat Controls', () => {
  let hudApp;
  let mockContainer;

  beforeEach(() => {
    mockContainer = createMockElement('div');
    hudApp = new DeltaGreenCombatHudApp();
    
    // Mock document.createElement for mount
    globalThis.document = {
      createElement: (tag) => createMockElement(tag)
    };
    
    hudApp.mount(mockContainer);
  });

  it('initializes hidden in DOM', () => {
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });

  it('slides up on show() and slides down on hide()', () => {
    hudApp.show();
    expect(hudApp.visible).toBe(true);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(false);

    hudApp.hide();
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });

  it('toggles visibility on toggle()', () => {
    hudApp.toggle();
    expect(hudApp.visible).toBe(true);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(false);

    hudApp.toggle();
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });

  it('resolves active combatant actor during combat even when no token is manually selected', () => {
    const mockActor = { id: 'actor-c', name: 'Agent C' };
    globalThis.game = {
      combat: {
        started: true,
        combatant: { actor: mockActor }
      }
    };

    const resolved = hudApp.resolveActiveActor();
    expect(resolved).toBe(mockActor);
  });

  it('correctly evaluates turn ownership in combat', () => {
    const myActor = { id: 'actor-me', isOwner: true };
    const otherActor = { id: 'actor-other', isOwner: false };

    // When GM, always returns true
    globalThis.game = {
      user: { isGM: true },
      combat: { started: true, combatant: { actor: otherActor } }
    };
    expect(hudApp.isUserTurn(otherActor)).toBe(true);

    // When Player and it is another player's turn, returns false
    globalThis.game = {
      user: { isGM: false, id: 'user-player' },
      combat: { started: true, combatant: { actor: otherActor } }
    };
    expect(hudApp.isUserTurn(myActor)).toBe(false);

    // When Player and it IS my player's turn, returns true
    globalThis.game = {
      user: { isGM: false, id: 'user-player' },
      combat: { started: true, combatant: { actor: myActor } }
    };
    expect(hudApp.isUserTurn(myActor)).toBe(true);
  });

  it('rejects weapon attack rolls when it is not user turn in combat', async () => {
    const otherActor = { id: 'actor-other', isOwner: false };
    globalThis.game = {
      user: { isGM: false, id: 'user-player' },
      combat: { started: true, combatant: { actor: otherActor } },
      settings: { get: () => true }
    };

    hudApp.show();
    const rollResult = await hudApp.triggerWeaponRoll('unarmed-strike');
    expect(rollResult).toBeNull();
  });

  it('prompts damage/lethality pop-up on successful attack roll', async () => {
    let damageRolled = false;
    const mockItem = {
      name: 'M4 Carbine',
      system: { damage: '1D12', lethality: 10, skill: 'firearms' },
      roll: async (isCrit) => {
        damageRolled = true;
        return { isCrit };
      }
    };

    await hudApp.promptDamageRoll(mockItem, true);
    expect(damageRolled).toBe(true);
  });

  it('triggers direct weapon damage roll via triggerDamageRoll', async () => {
    let damageRolled = false;
    const mockActor = {
      id: 'actor-1',
      name: 'Agent Alphonse',
      isOwner: true,
      items: [
        {
          id: 'w1',
          name: 'Pistol',
          type: 'weapon',
          system: { damage: '1D8', skill: 'firearms' },
          roll: async () => {
            damageRolled = true;
            return { rolled: true };
          }
        }
      ]
    };

    globalThis.game = {
      user: { isGM: true },
      combat: { started: false }
    };
    hudApp.controlledActor = mockActor;

    await hudApp.triggerDamageRoll('w1');
    expect(damageRolled).toBe(true);
  });
});
