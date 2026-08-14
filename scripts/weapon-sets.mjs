/**
 * Weapon set arithmetic: what a set names, and what switching to it changes.
 *
 * A "set" is Argon's shape — `{primary, secondary}` — but nothing here knows
 * that, or knows Argon at all (ARCH-6). Slots arrive either as the uuid strings
 * a set is stored as, or as the documents Argon has already resolved them into,
 * because the two callers legitimately hold different things.
 *
 * All of it is pure, and all of it exists because the equivalent logic lived
 * inline in the presentation layer where no test could reach it (TEST-6).
 */

/** The slots every set has. Argon's template renders exactly these two. */
export const SET_SLOTS = Object.freeze(['primary', 'secondary']);

/** Item type carrying an attack. There is no `equipment` type — see actor-adapter. */
function isWeapon(item) {
  return item?.type === 'weapon';
}

/**
 * A weapon's identity as a set records it.
 *
 * Uuid rather than id, deliberately: a set may hold an item from another actor
 * or a compendium, and two actors built from the same prototype carry items with
 * identical ids. The uuid is the only handle that tells those apart.
 */
function handle(item) {
  if (typeof item === 'string') return item;
  return item?.uuid ?? item?.id ?? item?._id ?? null;
}

function documentId(item) {
  return item?.id ?? item?._id ?? null;
}

/** Every weapon the actor carries, keyed by the handle a set would name it with. */
function carriedWeapons(items) {
  const weapons = (items ?? []).filter(isWeapon);
  return new Map(weapons.map((weapon) => [handle(weapon), weapon]).filter(([key]) => key));
}

/**
 * Fill set 1 from the actor's equipped weapons, so the HUD is useful before
 * anyone configures anything.
 *
 * Returns a copy: the caller's `defaults` object is Argon's, and mutating it
 * would leak into the merge it performs afterwards.
 *
 * @param {object} defaults - Argon's empty set layout, `{1: {...}, 2: {...}}`.
 * @param {Array<object>} items - Everything the actor carries.
 * @returns {object} The same layout with set 1 seeded.
 */
export function seedWeaponSets(defaults, items) {
  const sets = {};
  for (const [key, slots] of Object.entries(defaults ?? {})) sets[key] = { ...slots };

  const first = sets['1'];
  if (!first) return sets;

  const equipped = (items ?? [])
    .filter((item) => isWeapon(item) && Boolean(item.system?.equipped))
    .map(handle)
    .filter(Boolean);

  if (equipped[0]) first.primary = equipped[0];
  if (equipped[1]) first.secondary = equipped[1];

  return sets;
}

/**
 * Should the seed be written to the actor, and as what?
 *
 * The seed is computed from what is equipped — and switching sets is what
 * changes what is equipped. Left as a live default it therefore moves under the
 * player: assign a rifle to set 2, switch to it, and set 1 re-seeds itself from
 * the now-equipped rifle, taking the pistol nobody assigned anywhere with it.
 * That is the "weapons disappear from sets" defect. Persisting the seed once
 * turns it from a default that keeps recomputing into the player's own data.
 *
 * Seeding is skipped once set 1 holds a decision — including the decision to be
 * empty. A slot cleared by the player is stored as an explicit `null`, so the
 * key being *present* is the signal, not its value.
 *
 * @param {object|null|undefined} saved - The actor's stored sets, if any.
 * @param {object} seeded - The layout from `seedWeaponSets`.
 * @returns {object|null} Sets to persist, or null if nothing should be written.
 */
export function planSeedWrite(saved, seeded) {
  const first = seeded?.['1'];
  if (!first?.primary && !first?.secondary) return null;

  const savedFirst = saved?.['1'];
  if (savedFirst && SET_SLOTS.some((slot) => slot in savedFirst)) return null;

  return { ...(saved ?? {}), 1: { ...(savedFirst ?? {}), ...first } };
}

/**
 * Drop set entries that no longer name a weapon this actor carries.
 *
 * Argon accepts any Item into a set and never looks at it again, so a slot
 * outlives the weapon it points at: delete the weapon and the uuid stays,
 * resolving to nothing forever after. The same slot can also hold something that
 * was never equippable here — an item dragged off another Agent's sheet, out of
 * a compendium, or a piece of gear. All of it reads the same way to a player: a
 * set that appears configured and silently does nothing (UX-1).
 *
 * @param {object} sets - The actor's stored sets.
 * @param {Array<object>} items - Everything the actor carries.
 * @returns {{sets: object, removed: Array<{set: string, slot: string, uuid: string}>}}
 */
export function pruneWeaponSets(sets, items) {
  const carried = carriedWeapons(items);
  const pruned = {};
  const removed = [];

  for (const [key, slots] of Object.entries(sets ?? {})) {
    pruned[key] = { ...slots };

    for (const slot of SET_SLOTS) {
      const uuid = slots?.[slot];
      if (!uuid || carried.has(uuid)) continue;

      pruned[key][slot] = null;
      removed.push({ set: key, slot, uuid });
    }
  }

  return { sets: pruned, removed };
}

/**
 * What switching to a set changes: it equips the weapons that set names, and
 * unequips every other weapon. The Attacks panel is built from what is equipped,
 * so this is what makes a set mean anything.
 *
 * A set naming nothing this actor carries — never configured, emptied, or left
 * pointing at a deleted weapon — is reported as unconfigured and changes
 * nothing. Treating it as "equip none of them" would silently strip the Agent's
 * loadout, which reads as the HUD losing their weapons (UX-1).
 *
 * @param {Array<object>} items - Everything the actor carries.
 * @param {Array<object|string|null>} slots - The active set's slots.
 * @returns {{updates: Array<object>, configured: boolean}} `updates` is ready for
 *   `Actor#updateEmbeddedDocuments`, and holds only weapons that actually change.
 */
export function planLoadout(items, slots) {
  const carried = carriedWeapons(items);

  const selected = new Set(
    (slots ?? [])
      .map(handle)
      .filter((key) => key && carried.has(key))
  );

  if (!selected.size) return { updates: [], configured: false };

  const updates = [...carried.entries()]
    .map(([key, weapon]) => ({ weapon, equipped: selected.has(key) }))
    .filter(({ weapon, equipped }) => Boolean(weapon.system?.equipped) !== equipped)
    .map(({ weapon, equipped }) => ({ _id: documentId(weapon), 'system.equipped': equipped }));

  return { updates, configured: true };
}
