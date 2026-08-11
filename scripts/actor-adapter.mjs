/**
 * Safely convert actor.items (whether a Foundry Collection, Map, Set, or Array) to a plain Array.
 * @param {object} actor
 * @returns {Array<object>}
 */
export function getActorItems(actor) {
  if (!actor) return [];
  if (Array.isArray(actor.items)) return actor.items;
  if (actor.items?.contents && Array.isArray(actor.items.contents)) return actor.items.contents;
  if (actor.items?.values && typeof actor.items.values === 'function') return Array.from(actor.items.values());
  if (actor.items && typeof actor.items[Symbol.iterator] === 'function') {
    const items = Array.from(actor.items);
    return items.map((entry) => (Array.isArray(entry) && entry.length === 2 ? entry[1] : entry));
  }
  if (Array.isArray(actor.weapons)) return actor.weapons;
  return [];
}

/**
 * Get vital statistics for the HUD from actor data.
 * @param {object} actor - The Foundry actor instance or mock object.
 * @returns {object} Standardized vitals object.
 */
export function extractVitals(actor) {
  if (!actor) {
    return {
      hp: { value: 0, max: 0, percentage: 0 },
      wp: { value: 0, max: 0, percentage: 0 },
      san: { value: 0, max: 0, percentage: 0 },
      breakingPoint: 0,
      armor: 0,
      name: 'No Agent Selected',
      img: 'icons/svg/mystery-man.svg'
    };
  }

  const sys = actor.system || actor.data?.data || {};

  // Resolve HP
  const hpRaw = sys.hp || sys.attributes?.hp || sys.health || {};
  const hpVal = Number(hpRaw.value ?? hpRaw.current ?? 10);
  const hpMax = Number(hpRaw.max ?? 10);
  const hpPct = hpMax > 0 ? Math.clamped(Math.round((hpVal / hpMax) * 100), 0, 100) : 0;

  // Resolve WP (Willpower)
  const wpRaw = sys.wp || sys.attributes?.wp || {};
  const wpVal = Number(wpRaw.value ?? wpRaw.current ?? 10);
  const wpMax = Number(wpRaw.max ?? 10);
  const wpPct = wpMax > 0 ? Math.clamped(Math.round((wpVal / wpMax) * 100), 0, 100) : 0;

  // Resolve SAN (Sanity)
  const sanRaw = sys.san || sys.attributes?.san || {};
  const sanVal = Number(sanRaw.value ?? sanRaw.current ?? 50);
  const sanMax = Number(sanRaw.max ?? 99);
  const sanPct = sanMax > 0 ? Math.clamped(Math.round((sanVal / sanMax) * 100), 0, 100) : 0;

  // Resolve Breaking Point & Armor
  const bpVal = Number(sys.breakingPoint?.value ?? sys.attributes?.breakingPoint?.value ?? sys.breakingPoint ?? 40);
  const armorVal = Number(sys.armor?.value ?? sys.attributes?.armor?.value ?? sys.armor ?? 0);

  return {
    hp: { value: hpVal, max: hpMax, percentage: hpPct },
    wp: { value: wpVal, max: wpMax, percentage: wpPct },
    san: { value: sanVal, max: sanMax, percentage: sanPct },
    breakingPoint: bpVal,
    armor: armorVal,
    name: actor.name || 'Agent',
    img: actor.img || 'icons/svg/mystery-man.svg'
  };
}

/**
 * Standard list of core Delta Green combat and operational skills.
 */
export const CORE_SKILLS = [
  { key: 'alertness', label: 'Alertness', defaultVal: 20, category: 'Perception' },
  { key: 'athletics', label: 'Athletics', defaultVal: 30, category: 'Physical' },
  { key: 'criminology', label: 'Criminology', defaultVal: 10, category: 'Investigation' },
  { key: 'dodge', label: 'Dodge', defaultVal: 30, category: 'Combat' },
  { key: 'drive', label: 'Drive', defaultVal: 20, category: 'Physical' },
  { key: 'firearms', label: 'Firearms', defaultVal: 20, category: 'Combat' },
  { key: 'first_aid', label: 'First Aid', defaultVal: 10, category: 'Medical' },
  { key: 'heavy_weapons', label: 'Heavy Weapons', defaultVal: 10, category: 'Combat' },
  { key: 'humint', label: 'HUMINT', defaultVal: 10, category: 'Investigation' },
  { key: 'melee_weapons', label: 'Melee Weapons', defaultVal: 30, category: 'Combat' },
  { key: 'military_science', label: 'Military Science', defaultVal: 0, category: 'Knowledge' },
  { key: 'navigate', label: 'Navigate', defaultVal: 10, category: 'Physical' },
  { key: 'occult', label: 'Occult', defaultVal: 10, category: 'Knowledge' },
  { key: 'pharmacy', label: 'Pharmacy', defaultVal: 0, category: 'Medical' },
  { key: 'psychotherapy', label: 'Psychotherapy', defaultVal: 10, category: 'Medical' },
  { key: 'search', label: 'Search', defaultVal: 20, category: 'Investigation' },
  { key: 'stealth', label: 'Stealth', defaultVal: 20, category: 'Physical' },
  { key: 'swim', label: 'Swim', defaultVal: 20, category: 'Physical' },
  { key: 'unarmed_combat', label: 'Unarmed Combat', defaultVal: 40, category: 'Combat' }
];

/**
 * Extract formatted list of skills for the Agent.
 * @param {object} actor - The Foundry actor document.
 * @returns {Array<object>} Processed skill objects with value, label, category, and id.
 */
export function extractSkills(actor) {
  if (!actor) return [];

  const sys = actor.system || actor.data?.data || {};
  const sysSkills = sys.skills || {};
  const items = getActorItems(actor);
  const itemSkills = items.filter((i) => i.type === 'skill');

  const result = CORE_SKILLS.map((skillDef) => {
    let value = skillDef.defaultVal;

    // Check system.skills object
    if (sysSkills[skillDef.key] !== undefined) {
      const entry = sysSkills[skillDef.key];
      value = typeof entry === 'number' ? entry : Number(entry.value ?? entry.proficiency ?? skillDef.defaultVal);
    } else {
      // Check item skills by matching name or key
      const match = itemSkills.find(
        (i) => i.name?.toLowerCase().replace(/\s+/g, '_') === skillDef.key || i.name?.toLowerCase() === skillDef.label.toLowerCase()
      );
      if (match) {
        value = Number(match.system?.value ?? match.data?.data?.value ?? skillDef.defaultVal);
      }
    }

    return {
      id: skillDef.key,
      key: skillDef.key,
      label: skillDef.label,
      value: Math.clamped(value, 0, 99),
      category: skillDef.category
    };
  });

  // Include any extra custom skills from items
  for (const item of itemSkills) {
    const normName = item.name?.toLowerCase().replace(/\s+/g, '_');
    if (!result.some((s) => s.key === normName)) {
      result.push({
        id: item.id || normName,
        key: normName,
        label: item.name,
        value: Math.clamped(Number(item.system?.value ?? item.data?.data?.value ?? 20), 0, 99),
        category: 'Custom'
      });
    }
  }

  return result;
}

/**
 * Extract weapons and combat equipment from actor.
 * @param {object} actor - The actor document.
 * @returns {Array<object>} Formatted weapon objects for HUD slots.
 */
export function extractWeapons(actor) {
  if (!actor) {
    return [
      {
        id: 'unarmed-strike',
        name: 'Unarmed Strike',
        img: 'icons/skills/melee/unarmed-punch-fist.webp',
        skill: 'Unarmed Combat',
        skillKey: 'unarmed_combat',
        damage: '1d4 - 1',
        lethality: 0,
        equipped: true,
        ammo: null
      }
    ];
  }

  const items = getActorItems(actor);
  let weaponItems = items.filter((i) => i.type === 'weapon' || i.type === 'equipment');

  // Fallback to actor.weapons getter if present on Delta Green actor
  if (weaponItems.length === 0 && Array.isArray(actor.weapons) && actor.weapons.length > 0) {
    weaponItems = actor.weapons;
  }

  if (weaponItems.length === 0) {
    return [
      {
        id: 'unarmed-strike',
        name: 'Unarmed Strike',
        img: 'icons/skills/melee/unarmed-punch-fist.webp',
        skill: 'Unarmed Combat',
        skillKey: 'unarmed_combat',
        damage: '1d4 - 1',
        lethality: 0,
        equipped: true,
        ammo: null
      }
    ];
  }

  return weaponItems.map((item) => {
    const sys = item.system || item.data?.data || {};
    const rawSkill = sys.skill || sys.associatedSkill || 'Firearms';

    const skillLabels = {
      firearms: 'Firearms',
      heavy_weapons: 'Heavy Weapons',
      melee_weapons: 'Melee Weapons',
      unarmed_combat: 'Unarmed Combat',
      demolitions: 'Demolitions'
    };

    const skillKey = String(rawSkill).toLowerCase().replace(/\s+/g, '_');
    const skillName = skillLabels[skillKey] || rawSkill;

    const lethalityVal = Number(sys.lethality?.value ?? sys.lethality ?? 0);

    return {
      id: item.id || item._id,
      name: item.name || 'Weapon',
      img: item.img || 'icons/weapons/guns/pistol-metal.webp',
      skill: skillName,
      skillKey,
      damage: sys.damage || '1d10',
      lethality: lethalityVal,
      equipped: Boolean(sys.equipped ?? true),
      ammo: sys.ammo !== undefined ? { value: Number(sys.ammo.value ?? 0), max: Number(sys.ammo.max ?? 0) } : null
    };
  });
}

/**
 * Extract tactical actions available to Delta Green Agents.
 * @returns {Array<object>} List of tactical actions.
 */
export function extractTacticalActions() {
  return [
    { id: 'dodge', name: 'Dodge', type: 'reaction', icon: 'fas fa-shield-alt', description: 'Roll Dodge against attack.' },
    { id: 'aim', name: 'Aim / Called Shot', type: 'action', icon: 'fas fa-crosshair', description: '+20% bonus on next attack roll.' },
    { id: 'suppress', name: 'Suppressive Fire', type: 'action', icon: 'fas fa-bullseye', description: 'Force targets in cone to duck or take damage.' },
    { id: 'cover', name: 'Take Cover', type: 'move', icon: 'fas fa-person-shelter', description: 'Gain cover armor rating against ranged attacks.' },
    { id: 'fight_back', name: 'Fight Back', type: 'reaction', icon: 'fas fa-hand-fist', description: 'Opposed roll against melee attack.' },
    { id: 'first_aid', name: 'First Aid', type: 'action', icon: 'fas fa-kit-medical', description: 'Treat wounds to heal 1d4 HP.' }
  ];
}

// Math.clamped polyfill fallback for non-Foundry Node unit test environment
if (typeof Math.clamped !== 'function') {
  Math.clamped = (val, min, max) => Math.min(Math.max(val, min), max);
}
