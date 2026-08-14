/**
 * Adapter translating Delta Green actor documents into HUD-shaped data.
 *
 * Every path here is verified against deltagreen 2.0.1 (SYS-1); the schema file
 * each one comes from is cited inline. Where an actor type genuinely lacks a
 * stat, the adapter reports it as unavailable rather than substituting a default
 * (SYS-5) — a confident wrong number is worse than a blank.
 */

/** Actor types the HUD supports. `vehicle` has no WP, sanity or skills. */
export const SUPPORTED_ACTOR_TYPES = ['agent', 'npc', 'unnatural'];

/** An absent numeric stat, reported honestly rather than defaulted. */
const UNAVAILABLE = Object.freeze({ value: null, max: null, percentage: 0, available: false });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Read a `resourceField` block — `{min, value, max}` per
 * systems/deltagreen/module/data/actor/base/general.js.
 * @returns {{value: number, max: number, percentage: number, available: true}}
 */
function readResource(raw) {
  const value = Number(raw.value ?? 0);
  const max = Number(raw.max ?? 0);
  return {
    value,
    max,
    percentage: max > 0 ? clamp(Math.round((value / max) * 100), 0, 100) : 0,
    available: true
  };
}

/**
 * Safely convert actor.items (EmbeddedCollection, Map, Set or Array) to an Array.
 * @param {object} actor
 * @returns {Array<object>}
 */
export function getActorItems(actor) {
  if (!actor?.items) return [];
  if (Array.isArray(actor.items)) return actor.items;
  if (Array.isArray(actor.items.contents)) return actor.items.contents;
  if (typeof actor.items.values === 'function') return Array.from(actor.items.values());
  if (typeof actor.items[Symbol.iterator] === 'function') return Array.from(actor.items);
  return [];
}

/**
 * Does this actor type carry a numeric Sanity?
 *
 * `agent` and `npc` define sanity as {value, max, currentBreakingPoint}; on
 * `unnatural` the same key holds only {notes, failedLoss, successLoss}, and
 * `vehicle` has no sanity at all.
 * See systems/deltagreen/module/data/actor/{agent,npc,unnatural,vehicle}.js
 */
function hasNumericSanity(actor) {
  return typeof actor?.system?.sanity?.value === 'number';
}

/** Should Sanity be masked from this user? Honours the system's own setting (UX-5). */
function shouldHideSanity() {
  if (globalThis.game?.user?.isGM) return false;

  try {
    return Boolean(globalThis.game?.settings?.get('deltagreen', 'keepSanityPrivate'));
  } catch {
    // The system registers this setting; a world mid-migration may not have it yet.
    return false;
  }
}

/**
 * Extract vital statistics for the portrait panel.
 * @param {object|null} actor - A Delta Green actor document.
 * @returns {object} Vitals, with `available: false` on anything this actor lacks.
 */
export function extractVitals(actor) {
  if (!actor) {
    return {
      hp: { ...UNAVAILABLE },
      wp: { ...UNAVAILABLE },
      san: { ...UNAVAILABLE },
      breakingPoint: null,
      breakingPointHit: false,
      armor: 0,
      name: '',
      img: 'icons/svg/mystery-man.svg',
      type: null
    };
  }

  const sys = actor.system ?? {};

  // health and wp are resourceFields on every actor type except vehicle, which
  // has health only. base-actor.js / agent.js / vehicle.js
  const hp = sys.health ? readResource(sys.health) : { ...UNAVAILABLE };
  const wp = sys.wp ? readResource(sys.wp) : { ...UNAVAILABLE };

  // Armour is derived by the system onto system.health.protection in each type's
  // prepareDerivedData — read it rather than recomputing from items (SYS-4).
  const armor = Number(sys.health?.protection ?? 0);

  let san = { ...UNAVAILABLE };
  let breakingPoint = null;
  // Derived by the system as `sanity.value <= sanity.currentBreakingPoint`.
  // See module/data/derived/actor-derived.js prepareBreakingPointHit.
  let breakingPointHit = false;

  if (hasNumericSanity(actor)) {
    const hidden = shouldHideSanity();
    san = hidden
      ? { value: null, max: null, percentage: 0, available: true, private: true }
      : { ...readResource(sys.sanity), private: false };
    breakingPoint = hidden ? null : Number(sys.sanity.currentBreakingPoint);
    breakingPointHit = hidden ? false : Boolean(sys.sanity.breakingPointHit);
  }

  return {
    hp,
    wp,
    san,
    breakingPoint,
    breakingPointHit,
    armor,
    name: actor.name ?? '',
    img: actor.img ?? 'icons/svg/mystery-man.svg',
    type: actor.type ?? null
  };
}

/**
 * The statistics every actor type carries, in the order character sheets print
 * them. Not an invented category table — base-actor.js declares exactly these
 * six under `system.statistics`, and no more.
 */
const STATISTIC_KEYS = ['str', 'con', 'dex', 'int', 'pow', 'cha'];

/**
 * Extract the actor's statistics.
 *
 * `value` is the system's `effectiveValue` where it has one — that is the
 * statistic after its modifier and any Active Effect, and what the sheet shows.
 * `x5` is the roll target the system derives from it, read rather than
 * recomputed (SYS-4). See module/data/derived/actor-derived.js
 * prepareStatisticsX5 and module/data/actor/base/general.js statisticsField.
 *
 * A statistic with no readable value is left out rather than defaulted (SYS-5).
 *
 * @param {object|null} actor
 * @returns {Array<{key: string, labelKey: string, value: number, x5: number}>}
 */
export function extractStatistics(actor) {
  const statistics = actor?.system?.statistics;
  if (!statistics) return [];

  return STATISTIC_KEYS.flatMap((key) => {
    const statistic = statistics[key];
    if (!statistic) return [];

    // Number(null) is 0, so an unreadable statistic has to be rejected before
    // the cast rather than after it — 0 is a legitimate score.
    const raw = statistic.effectiveValue ?? statistic.value;
    if (raw === null || raw === undefined || raw === '') return [];

    const value = Number(raw);
    if (!Number.isFinite(value)) return [];

    const x5 = Number(statistic.x5 ?? value * 5);

    return [{ key, labelKey: `DG_HUD.Stats.${key}`, value, x5 }];
  });
}

/**
 * Is a Sanity test worth offering?
 *
 * False where the actor has no Sanity score — an Unnatural or a Vehicle — and
 * false at zero, where the Agent is permanently insane and the roll has nothing
 * left to test.
 *
 * A withheld score counts as rollable: `keepSanityPrivate` blanks the value
 * (UX-5), and an unreadable score is unknown, not zero (SYS-5). The system's own
 * roll remains reachable from the sheet in every case — this decides what the
 * HUD offers, never what may be rolled (PAR-4).
 *
 * @param {{san?: {value: number|null, available: boolean}}|null} vitals From extractVitals.
 * @returns {boolean}
 */
export function canRollSanity(vitals) {
  const san = vitals?.san;
  if (!san?.available) return false;

  return san.value !== 0;
}

/**
 * Extract the actor's skills.
 *
 * Keys, labels and values all come from `actor.system.skills`, so the module
 * carries no skill list of its own and picks up every skill the system defines,
 * including the unnatural skill set (SYS-2).
 * See systems/deltagreen/module/data/actor/base/{human,unnatural}-skills.js
 *
 * @param {object|null} actor
 * @returns {Array<{key: string, label: string, value: number, failed: boolean, typed: boolean}>}
 */
export function extractSkills(actor) {
  const sys = actor?.system;
  if (!sys?.skills) return [];

  const skills = Object.entries(sys.skills).map(([key, entry]) => ({
    key,
    label: entry?.label ?? key,
    value: Number(entry?.proficiency ?? 0),
    failed: Boolean(entry?.failure),
    typed: false
  }));

  // typedSkills is an ObjectField of user-defined skills, e.g. Art (Painting).
  // human-skills.js
  for (const [key, entry] of Object.entries(sys.typedSkills ?? {})) {
    skills.push({
      key,
      label: entry?.group ? `${entry.label} (${entry.group})` : (entry?.label ?? key),
      value: Number(entry?.proficiency ?? 0),
      failed: Boolean(entry?.failure),
      typed: true
    });
  }

  return skills;
}

/**
 * Extract Special Training entries, each of which rolls against a statistic or skill.
 * See human-skills.js — `specialTraining: ArrayField({attribute, id, name})`
 * @param {object|null} actor
 * @returns {Array<{id: string, name: string, attribute: string}>}
 */
export function extractSpecialTraining(actor) {
  const entries = actor?.system?.specialTraining;
  if (!Array.isArray(entries)) return [];

  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    attribute: entry.attribute
  }));
}

/**
 * Extract weapons. Reports the loadout as it is — presenting an empty loadout is
 * the HUD's decision, not the adapter's (UX-1).
 *
 * Item type is `weapon`; there is no `equipment` type (gear and armor are their
 * own types). See system.json documentTypes and module/data/item/weapon.js
 *
 * @param {object|null} actor
 * @returns {Array<object>} Formatted weapon descriptors.
 */
export function extractWeapons(actor) {
  return getActorItems(actor)
    .filter((item) => item.type === 'weapon')
    .map((item) => {
      const sys = item.system ?? {};
      const skillKey = String(sys.skill ?? '').toLowerCase();

      return {
        id: item.id ?? item._id,
        uuid: item.uuid ?? null,
        name: item.name ?? '',
        img: item.img ?? 'icons/svg/sword.svg',
        skillKey,
        // Resolved against the actor so the label matches the character sheet.
        skill: actor?.system?.skills?.[skillKey]?.label ?? skillKey,
        skillModifier: Number(sys.skillModifier ?? 0),
        damage: sys.damage ?? '',
        lethality: Number(sys.lethality ?? 0),
        isLethal: Boolean(sys.isLethal),
        armorPiercing: Number(sys.armorPiercing ?? 0),
        // `ammo` is a StringField in the schema, not a {value,max} object.
        ammo: sys.ammo ?? '',
        range: sys.range ?? '',
        killRadius: sys.killRadius ?? '',
        equipped: Boolean(sys.equipped)
      };
    });
}

/**
 * Which follow-up rolls a weapon actually offers.
 *
 * Mirrors the system's own `hasWeaponDamage` and `hasWeaponLethality` helpers
 * (`utils/register-helpers.js`) exactly — including their treatment of `"0"` and
 * a blank formula as *no damage*. That precision is the point: the sheet's
 * weapon row renders one of three controls off these same predicates
 * (`templates/actor/partials/weapons-section-partial.html`), so anything that
 * offers a roll they would have withheld is a dead control (UX-1) and a parity
 * break (PAR-1).
 *
 * Lives here because it reads item data, and nothing outside this file does
 * (SYS-1). Read by `roll-service.mjs`, to decide whether there is a choice to
 * put to the player, and by `damage-prompt.mjs`, to decide what to offer.
 *
 * @param {object|null} item - A weapon item.
 * @returns {{damage: boolean, lethality: boolean}}
 */
export function weaponDamageOptions(item) {
  const damage = String(item?.system?.damage ?? '').trim();
  const lethality = Number(item?.system?.lethality);

  return {
    damage: damage !== '' && damage !== '0',
    lethality: Number.isFinite(lethality) && lethality > 0
  };
}

/**
 * Is this actor eligible for the HUD?
 * @param {object|null} actor
 * @returns {boolean}
 */
export function isSupportedActor(actor) {
  return SUPPORTED_ACTOR_TYPES.includes(actor?.type);
}
