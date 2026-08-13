/**
 * Actor and item fixtures shaped from the Delta Green system's own schema.
 *
 * Skill keys, item field names and actor-type capabilities all come from
 * tests/fixtures/system-schema.json, which is generated from the installed system
 * by `npm run sync:schema`. Nothing here is a hand-written guess at the data model
 * — that is what let the previous suite pass against shapes the system never had.
 *
 * See TEST-1 in the migration invariants.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const SCHEMA = require('./system-schema.json');

/** Foundry hands modules an EmbeddedCollection, not an array. Mimic enough of it. */
class FakeEmbeddedCollection extends Map {
  constructor(documents) {
    super(documents.map((doc) => [doc.id, doc]));
  }

  get contents() {
    return [...this.values()];
  }
}

/**
 * Build a full skills block for an actor type.
 * @param {'human'|'unnatural'} skillSet - Which schema list to use.
 * @param {Record<string, number>} [proficiencies] - Per-key overrides.
 * @returns {object} `{ <key>: { proficiency, label, failure } }`
 */
export function makeSkills(skillSet = 'human', proficiencies = {}) {
  const keys = SCHEMA.skills[skillSet];
  const skills = {};

  for (const key of keys) {
    skills[key] = {
      proficiency: proficiencies[key] ?? 0,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      failure: false
    };
  }

  return skills;
}

/**
 * Build a weapon item.
 * @param {object} [overrides] - Any `system` field from the weapon schema.
 */
export function makeWeapon({ id = 'weapon-1', name = 'M4 Carbine', img = 'icons/weapons/rifle.webp', ...system } = {}) {
  return {
    id,
    _id: id,
    name,
    img,
    type: 'weapon',
    system: {
      skill: 'firearms',
      skillModifier: 0,
      damage: '1D12',
      lethality: 0,
      isLethal: false,
      ammo: '30',
      range: '50m',
      armorPiercing: 0,
      killRadius: '',
      customSkillTarget: 0,
      expense: 'Standard',
      equipped: true,
      ...system
    }
  };
}

/**
 * Build an armor item. Only `equipped` armour contributes protection.
 * @param {object} [overrides]
 */
export function makeArmor({ id = 'armor-1', name = 'Kevlar Vest', protection = 3, equipped = true } = {}) {
  return {
    id,
    _id: id,
    name,
    img: 'icons/equipment/vest.webp',
    type: 'armor',
    system: { protection, equipped, expense: 'Standard' }
  };
}

/** Build a gear item — the real type name; there is no `equipment` type. */
export function makeGear({ id = 'gear-1', name = 'Flashlight' } = {}) {
  return {
    id,
    _id: id,
    name,
    img: 'icons/tools/flashlight.webp',
    type: 'gear',
    system: { expense: 'Standard', equipped: true }
  };
}

/**
 * Compute `system.health.protection` the way the system does in prepareDerivedData,
 * so fixtures carry the derived field a live actor would already have.
 */
function deriveProtection(items) {
  return items
    .filter((item) => item.type === 'armor' && item.system.equipped === true)
    .reduce((total, item) => total + item.system.protection, 0);
}

function resource(value, max) {
  return { value, max, min: 0 };
}

/**
 * Build an Agent actor — the fully-featured type: health, wp, sanity with
 * value/max/currentBreakingPoint, statistics and the 36 human skills.
 */
export function makeAgent({
  name = 'Agent Baker',
  img = 'tokens/baker.webp',
  hp = [9, 11],
  wp = [7, 12],
  sanity = 44,
  sanityMax = 99,
  breakingPoint = 38,
  proficiencies = { firearms: 60, unarmed_combat: 55, dodge: 45, occult: 15 },
  items = [makeWeapon(), makeArmor()]
} = {}) {
  return {
    id: 'actor-agent',
    _id: 'actor-agent',
    name,
    img,
    type: 'agent',
    isOwner: true,
    items: new FakeEmbeddedCollection(items),
    system: {
      health: { ...resource(hp[0], hp[1]), protection: deriveProtection(items) },
      wp: resource(wp[0], wp[1]),
      sanity: {
        value: sanity,
        max: sanityMax,
        currentBreakingPoint: breakingPoint,
        // Derived by the system in prepareBreakingPointHit.
        breakingPointHit: sanity <= breakingPoint,
        maxBonus: 0,
        adaptations: {
          violence: { incident1: false, incident2: false, incident3: false },
          helplessness: { incident1: false, incident2: false, incident3: false }
        }
      },
      statistics: {
        str: { value: 12, x5: 60 },
        con: { value: 11, x5: 55 },
        dex: { value: 13, x5: 65 },
        int: { value: 14, x5: 70 },
        pow: { value: 10, x5: 50 },
        cha: { value: 9, x5: 45 }
      },
      skills: makeSkills('human', proficiencies),
      typedSkills: {},
      specialTraining: [],
      rollTarget: { allSkills: 0, sanity: 0, statistics: 0 },
      physical: { exhausted: false, exhaustedPenalty: -20 },
      schemaVersion: 2.0
    }
  };
}

/**
 * Build an NPC actor. Unlike an Agent it has no `maxBonus` or `adaptations`,
 * but it DOES carry sanity value/max/currentBreakingPoint.
 */
export function makeNpc({
  name = 'Cult Enforcer',
  hp = [10, 10],
  wp = [10, 10],
  sanity = 50,
  breakingPoint = 40,
  items = [makeWeapon({ id: 'weapon-npc', name: 'Pipe' })]
} = {}) {
  return {
    id: 'actor-npc',
    _id: 'actor-npc',
    name,
    img: 'tokens/enforcer.webp',
    type: 'npc',
    isOwner: false,
    items: new FakeEmbeddedCollection(items),
    system: {
      health: { ...resource(hp[0], hp[1]), protection: deriveProtection(items) },
      wp: resource(wp[0], wp[1]),
      sanity: { value: sanity, max: 99, currentBreakingPoint: breakingPoint },
      statistics: {
        str: { value: 13, x5: 65 },
        con: { value: 12, x5: 60 },
        dex: { value: 11, x5: 55 },
        int: { value: 10, x5: 50 },
        pow: { value: 10, x5: 50 },
        cha: { value: 8, x5: 40 }
      },
      skills: makeSkills('human', { firearms: 40, melee_weapons: 50 }),
      typedSkills: {},
      specialTraining: [],
      schemaVersion: 2.0
    }
  };
}

/**
 * Build an Unnatural actor. Its `sanity` block holds only SAN-loss formulas —
 * there is no value, max or breaking point. The HUD must omit those rather than
 * substitute a default (SYS-5).
 */
export function makeUnnatural({
  name = 'Thing in the Cellar',
  hp = [30, 30],
  wp = [20, 20],
  items = []
} = {}) {
  return {
    id: 'actor-unnatural',
    _id: 'actor-unnatural',
    name,
    img: 'tokens/thing.webp',
    type: 'unnatural',
    isOwner: false,
    items: new FakeEmbeddedCollection(items),
    system: {
      health: { ...resource(hp[0], hp[1]), protection: deriveProtection(items) },
      wp: resource(wp[0], wp[1]),
      sanity: { notes: '', failedLoss: '1D6', successLoss: '1' },
      statistics: {
        str: { value: 20, x5: 100 },
        con: { value: 18, x5: 90 },
        dex: { value: 14, x5: 70 },
        int: { value: 8, x5: 40 },
        pow: { value: 16, x5: 80 },
        cha: { value: 3, x5: 15 }
      },
      skills: makeSkills('unnatural', { alertness: 50, athletics: 50 }),
      schemaVersion: 2.0
    }
  };
}

/** Build a Vehicle actor — health only. Never eligible for the HUD. */
export function makeVehicle({ name = 'Surveillance Van', hp = [15, 15], items = [] } = {}) {
  return {
    id: 'actor-vehicle',
    _id: 'actor-vehicle',
    name,
    img: 'tokens/van.webp',
    type: 'vehicle',
    isOwner: true,
    items: new FakeEmbeddedCollection(items),
    system: {
      health: { ...resource(hp[0], hp[1]), protection: deriveProtection(items) },
      speed: '',
      expense: 'Standard',
      passengers: []
    }
  };
}
