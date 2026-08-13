/**
 * Drive a live Foundry world in a real browser.
 *
 * Argon's component contract fails at render time, so some defects are invisible
 * to unit tests and only reproducible in a running world. This logs into Foundry,
 * binds the HUD to a token, and reports what actually rendered — turning a
 * reload-and-screenshot cycle into a single command.
 *
 *   node tools/foundry-driver.mjs probe        # list users in the active world
 *   node tools/foundry-driver.mjs diagnose     # bind the HUD and dump its report
 *   node tools/foundry-driver.mjs smoke        # click through the roll paths
 *   node tools/foundry-driver.mjs verify       # end-to-end check of the new paths
 *
 * Environment:
 *   FOUNDRY_URL       default http://localhost:30000
 *   FOUNDRY_USER      user to join as (default: first gamemaster)
 *   FOUNDRY_PASSWORD  that user's password, if set
 *   HEADED=1          watch it happen
 *
 * This is a development tool. It is not bundled and not shipped.
 */

import { chromium } from 'playwright';

const URL = process.env.FOUNDRY_URL ?? 'http://localhost:30000';
const HEADED = process.env.HEADED === '1';

/** Launch a browser, join the world, and hand back a ready page. */
async function connect({ join = true } = {}) {
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
  const page = await context.newPage();

  const consoleLog = [];
  page.on('console', (message) => {
    consoleLog.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    consoleLog.push({ type: 'pageerror', text: error.message });
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Wait for the form itself, not just the container — the join screen is built
  // client-side and the container appears first.
  // `state: 'attached'` matters — <option> elements never satisfy Playwright's
  // visibility check, so the default would always time out.
  await page.waitForSelector('select[name="userid"] option[value]:not([value=""])', {
    state: 'attached',
    timeout: 30_000
  });

  if (!join) return { browser, page, consoleLog };

  await joinWorld(page);
  return { browser, page, consoleLog };
}

/** Complete the join form and wait for `game.ready`. */
async function joinWorld(page) {
  const select = page.locator('select[name="userid"]');
  await select.waitFor({ timeout: 30_000 });

  const users = await readUsers(page);
  const wanted = process.env.FOUNDRY_USER;
  const target = wanted ? users.find((u) => u.user === wanted) : users.find((u) => u.joinable);

  if (!target) {
    const available = users.map((u) => `${u.user}${u.joinable ? '' : ' (already connected)'}`).join(', ');
    throw new Error(wanted ? `No such user "${wanted}". Available: ${available}` : `No joinable user. Available: ${available}`);
  }
  if (!target.joinable) {
    throw new Error(`"${target.user}" is already connected — Foundry disables that option. Log out of that session, or use another user.`);
  }

  await select.selectOption(target.id);

  const password = process.env.FOUNDRY_PASSWORD;
  if (password) await page.fill('input[name="password"]', password);

  await page.click('button[name="join"], #join-game button[type="submit"]');

  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 60_000 });
}

/**
 * Read the joinable users.
 * Foundry disables a user who is already connected, so a GM logged in elsewhere
 * cannot be driven from here.
 */
async function readUsers(page) {
  return page.locator('select[name="userid"] option').evaluateAll((options) =>
    options
      .filter((o) => o.value)
      .map((o) => ({ user: o.textContent.trim(), joinable: !o.disabled, id: o.value }))
  );
}

async function probe() {
  const { browser, page } = await connect({ join: false });

  console.log('World:', await page.title());
  console.table(await readUsers(page));

  await browser.close();
}

/** Bind the HUD to a controlled token and return its diagnostic report. */
async function bindHud(page) {
  return page.evaluate(async () => {
    const token =
      canvas.tokens.controlled[0] ??
      canvas.tokens.placeables.find((t) => t.actor?.isOwner && ['agent', 'npc', 'unnatural'].includes(t.actor?.type));

    if (!token) return { error: 'No ownable agent/npc/unnatural token on this scene' };

    token.control({ releaseOthers: true });
    await ui.ARGON.bind(token);

    // Wait for the panels to have actually laid out, rather than sleeping a
    // fixed interval and hoping. A flat 750ms occasionally expired mid-render,
    // which reported every panel as having zero buttons and made the next click
    // race the layout — a flaky harness reads as a broken module.
    const laidOut = () =>
      (ui.ARGON.components?.main ?? []).some((panel) => panel.element?.offsetHeight > 0);

    for (let waited = 0; waited < 5000 && !laidOut(); waited += 50) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return ui.deltaGreenCombatHud.diagnose();
  });
}

async function diagnose() {
  const { browser, page, consoleLog } = await connect();

  const report = await bindHud(page);
  console.log(JSON.stringify(report, null, 2));

  await page.screenshot({ path: 'tools/.out/hud.png' });
  console.log('\nScreenshot: tools/.out/hud.png');

  reportConsole(consoleLog);
  await browser.close();
}

/**
 * Exercise the roll paths.
 *
 * Attacks, skills and Sanity produce chat messages in the live world — that is
 * the point, since a roll that never reaches chat is the bug we are hunting.
 * Willpower Boost is skipped: it writes to the actor.
 */
async function smoke() {
  const { browser, page, consoleLog } = await connect();

  const report = await bindHud(page);
  if (report.error) {
    console.error(report.error);
    await browser.close();
    process.exit(1);
  }

  console.log('Bound to:', report.actor.name, `(${report.actor.type})`);
  console.table(report.components.main);

  const actions = [];

  /**
   * Click as a user would, and attribute the result by message id.
   *
   * Playwright's click performs real hit-testing, so an element made inert by
   * `pointer-events` fails here exactly as it does for a player. Dispatching a
   * synthetic MouseEvent instead would bypass that check and report a false pass.
   */
  const click = async (label, selector) => {
    const seen = await page.evaluate(() => game.messages.contents.map((m) => m.id));
    const target = page.locator(selector).first();

    if (!(await target.count())) {
      actions.push({ action: label, result: 'not found' });
      return;
    }

    try {
      await target.click({ timeout: 4000 });
    } catch (error) {
      const inert = /intercepts pointer events|not visible|element is not enabled/i.test(error.message);
      actions.push({ action: label, result: inert ? 'NOT CLICKABLE' : `click failed: ${error.message.split('\n')[0]}` });
      return;
    }

    const message = await page
      .waitForFunction(
        (known) => {
          const fresh = game.messages.contents.filter((m) => !known.includes(m.id));
          return fresh.length ? (fresh.at(-1).flavor || fresh.at(-1).content || '').slice(0, 70) : false;
        },
        seen,
        { timeout: 6000 }
      )
      .then((handle) => handle.jsonValue())
      .catch(() => null);

    actions.push({ action: label, result: message ? 'rolled' : 'NO CHAT MESSAGE', message: message ?? '' });
  };

  // Hold a target first: that is the realistic flow, and what damage automation
  // resolves against.
  await page.evaluate(() => {
    const self = ui.ARGON._token;
    const other = canvas.tokens.placeables.find((t) => t !== self && t.actor?.system?.health);
    other?.setTarget(true, { releaseOthers: true });
  });

  await click('weapon attack', '.dg-weapon-panel .item-button');
  await click('reaction (dodge)', '.dg-reaction-panel .action-element');
  await click('sanity test', '.dg-sanity-panel .action-element');

  // Open the skills accordion, then roll a specific skill from inside it.
  await page.locator('.dg-skill-panel .action-element').first().click();
  await page.waitForSelector('.features-container.show', { timeout: 4000 }).catch(() => {});
  await click('skill (in accordion)', '.features-container.show .action-element');

  console.table(actions);

  await weaponSetSwitch(page);

  await page.screenshot({ path: 'tools/.out/smoke.png' });
  console.log('Screenshot: tools/.out/smoke.png');

  reportConsole(consoleLog);
  await browser.close();
}

/**
 * Switching a weapon set must be reflected in the Attacks panel immediately.
 * Argon's updateItem path does not rebuild a panel's buttons, so this checks the
 * panel actually re-renders rather than waiting for the next rebind.
 */
async function weaponSetSwitch(page) {
  const state = () =>
    page.evaluate(() => ({
      active: ui.ARGON._actor.getFlag('enhancedcombathud', 'activeWeaponSet') ?? '1',
      attacks: (ui.ARGON.components.main.find((p) => p.constructor.name === 'DGWeaponPanel')?._buttons ?? []).map(
        (b) => b.item?.name
      ),
      equipped: ui.ARGON._actor.items
        .filter((i) => i.type === 'weapon' && i.system.equipped)
        .map((i) => i.name)
    }));

  const before = await state();

  const sets = page.locator('.weapon-sets .set, .weapon-sets [data-set]');
  const count = await sets.count();
  if (count < 2) {
    console.log('\nWeapon set switch: skipped (fewer than two sets rendered)');
    return;
  }

  // Click a set other than the active one.
  const targetIndex = before.active === '1' ? 1 : 0;
  await sets.nth(targetIndex).click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const after = await state();

  console.log('\nWeapon set switch');
  console.table([
    { when: 'before', set: before.active, attacks: before.attacks.join(', ') || '—', equipped: before.equipped.join(', ') || '—' },
    { when: 'after', set: after.active, attacks: after.attacks.join(', ') || '—', equipped: after.equipped.join(', ') || '—' }
  ]);

  const setChanged = before.active !== after.active;
  const panelFollowed = JSON.stringify(before.attacks) !== JSON.stringify(after.attacks);

  if (setChanged && !panelFollowed) {
    console.log('  FAIL: set changed but the Attacks panel did not re-render');
  } else if (setChanged) {
    console.log('  OK: Attacks panel followed the set change');
  } else {
    console.log('  set did not change — check the weapon-set selector');
  }
}

/**
 * Verify the behaviours unit tests cannot reach.
 *
 * Three things were written against assumptions about Foundry that only a real
 * world can settle: that `Roll#_evaluated` is the witness for "the dice were
 * actually rolled", that `renderChatMessageHTML` hands over `(message, element)`,
 * and that a chat-card button can carry a cross-user write.
 *
 * Everything it changes, it puts back — Willpower, target hit points, and the
 * damage-automation setting. It does leave chat messages, as smoke does.
 */
async function verify() {
  const { browser, page, consoleLog } = await connect();

  const bound = await bindHud(page);
  if (bound.error) {
    console.error(bound.error);
    await browser.close();
    process.exit(1);
  }
  console.log('Bound to:', bound.actor.name, `(${bound.actor.type})\n`);

  const checks = [];
  const record = (name, pass, detail = '') => checks.push({ check: name, result: pass ? 'PASS' : 'FAIL', detail });

  // 1 — the roll is observable, and only once it has actually been evaluated.
  const outcome = await page.evaluate(async () => {
    const seen = [];
    const hookId = Hooks.on('enhancedcombathud-deltagreen.rollOutcome', (o) => seen.push(o));
    const roll = await ui.deltaGreenCombatHud.rollSkill('firearms');
    Hooks.off('enhancedcombathud-deltagreen.rollOutcome', hookId);

    return {
      evaluatedFlag: roll?._evaluated ?? null,
      total: roll?.total ?? null,
      published: seen.length,
      payload: seen[0] ? { type: seen[0].type, total: seen[0].total, success: seen[0].success } : null
    };
  });

  record('Roll#_evaluated is the witness', outcome.evaluatedFlag === true, `_evaluated=${outcome.evaluatedFlag}`);
  record('rollOutcome hook fires once', outcome.published === 1, `published=${outcome.published}`);
  record(
    'outcome carries the system\'s own result',
    outcome.payload?.total === outcome.total && typeof outcome.payload?.success === 'boolean',
    JSON.stringify(outcome.payload)
  );

  // 2 — Willpower is charged after the roll, never before.
  const wp = await page.evaluate(async () => {
    const actor = ui.deltaGreenCombatHud.actor;
    const before = actor.system.wp.value;
    const wasEnabled = game.settings.get('enhancedcombathud-deltagreen', 'enableWpBoost');
    await game.settings.set('enhancedcombathud-deltagreen', 'enableWpBoost', true);

    ui.deltaGreenCombatHud.toggleWillpowerBoost();
    const afterArming = actor.system.wp.value;
    const armed = ui.deltaGreenCombatHud.isWillpowerBoostArmed();

    const roll = await ui.deltaGreenCombatHud.rollSkill('firearms');
    const afterRoll = actor.system.wp.value;

    await actor.update({ 'system.wp.value': before });
    await game.settings.set('enhancedcombathud-deltagreen', 'enableWpBoost', wasEnabled);

    return { before, afterArming, afterRoll, armed, modifier: roll?.modifier ?? null };
  });

  record('arming costs nothing', wp.armed === true && wp.afterArming === wp.before, `${wp.before} → ${wp.afterArming}`);
  record('the roll is boosted', wp.modifier === 20, `modifier=${wp.modifier}`);
  record('Willpower is charged after the roll', wp.afterRoll === wp.before - 1, `${wp.afterArming} → ${wp.afterRoll}`);

  // 3 — the target readout reports each state, and never leaks a hidden name.
  const readout = () => page.locator('.dg-target-hud .dg-target-name').first().innerText();

  /** What the reticle is actually showing right now. */
  const reticle = () =>
    page.evaluate(() => {
      const el = document.querySelector('.dg-target-hud .dg-target-reticle');
      const img = el?.querySelector('img.dg-target-portrait');
      const button = document.querySelector('.dg-target-hud .button-hud-button span');
      return {
        state: el?.dataset.state ?? null,
        portrait: img?.getAttribute('src') ?? null,
        rendered: (el?.offsetHeight ?? 0) > 0,
        button: button?.innerText ?? null
      };
    });

  await page.evaluate(() => [...game.user.targets].forEach((t) => t.setTarget(false, { releaseOthers: false })));
  await page.waitForTimeout(500);
  const empty = await reticle();
  record(
    'nothing targeted is stated, not left blank',
    empty.state === 'none' && empty.rendered && empty.portrait === null && Boolean(empty.button),
    `${(await readout()).trim()} / ${empty.button}`
  );

  const victim = await page.evaluate(() => {
    const self = ui.ARGON._token;
    const other = canvas.tokens.placeables.find((t) => t !== self && t.actor?.system?.health);
    if (!other) return null;
    other.setTarget(true, { releaseOthers: true });
    return { name: other.name, id: other.id, art: other.document.texture.src, portrait: other.actor.img };
  });

  if (victim) {
    await page.waitForTimeout(500);
    const shown = (await readout()).trim();
    const framed = await reticle();

    record('target readout follows targeting without a rebind', shown.includes(victim.name), shown);
    record(
      'the target is shown as its token art, in a reticle',
      framed.state === 'one' && framed.portrait === victim.art && framed.rendered,
      framed.portrait ?? 'no portrait'
    );
    record(
      'the re-target control is offered',
      Boolean(framed.button),
      framed.button ?? 'missing'
    );

    // Several targets is its own state: this is exactly when automation stands
    // down, and the player is owed the reason.
    const many = await page.evaluate(() => {
      const self = ui.ARGON._token;
      const others = canvas.tokens.placeables.filter((t) => t !== self && t.actor?.system?.health).slice(0, 2);
      if (others.length < 2) return false;
      others.forEach((t, i) => t.setTarget(true, { releaseOthers: i === 0 }));
      return true;
    });

    if (many) {
      await page.waitForTimeout(500);
      const shown2 = (await readout()).trim();
      record('several targets is reported as its own state', /2/.test(shown2), shown2);
      await page.evaluate(() => [...game.user.targets].forEach((t) => t.setTarget(false, { releaseOthers: false })));
      await page.waitForTimeout(300);
    }
  }

  // 4 — attacking rolls directly. Argon's TargetPicker must not engage: its
  // "right click to cancel" is a document listener, so Foundry opens the Token
  // HUD on the same click, and its teardown scrambles the active tool.
  if (victim) {
    await page.evaluate((id) => canvas.tokens.get(id)?.setTarget(true, { releaseOthers: true }), victim.id);
    const before = await page.evaluate(() => game.messages.contents.length);
    await page.locator('.dg-weapon-panel .item-button').first().click();

    const rolled = await page
      .waitForFunction((n) => game.messages.contents.length > n, before, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    const picker = await page.evaluate(() => !!document.querySelector('.ech-target-picker'));

    record('attacking rolls without engaging the target picker', rolled && !picker, picker ? 'picker engaged' : '');
  }

  // 5 — right-click surfaces the system's own damage-or-lethality dialog.
  await page.locator('.dg-weapon-panel .item-button').first().click({ button: 'right' });
  const dialog = page.locator('.dg-dialog--damage-or-lethality');
  const dialogShown = await dialog.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
  record('right-click opens the system\'s choice dialog', dialogShown);

  // 4 — the full damage → propose → apply path, against a real target.
  let applied = null;
  if (dialogShown) {
    const targeted = await page.evaluate(() => {
      const self = ui.ARGON._token;
      const victim = canvas.tokens.placeables.find((t) => t !== self && t.actor?.system?.health);
      if (!victim) return null;
      victim.setTarget(true, { releaseOthers: true });
      return { name: victim.name, hp: victim.actor.system.health.value, uuid: victim.actor.uuid };
    });

    if (!targeted) {
      record('a second token exists to target', false, 'no other token with hit points on this scene');
      await page.keyboard.press('Escape');
    } else {
      // showDgDialog renders a DialogV2 whose footer buttons sit on the <dialog>
      // itself, outside the content partial.
      await page
        .locator('dialog.dg-dialog-app--damage-or-lethality button[data-action="damage"]')
        .first()
        .click();

      // Assert against the document, not the DOM: a chat message can be
      // scrolled out of view, and `waitForSelector` defaults to *visible*.
      const card = await page
        .waitForFunction(
          () => {
            const message = game.messages.contents.at(-1);
            const pending = message?.flags?.['enhancedcombathud-deltagreen']?.pendingDamage;
            return pending
              ? { id: message.id, applied: pending.resolution.applied, hpAfter: pending.resolution.hpAfter }
              : false;
          },
          null,
          { timeout: 8000 }
        )
        .then((handle) => handle.jsonValue())
        .catch(() => null);

      record(
        'a damage proposal is posted with an Apply button',
        Boolean(card),
        card ? `target=${targeted.name}, proposes −${card.applied} HP` : `target=${targeted.name}, no card`
      );

      if (card) {
        // `attached`, not `visible` — same reason.
        await page.waitForSelector('[data-action="dg-hud-apply-damage"]', { state: 'attached', timeout: 5000 });

        // Dispatched rather than driven by Playwright: the button lives in the
        // scrolling chat log and is reliably outside the viewport. Unlike the
        // HUD buttons in `smoke`, inertness via `pointer-events` is not the risk
        // here — what is under test is that the listener was bound at all and
        // that the write it performs succeeds.
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('[data-action="dg-hud-apply-damage"]');
          buttons[buttons.length - 1].click();
        });
        await page.waitForTimeout(1500);

        applied = await page.evaluate(async ({ uuid, hp }) => {
          const actor = await foundry.utils.fromUuid(uuid);
          const after = actor.system.health.value;
          await actor.update({ 'system.health.value': hp }); // put it back
          return { before: hp, after };
        }, targeted);

        // Assert the write matched the proposal, not that hit points fell — a
        // roll fully absorbed by armour proposes zero, and applying zero is the
        // correct outcome, not a failure.
        record(
          'clicking Apply writes exactly what was proposed',
          applied.after === card.hpAfter,
          `${applied.before} → ${applied.after}, proposed ${card.hpAfter}`
        );
      }

    }
  }

  // 6 — the modifier ladder. PAR-1's most visible promise: shift reaches the
  // system's own dialog from the HUD exactly as it does from the sheet. A plain
  // right-click must NOT, since in the HUD that gesture means "roll damage".
  const dismiss = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  };
  const PERCENTILE_DIALOG = 'dialog:has([name="targetModifier"])';
  const DAMAGE_DIALOG = 'dialog.dg-dialog-app--modify-damage-roll';

  await page.locator('.dg-weapon-panel .item-button').first().click({ modifiers: ['Shift'] });
  const attackDialog = await page
    .waitForSelector(PERCENTILE_DIALOG, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  const presets = attackDialog
    ? (await page.locator(`${PERCENTILE_DIALOG} button[data-action^="mod"]`).allInnerTexts()).filter(Boolean)
    : [];
  record('shift-click an attack reaches the modifier dialog', attackDialog, presets.join(' '));
  await dismiss();

  await page.locator('.dg-weapon-panel .item-button').first().click({ button: 'right', modifiers: ['Shift'] });
  const choice = await page
    .waitForSelector('dialog.dg-dialog-app--damage-or-lethality', { timeout: 6000 })
    .then(() => true)
    .catch(() => false);

  if (choice) {
    await page.locator('dialog.dg-dialog-app--damage-or-lethality button[data-action="damage"]').first().click();
    const damageDialog = await page
      .waitForSelector(DAMAGE_DIALOG, { timeout: 6000 })
      .then(() => true)
      .catch(() => false);
    record('shift + right-click reaches the damage modifier dialog', damageDialog);
    await dismiss();
  } else {
    record('shift + right-click reaches the damage modifier dialog', false, 'no choice dialog');
  }

  // 7 — a hit offers the damage roll immediately, without hunting the chat log.
  // The skill is forced to 99 so the attack lands, then put back.
  const forced = await page.evaluate(async () => {
    const actor = ui.deltaGreenCombatHud.actor;
    const item = [...actor.items].find((i) => i.type === 'weapon' && i.system.equipped);
    const key = item?.system?.skill;
    const before = actor.system.skills?.[key]?.proficiency;
    if (before === undefined) return null;

    await actor.update({ [`system.skills.${key}.proficiency`]: 99 });
    return { key, before, weapon: item.name };
  });

  if (!forced) {
    record('a hit offers the damage roll', false, 'could not force a hit');
  } else {
    const seen = await page.evaluate(() => game.messages.contents.length);
    await page.locator('.dg-weapon-panel .item-button').first().click();

    // DialogV2.confirm's yes/no pair is what distinguishes our prompt from the
    // system's own dialogs, which use named actions.
    const PROMPT = 'dialog:has(button[data-action="yes"]):has(button[data-action="no"])';
    const prompt = await page
      .waitForSelector(PROMPT, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    record('a hit offers the damage roll straight away', prompt, forced.weapon);

    if (prompt) {
      // Accept, and confirm the follow-up roll actually reached chat.
      // `force`: the button's own label element takes the hit and bubbles, which
      // Playwright reports as the subtree intercepting pointer events.
      await page.locator(`${PROMPT} button[data-action="yes"]`).first().click({ force: true });
      const rolled = await page
        .waitForFunction((n) => game.messages.contents.length > n + 1, seen, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      record('accepting the offer rolls the damage', rolled);
    }

    await page.evaluate(
      async ({ key, before }) => {
        const actor = ui.deltaGreenCombatHud.actor;
        await actor.update({ [`system.skills.${key}.proficiency`]: before });
      },
      forced
    );
  }

  // 8 — damage rolled *outside* the HUD. `DeltaGreenItem#roll` is what the
  // system's own chat-card buttons call, and it fires no hook; before the chat
  // observer existed, a failed Lethality rolled that way printed its tens+ones
  // damage on the card with no way to apply it.
  const outside = await page.evaluate(async () => {
    const MODULE = 'enhancedcombathud-deltagreen';
    const mode = game.settings.get(MODULE, 'damageAutomation');
    await game.settings.set(MODULE, 'damageAutomation', 'propose');

    const self = ui.ARGON._token;
    const victim = canvas.tokens.placeables.find((t) => t !== self && t.actor?.system?.health);
    if (!victim) return null;
    victim.setTarget(true, { releaseOthers: true });

    const weapon = [...ui.deltaGreenCombatHud.actor.items].find(
      (i) => i.type === 'weapon' && Number(i.system?.lethality) > 0
    );
    if (!weapon) return null;

    const proposals = () =>
      game.messages.contents.filter((m) => m.flags?.[MODULE]?.pendingDamage).length;

    // The path the system's card takes.
    const beforeSheet = proposals();
    await weapon.roll({ lethal: true });
    await new Promise((r) => setTimeout(r, 1200));
    const fromSheet = proposals() - beforeSheet;

    // The HUD's own path, which must still produce exactly one — not two now
    // that a second observer exists.
    const { rollService } = await import(`/modules/${MODULE}/scripts/roll-service.mjs`);
    const beforeHud = proposals();
    await rollService.rollWeaponDamage({
      actor: ui.deltaGreenCombatHud.actor,
      token: self,
      item: weapon,
      choice: 'lethality'
    });
    await new Promise((r) => setTimeout(r, 1200));
    const fromHud = proposals() - beforeHud;

    await game.settings.set(MODULE, 'damageAutomation', mode);
    return { fromSheet, fromHud, weapon: weapon.name };
  });

  if (!outside) {
    record('a Lethality rolled outside the HUD can still be applied', false, 'no lethal weapon or no second token');
  } else {
    record(
      'a Lethality rolled outside the HUD can still be applied',
      outside.fromSheet === 1,
      `${outside.weapon}: ${outside.fromSheet} proposal(s)`
    );
    record(
      'a roll from the HUD is still proposed exactly once',
      outside.fromHud === 1,
      `${outside.fromHud} proposal(s)`
    );
  }

  // 9 — the attack card names who it was aimed at, and honours the token's own
  // display-name setting rather than baking a name in for everyone.
  const aimedAt = await page.evaluate(() => {
    const self = ui.ARGON._token;
    const victim = canvas.tokens.placeables.find((t) => t !== self && t.actor?.system?.health);
    if (!victim) return null;
    victim.setTarget(true, { releaseOthers: true });
    return { name: victim.name, count: game.messages.contents.length };
  });

  if (!aimedAt) {
    record('an attack card names its target', false, 'no second token to target');
  } else {
    await page.locator('.dg-weapon-panel .item-button').first().click();
    await page
      .waitForFunction((n) => game.messages.contents.length > n, aimedAt.count, { timeout: 8000 })
      .catch(() => null);
    await page.waitForTimeout(700);

    const named = await page.evaluate(() => {
      // The attack card, not whatever the damage prompt may have added after it.
      const message = game.messages.contents
        .reverse()
        .find((m) => m.rolls?.[0]?.options?.rollType === 'weapon');
      const line = document.querySelector(`[data-message-id="${message?.id}"] .dg-hud-attack-targets`);

      return {
        flagged: (message?.flags?.['enhancedcombathud-deltagreen']?.attackTargets ?? []).length,
        shown: line?.innerText ?? null
      };
    });

    record(
      'an attack card names its target',
      named.flagged === 1 && Boolean(named.shown) && named.shown.includes(aimedAt.name),
      named.shown ?? `flagged=${named.flagged}, nothing rendered`
    );

    // A hit opens the damage prompt; leave nothing on screen for the next check.
    await dismiss();
  }

  // 10 — dropping several targets must leave one control, not one per target.
  // `targetToken` fires once per token, and Argon's ButtonHud appends its
  // buttons after the element has been cleared, so overlapping renders stacked.
  const controls = await page.evaluate(async () => {
    const self = ui.ARGON._token;
    const others = canvas.tokens.placeables.filter((t) => t !== self).slice(0, 3);
    if (others.length < 2) return null;

    others.forEach((t, i) => t.setTarget(true, { releaseOthers: i === 0 }));
    await new Promise((r) => setTimeout(r, 700));
    const whileTargeting = document.querySelectorAll('.dg-target-hud .button-hud-button').length;

    [...game.user.targets].forEach((t) => t.setTarget(false, { releaseOthers: false }));
    await new Promise((r) => setTimeout(r, 700));

    return {
      targeted: others.length,
      whileTargeting,
      afterClearing: document.querySelectorAll('.dg-target-hud .button-hud-button').length
    };
  });

  if (!controls) {
    record('the target readout keeps one control through a re-target', false, 'not enough tokens');
  } else {
    record(
      'the target readout keeps one control through a re-target',
      controls.whileTargeting === 1 && controls.afterClearing === 1,
      `${controls.targeted} targeted → ${controls.whileTargeting}, cleared → ${controls.afterClearing}`
    );
  }

  console.table(checks);
  const failed = checks.filter((c) => c.result === 'FAIL');

  await page.screenshot({ path: 'tools/.out/verify.png' });
  console.log('Screenshot: tools/.out/verify.png');

  reportConsole(consoleLog);
  await browser.close();

  if (failed.length) process.exit(1);
}

function reportConsole(consoleLog) {
  const problems = consoleLog.filter(
    (entry) =>
      (entry.type === 'error' || entry.type === 'pageerror' || entry.type === 'warning') &&
      !/deprecat|Fontconfig|favicon/i.test(entry.text)
  );

  if (!problems.length) {
    console.log('\nConsole: clean');
    return;
  }

  console.log(`\nConsole problems (${problems.length}):`);
  for (const problem of problems.slice(0, 25)) {
    console.log(`  [${problem.type}] ${problem.text.split('\n')[0].slice(0, 160)}`);
  }
}

const commands = { probe, diagnose, smoke, verify };
const command = commands[process.argv[2] ?? 'diagnose'];

if (!command) {
  console.error(`Unknown command. Use one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

command().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
