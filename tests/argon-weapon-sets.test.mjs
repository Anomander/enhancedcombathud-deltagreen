/**
 * The weapon sets component, driven the way Argon drives it.
 *
 * The component itself is presentation (ARCH-6) and the arithmetic under it is
 * covered by weapon-sets.test.mjs — but every defect this file exists for lived
 * in the *sequence*: what Argon calls, in what order, with what it has already
 * resolved. So the harness below reproduces Argon's own flow rather than calling
 * the component's methods in isolation.
 *
 * `stubArgon` mirrors `WeaponSets` and `ArgonComponent` from
 * enhancedcombathud 5.0.1 (tests/fixtures/argon-contract.json pins the surface):
 * `actor` reads `ui.ARGON._actor`, `getDefaultSets` returns three empty sets, and
 * `_getSets` merges the saved flag over the defaults and resolves each uuid.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWeaponSets } from '../scripts/argon/weapon-sets.mjs';
import { makeWeapon, makeArmor } from './fixtures/dg-actors.mjs';

const SCOPE = 'enhancedcombathud';

/** Argon's `WeaponSets`, reduced to what a subclass can observe. */
function stubArgon() {
  return {
    WeaponSets: class WeaponSets {
      get actor() {
        return globalThis.ui.ARGON._actor;
      }

      async getDefaultSets() {
        return {
          1: { primary: null, secondary: null },
          2: { primary: null, secondary: null },
          3: { primary: null, secondary: null }
        };
      }
    }
  };
}

/** `foundry.utils.mergeObject`, for the two-level shape a set layout has. */
function merge(original, other) {
  const result = { ...original };
  for (const [key, value] of Object.entries(other)) {
    result[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? merge(result[key] ?? {}, value)
        : value;
  }
  return result;
}

/**
 * A world containing one actor and whatever else can be dragged into a set.
 * @param {object} [options]
 * @param {Array<object>} [options.items] - What the actor carries.
 * @param {boolean} [options.isOwner] - Whether this client may write to it.
 * @param {object} [options.saved] - Sets already stored in Argon's flag.
 * @param {Array<object>} [options.elsewhere] - Documents outside the actor.
 */
function world({ items = [], isOwner = true, saved, elsewhere = [] } = {}) {
  const flags = { [SCOPE]: saved === undefined ? {} : { weaponSets: saved } };
  const updates = [];

  const actor = {
    id: 'actor-agent',
    isOwner,
    items,
    getFlag: (scope, key) => flags[scope]?.[key],
    setFlag: vi.fn(async (scope, key, value) => {
      flags[scope] = { ...flags[scope], [key]: value };
    }),
    updateEmbeddedDocuments: vi.fn(async (type, changes) => {
      updates.push(...changes);
      for (const change of changes) {
        const item = items.find((candidate) => candidate.id === change._id);
        item.system.equipped = change['system.equipped'];
      }
    })
  };

  const byUuid = new Map([...items, ...elsewhere].map((doc) => [doc.uuid, doc]));

  globalThis.ui = {
    ARGON: { _actor: actor, refresh: vi.fn() },
    notifications: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  };
  globalThis.game = {
    i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` },
    settings: { get: () => false }
  };

  const DGWeaponSets = createWeaponSets(stubArgon());
  const component = new DGWeaponSets();

  /** Argon's `_getSets`: defaults, the saved flag over them, then resolution. */
  async function getSets() {
    const raw = merge(await component.getDefaultSets(), actor.getFlag(SCOPE, 'weaponSets') ?? {});
    const sets = {};
    for (const [key, slots] of Object.entries(raw)) {
      sets[key] = {
        primary: slots.primary ? byUuid.get(slots.primary) ?? null : null,
        secondary: slots.secondary ? byUuid.get(slots.secondary) ?? null : null
      };
    }
    return sets;
  }

  /** One render: Argon resolves the sets, then reconciles the active one. */
  async function render(active = '1') {
    const sets = await getSets();
    await component._onSetChange({ sets, active });
    return sets;
  }

  return {
    actor,
    component,
    updates,
    render,
    getSets,
    savedSets: () => actor.getFlag(SCOPE, 'weaponSets'),
    equipped: () => items.filter((item) => item.system?.equipped).map((item) => item.id)
  };
}

function pistol(overrides = {}) {
  return makeWeapon({ id: 'w-pistol', name: 'M1911', equipped: true, ...overrides });
}

function rifle(overrides = {}) {
  return makeWeapon({ id: 'w-rifle', name: 'M4 Carbine', equipped: false, ...overrides });
}

afterEach(() => {
  delete globalThis.ui;
  delete globalThis.game;
  vi.restoreAllMocks();
});

describe('Seeding the first set', () => {
  it('offers the equipped loadout before anyone configures anything', async () => {
    const hud = world({ items: [pistol(), rifle({ equipped: true })] });

    const sets = await hud.getSets();

    expect(sets['1'].primary.id).toBe('w-pistol');
    expect(sets['1'].secondary.id).toBe('w-rifle');
  });

  it('persists the seed, so it stops being recomputed', async () => {
    const hud = world({ items: [pistol()] });

    await hud.getSets();

    expect(hud.savedSets()['1'].primary).toBe('Actor.actor-agent.Item.w-pistol');
  });

  it('keeps set 1 when the player switches to another set', async () => {
    // The defect: the seed was computed from what is equipped, and switching
    // sets is what changes that — so set 1 re-seeded itself from set 2's weapon
    // and the pistol nobody had assigned anywhere vanished from the HUD.
    const hud = world({ items: [pistol(), rifle()] });

    await hud.render('1');
    hud.actor.setFlag(SCOPE, 'weaponSets', {
      ...hud.savedSets(),
      2: { primary: 'Actor.actor-agent.Item.w-rifle', secondary: null }
    });
    await hud.render('2');

    expect(hud.equipped()).toEqual(['w-rifle']);

    const sets = await hud.getSets();
    expect(sets['1'].primary.id).toBe('w-pistol');
  });

  it('returns to the original loadout when the player switches back', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      saved: { 2: { primary: 'Actor.actor-agent.Item.w-rifle', secondary: null } }
    });

    await hud.render('1');
    await hud.render('2');
    await hud.render('1');

    expect(hud.equipped()).toEqual(['w-pistol']);
  });

  it('seeds only once, however many times Argon renders', async () => {
    const hud = world({ items: [pistol()] });

    await hud.getSets();
    await hud.getSets();
    await hud.getSets();

    expect(hud.actor.setFlag).toHaveBeenCalledTimes(1);
  });

  it('does not re-seed a set 1 the player emptied', async () => {
    const hud = world({
      items: [pistol()],
      saved: { 1: { primary: null, secondary: null } }
    });

    const sets = await hud.getSets();

    expect(sets['1'].primary).toBeNull();
    expect(hud.actor.setFlag).not.toHaveBeenCalled();
  });

  it('shows a Handler the seed without writing to someone else’s Agent', async () => {
    const hud = world({ items: [pistol()], isOwner: false });

    const sets = await hud.getSets();

    expect(sets['1'].primary.id).toBe('w-pistol');
    expect(hud.actor.setFlag).not.toHaveBeenCalled();
  });

  it('seeds nothing for an Agent carrying nothing', async () => {
    const hud = world({ items: [makeArmor()] });

    await hud.getSets();

    expect(hud.actor.setFlag).not.toHaveBeenCalled();
  });

  it('survives having no actor bound', async () => {
    const hud = world({ items: [pistol()] });
    globalThis.ui.ARGON._actor = null;

    await expect(hud.component.getDefaultSets()).resolves.toEqual({
      1: { primary: null, secondary: null },
      2: { primary: null, secondary: null },
      3: { primary: null, secondary: null }
    });
  });
});

describe('Switching sets', () => {
  it('equips the set and unequips everything else', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      saved: { 2: { primary: 'Actor.actor-agent.Item.w-rifle', secondary: null } }
    });

    await hud.render('2');

    expect(hud.equipped()).toEqual(['w-rifle']);
  });

  it('refreshes the HUD, because the Attacks panel is built from the loadout', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      saved: { 2: { primary: 'Actor.actor-agent.Item.w-rifle', secondary: null } }
    });

    await hud.render('2');

    expect(globalThis.ui.ARGON.refresh).toHaveBeenCalled();
  });

  it('writes nothing when the loadout already matches', async () => {
    const hud = world({
      items: [pistol()],
      saved: { 1: { primary: 'Actor.actor-agent.Item.w-pistol', secondary: null } }
    });

    await hud.render('1');

    expect(hud.actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
    expect(globalThis.ui.ARGON.refresh).not.toHaveBeenCalled();
  });

  it('leaves the loadout alone for a set nobody configured', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      saved: { 1: { primary: null, secondary: null }, 3: { primary: null, secondary: null } }
    });

    await hud.render('3');

    expect(hud.equipped()).toEqual(['w-pistol']);
  });

  it('never writes to an Agent this client does not own', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      isOwner: false,
      saved: { 2: { primary: 'Actor.actor-agent.Item.w-rifle', secondary: null } }
    });

    await hud.render('2');

    expect(hud.actor.updateEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('survives an active set Argon has no entry for', async () => {
    const hud = world({ items: [pistol()] });

    await expect(hud.render('9')).resolves.toBeDefined();
    expect(hud.equipped()).toEqual(['w-pistol']);
  });
});

describe('Weapons that leave the Agent', () => {
  const gone = 'Actor.actor-agent.Item.w-shotgun';

  it('forgets a set entry whose weapon was deleted', async () => {
    const hud = world({
      items: [pistol()],
      saved: { 2: { primary: gone, secondary: null } }
    });

    await hud.render('1');

    expect(hud.savedSets()['2'].primary).toBeNull();
  });

  it('says so, because it changed the Agent’s data (AUTO-3)', async () => {
    const hud = world({ items: [pistol()], saved: { 2: { primary: gone, secondary: null } } });

    await hud.render('1');

    expect(globalThis.ui.notifications.info).toHaveBeenCalledWith(
      expect.stringContaining('DG_HUD.Notifications.WeaponSetsPruned')
    );
  });

  it('keeps the Agent’s remaining weapons when the active set empties out', async () => {
    // Deleting the weapon a set holds must not be read as "equip nothing" —
    // that would blank the Attacks panel of an Agent who is still armed.
    const hud = world({
      items: [pistol()],
      saved: { 2: { primary: gone, secondary: null } }
    });

    await hud.render('2');

    expect(hud.equipped()).toEqual(['w-pistol']);
  });

  it('leaves the other slot of a half-emptied set working', async () => {
    const hud = world({
      items: [pistol(), rifle()],
      saved: { 2: { primary: gone, secondary: 'Actor.actor-agent.Item.w-rifle' } }
    });

    await hud.render('2');

    expect(hud.equipped()).toEqual(['w-rifle']);
    expect(hud.savedSets()['2']).toEqual({
      primary: null,
      secondary: 'Actor.actor-agent.Item.w-rifle'
    });
  });

  it('prunes once and then stays quiet', async () => {
    const hud = world({ items: [pistol()], saved: { 2: { primary: gone, secondary: null } } });

    await hud.render('1');
    globalThis.ui.notifications.info.mockClear();
    await hud.render('1');

    expect(globalThis.ui.notifications.info).not.toHaveBeenCalled();
  });

  it('touches nothing when every set names a carried weapon', async () => {
    const hud = world({
      items: [pistol()],
      saved: { 1: { primary: 'Actor.actor-agent.Item.w-pistol', secondary: null } }
    });

    await hud.render('1');

    expect(hud.actor.setFlag).not.toHaveBeenCalled();
    expect(globalThis.ui.notifications.info).not.toHaveBeenCalled();
  });

  it('does not prune another player’s sets on a Handler’s screen', async () => {
    const hud = world({
      items: [pistol()],
      isOwner: false,
      saved: { 2: { primary: gone, secondary: null } }
    });

    await hud.render('1');

    expect(hud.actor.setFlag).not.toHaveBeenCalled();
  });
});

describe('Things that were never this Agent’s weapons', () => {
  it('forgets a weapon dragged in from another Agent’s sheet', async () => {
    const foreign = makeWeapon({ id: 'w-rifle', uuid: 'Actor.other.Item.w-rifle' });
    const hud = world({
      items: [pistol()],
      elsewhere: [foreign],
      saved: { 2: { primary: foreign.uuid, secondary: null } }
    });

    await hud.render('1');

    expect(hud.savedSets()['2'].primary).toBeNull();
  });

  it('does not strip the loadout to equip a weapon the Agent does not carry', async () => {
    const foreign = makeWeapon({ id: 'w-rifle', uuid: 'Compendium.dg.weapons.Item.w-rifle' });
    const hud = world({
      items: [pistol()],
      elsewhere: [foreign],
      saved: { 2: { primary: foreign.uuid, secondary: null } }
    });

    await hud.render('2');

    expect(hud.equipped()).toEqual(['w-pistol']);
  });

  it('forgets gear dropped into a weapon slot', async () => {
    const gear = { id: 'gear-1', _id: 'gear-1', uuid: 'Actor.actor-agent.Item.gear-1', type: 'gear', system: {} };
    const hud = world({
      items: [pistol(), gear],
      saved: { 3: { primary: gear.uuid, secondary: null } }
    });

    await hud.render('3');

    expect(hud.savedSets()['3'].primary).toBeNull();
    expect(hud.equipped()).toEqual(['w-pistol']);
  });
});
