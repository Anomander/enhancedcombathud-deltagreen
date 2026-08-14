# Delta Green — Enhanced Combat HUD

A Delta Green module for **[Argon - Combat HUD (CORE)](https://github.com/theripper93/enhancedcombathud)**
in Foundry VTT. It teaches Argon how to read an Agent: vitals, weapons, skills, Sanity, Bonds
and Motivations, all rolled through the Delta Green system's own dice pipeline.

> **Argon Core is required.** This module contributes components to Argon and does nothing on
> its own. Install *Argon - Combat HUD (CORE)* first.

## Requirements

| | Version |
|---|---|
| Foundry VTT | v14 |
| Delta Green system | 2.0.0 or later |
| Argon - Combat HUD (CORE) | 5.0.0 or later |

## What it adds

- **Portrait** — HP, WP, Sanity, Breaking Point and armour, with the Breaking Point
  highlighted once an Agent is at or below it. Sanity respects the system's
  *Keep Sanity Private* setting, so players don't see what they shouldn't.
- **Attacks** — every equipped weapon, with damage, lethality, armour piercing, range and
  ammo in the tooltip. Left-click attacks; right-click asks whether to roll damage or
  Lethality, using the system's own dialog.
- **On a hit** — a successful attack asks whether to roll damage there and then, offering
  exactly what the system's chat card would. The card stays as the record.
- **Damage automation** — after a damage or Lethality roll against a target, the result is
  resolved through armour and armour piercing and offered in chat with an *Apply* button.
  A failed Lethality proposes its tens+ones damage, as the rules do. It does not matter where
  the roll came from — the HUD, the character sheet, or the buttons on the system's own chat
  card. The write runs as whoever clicks it, so a Handler can apply a player's roll.
- **Attack cards name their target** — *Against Cultist*, under the roll. Names honour each
  token's display-name setting per viewer, so a target the Handler has kept nameless stays
  nameless.
- **Targeting** — a reticle beside the portrait frames your target's token art, names it, and
  offers a *Re-target* control. With nothing targeted it goes amber and says so, because that
  is exactly when damage automation cannot act. Names honour each token's display-name
  setting, and an adversary's hit points or condition are never shown. Target tokens the usual
  Foundry way — hover and press `T`, or use the targeting tool.
- **Reactions** — Dodge and Fight Back, shown only when the actor has the skill.
- **Skills** — every skill the system defines, grouped into trained and untrained, including
  typed skills and Special Training.
- **Statistics** — STR, CON, DEX, INT, POW and CHA behind one button, each rolling its own
  x5 test.
- **Sanity** — a Sanity test button.
- **Willpower Boost** (optional house rule) — a control on the weapon-sets line, not an action
  button: it arms a bonus for your next roll rather than rolling anything. Click again to
  cancel; nothing is spent until you actually roll.
- **Agent Record drawer** — Bonds and Motivations at a glance.

Rolls go through the Delta Green system unchanged, so modifier dialogs (shift-click), chat
cards and Dice So Nice all behave exactly as they do on the character sheet.

## Supported actors

Agents, NPCs and Unnatural creatures. Vehicles are excluded — they have no Willpower, Sanity
or skills. An Unnatural shows no Sanity row, because the system gives it SAN-loss formulas
rather than a Sanity score.

## Settings

| Setting | Default | Effect |
|---|---|---|
| Damage automation | Propose | *Propose* offers the resolved damage in chat; *Auto-apply* applies it immediately where permitted. |
| Enable Willpower Boost | Off | House rule: spend WP for a bonus on the next roll. Nothing is spent until you roll. |
| Willpower Boost cost | 1 | WP spent per boost. |
| Willpower Boost bonus | 20 | Percentile bonus granted. |
| Show untrained skills | Off | Lists skills the Agent has no training in. Per player; they stay rollable from the character sheet either way. |
| Debug logging | Off | Detailed HUD activity in the browser console. |

HUD position, theme, size and the toggle keybinding are all configured in **Argon Core's**
own settings.

## API

```js
const hud = ui.deltaGreenCombatHud;

await hud.rollSkill("firearms");
await hud.rollSanity();
await hud.rollWeaponDamage(weaponId);   // asks damage or Lethality, as the sheet does

hud.toggleWillpowerBoost();             // arm or cancel; nothing is spent until you roll
hud.isWillpowerBoostArmed();

hud.getSkills();   // the current actor's skills, as the HUD sees them
hud.toggle();
```

Every evaluated roll is also published as a hook, so other modules can react without
patching anything:

```js
Hooks.on("enhancedcombathud-deltagreen.rollOutcome", (outcome) => {
  // { type, actor, token, item, total, target, success, critical, lethal, nonLethalDamage }
});
```

## Development

```bash
npm test              # unit tests
npm run sync:schema   # refresh the Delta Green schema snapshot
npm run build         # release artifact only
```

No build step is needed for development — Foundry loads `scripts/` as native ESM.

See the **[project wiki](docs/README.md)** for the product definition, design guidelines,
architecture, requirements, testing strategy and release process, and
[CLAUDE.md](CLAUDE.md) for the invariants contributions must hold to.

## Licence

MIT — see [LICENSE](LICENSE).
