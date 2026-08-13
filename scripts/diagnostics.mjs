/**
 * Live-world self-diagnostic.
 *
 * Argon's component contracts fail at render time, not at author or test time, so
 * reproducing a problem otherwise costs a reload cycle per question. This gathers
 * everything worth knowing in one pass: what the adapter sees, what Argon built
 * from it, and which layout settings are in play.
 *
 * Run `ui.deltaGreenCombatHud.diagnose()` in the console and share the output.
 */

import { extractVitals, extractSkills, extractWeapons, extractSpecialTraining, isSupportedActor } from './actor-adapter.mjs';
import { rollService, SYSTEM_ROLL_API_PATH } from './roll-service.mjs';
import { getWpBoostSettings, MODULE_ID } from './settings.mjs';

/** Argon settings that change how the HUD lays out or when it appears. */
const ARGON_LAYOUT_SETTINGS = ['scale', 'autoScale', 'alwaysOn', 'openCombatStart', 'botPos', 'leftPos', 'showTooltips', 'suppressWarnings', 'rangepicker', 'rangepickerclear'];

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch (error) {
    return `<error: ${error.message}>`;
  }
}

function versions() {
  const argon = game.modules.get('enhancedcombathud');
  return {
    module: game.modules.get(MODULE_ID)?.version ?? '<not found>',
    moduleActive: Boolean(game.modules.get(MODULE_ID)?.active),
    argon: argon?.version ?? '<not installed>',
    argonActive: Boolean(argon?.active),
    system: `${game.system.id} ${game.system.version}`,
    foundry: game.version
  };
}

function argonSettings() {
  const out = {};
  for (const key of ARGON_LAYOUT_SETTINGS) {
    out[key] = safe(() => game.settings.get('enhancedcombathud', key), '<unset>');
  }
  // The effective scale Argon actually applies, including its clamp.
  const auto = out.autoScale;
  const raw = auto ? window.innerHeight / 2000 : out.scale;
  out.effectiveScale = Math.min(raw, 1);
  out.innerHeight = window.innerHeight;
  return out;
}

/** What Argon built, and whether it occupies space. */
function components() {
  const hud = ui.ARGON;
  if (!hud) return '<ui.ARGON missing>';

  const describe = (component, name) => {
    if (!component) return { component: name, present: false };
    const rect = component.element?.getBoundingClientRect();
    return {
      component: name ?? component.constructor.name,
      buttons: component._buttons?.length ?? null,
      hidden: Boolean(component.element?.classList.contains('hidden')),
      width: Math.round(rect?.width ?? 0),
      height: Math.round(rect?.height ?? 0),
      template: safe(() => component.template)
    };
  };

  return {
    enabled: Boolean(hud.enabled),
    main: (hud.components?.main ?? []).map((panel) => describe(panel)),
    portrait: describe(hud.components?.portrait, 'portrait'),
    drawer: describe(hud.components?.drawer, 'drawer'),
    weaponSets: describe(hud.components?.weaponSets, 'weaponSets'),
    movement: describe(hud.components?.movement, 'movement'),
    buttonHud: describe(hud.components?.buttonHud, 'buttonHud')
  };
}

/** What the adapter reads off the bound actor. */
function actorView(actor) {
  if (!actor) return '<no actor bound>';

  const vitals = extractVitals(actor);
  const weapons = extractWeapons(actor);

  return {
    name: actor.name,
    type: actor.type,
    supported: isSupportedActor(actor),
    isOwner: actor.isOwner,
    vitals: {
      hp: `${vitals.hp.value}/${vitals.hp.max}`,
      wp: vitals.wp.available ? `${vitals.wp.value}/${vitals.wp.max}` : 'n/a',
      san: vitals.san.available ? `${vitals.san.value}/${vitals.san.max}${vitals.san.private ? ' (private)' : ''}` : 'n/a',
      breakingPoint: vitals.breakingPoint,
      breakingPointHit: vitals.breakingPointHit,
      armor: vitals.armor
    },
    skills: extractSkills(actor).length,
    specialTraining: extractSpecialTraining(actor).length,
    weapons: weapons.map((w) => ({ name: w.name, equipped: w.equipped, skill: w.skillKey, lethality: w.lethality })),
    equippedCount: weapons.filter((w) => w.equipped).length
  };
}

/** Can we actually reach the system's roll pipeline? */
async function rollPipeline() {
  try {
    const api = await rollService.api();
    return {
      path: SYSTEM_ROLL_API_PATH,
      loaded: true,
      exports: ['processDGRoll', 'DGPercentileRoll', 'DGLethalityRoll', 'DGDamageRoll'].filter((name) => name in api)
    };
  } catch (error) {
    return { path: SYSTEM_ROLL_API_PATH, loaded: false, error: error.message };
  }
}

function combatState() {
  const combat = game.combat;
  if (!combat) return { active: false };
  return {
    active: true,
    started: combat.started,
    round: combat.round,
    turn: combat.turn,
    currentCombatant: combat.combatant?.name ?? null,
    currentIsBound: combat.combatant?.actor?.id === ui.ARGON?._actor?.id
  };
}

/** Localisation keys that would render as raw identifiers. */
function missingTranslations() {
  const missing = [];
  const walk = (obj, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object') walk(value, full);
    }
  };
  walk(game.i18n.translations.DG_HUD ?? {}, 'DG_HUD');

  for (const key of ['DG_HUD.Panels.Attacks', 'DG_HUD.Vitals.HP', 'DG_HUD.Actions.RollSanity']) {
    if (game.i18n.localize(key) === key) missing.push(key);
  }
  return missing;
}

/**
 * Collect a full diagnostic report.
 * @returns {Promise<object>}
 */
export async function diagnose() {
  const actor = ui.ARGON?._actor ?? null;

  const report = {
    generatedAt: new Date().toISOString(),
    versions: versions(),
    argonSettings: argonSettings(),
    wpBoost: safe(getWpBoostSettings),
    combat: combatState(),
    actor: actorView(actor),
    components: components(),
    rollPipeline: await rollPipeline(),
    missingTranslations: missingTranslations()
  };

  console.log('%c[Delta Green Combat HUD] Diagnostic report', 'color:#00ff66;font-weight:bold');
  console.log(report);
  console.log('Copy the block below:\n', JSON.stringify(report, null, 2));

  return report;
}
