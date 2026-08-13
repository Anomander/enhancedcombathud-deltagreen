# Changelog

All notable changes to the Delta Green Enhanced Combat HUD are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [semantic versioning](https://semver.org/). Releases are cut by pushing a `release-*` tag
— see [docs/RELEASE.md](docs/RELEASE.md).

## [Unreleased]

Nothing has been published yet. `1.0.0` was prepared but never tagged or released, and the
module was rebuilt on Argon Core before it was; the entry that described it has been removed
rather than left to advertise features that no longer exist.

### Added

- **Argon Core integration.** The HUD is contributed to
  [Argon — Combat HUD (CORE)](https://github.com/theripper93/enhancedcombathud), which owns
  position, theming, visibility and the toggle keybinding.
- **Portrait and vitals** — HP, WP, Sanity, Breaking Point and armour, with dying and dead
  states distinguished. Sanity honours the system's *Keep Sanity Private* setting.
- **Attacks** — every equipped weapon, with damage, Lethality, armour piercing, range and
  ammunition in the tooltip.
- **Skills** — every skill the system defines, grouped into trained, typed, Special Training
  and untrained. Nothing is hardcoded; the list comes from the actor.
- **Reactions** — Dodge and Fight Back, shown only when the actor has the skill.
- **Sanity** — a Sanity test, and an optional Willpower Boost house rule (off by default).
- **Agent Record drawer** — statistics, Bonds and Motivations.
- **Damage automation** — after a damage or Lethality roll against a target, the result is
  resolved through armour and armour piercing and offered as a chat card with an *Apply*
  button. A new **Damage automation** setting chooses between *Propose* (default) and
  *Auto-apply*. The write runs as whoever clicks, so a Handler can apply a player's roll
  without any socket relay.
- **Roll outcomes are observable.** Every evaluated roll is published as an
  `enhancedcombathud-deltagreen.rollOutcome` hook, so effects modules can attach without
  patching anything.
- **Target reticle** in Argon's previously unused `ButtonHud` slot, beside the portrait. It
  frames the target's token art in a crosshair, names it, and offers a *Re-target* control.
  Three states are distinguished — nothing targeted (amber, dashed), one target, and several
  (red) — the first and last being exactly when damage automation cannot act, so the reason is
  visible rather than silent. Names honour each token's display-name mode and are withheld
  when the Handler has hidden them; the *actor's* portrait is never used, only token art that
  is already on the canvas, and hit points and condition are never shown.
- **Damage prompt on a hit.** A successful weapon attack immediately asks the player who
  rolled whether to roll damage, instead of leaving them to find the buttons on the chat card.
  It offers exactly what that card would — the system's own damage-or-lethality dialog when a
  weapon has both, a plain confirmation when it has only one, and nothing at all when it has
  neither — and rolls through the same path the character sheet uses.
- **Attack cards name their target.** A weapon attack records who the roller had targeted and
  states it under the roll — *Against Cultist* — so the table does not have to ask after every
  shot. Only token uuids are stored; each viewer's card resolves the names itself, so a token
  whose name the Handler has hidden shows as an unidentified target rather than leaking. The
  line is stamped on the message rather than on the roll, so an attack made from the character
  sheet carries it exactly as one from the HUD does.
- **Public API** on `ui.deltaGreenCombatHud`.
- **Diagnostics** — `ui.deltaGreenCombatHud.diagnose()` reports what the HUD sees and built.

### Fixed

- **A weapon with only Lethality still asked "damage or Lethality?"** Right-click opened the
  system's choice dialog for every weapon, so a Grenade — Lethality 15, no damage formula —
  was asked a question the character sheet never asks, and offered a *Roll Damage* button that
  rolls an empty formula. The sheet's weapon row renders the combined control only when the
  weapon carries both, and a direct one otherwise (`hasWeaponDamageAndLethality`); the HUD now
  reads the same two predicates. A weapon carrying both still asks, a weapon carrying one rolls
  it straight away, and a weapon carrying neither declines out loud instead of opening a dialog
  whose every button rolls nothing (PAR-1, PAR-3, UX-1).
- **A failed Lethality rolled outside the HUD could not be applied.** A failed Lethality roll
  still deals its tens+ones damage (Agent's Handbook p. 57), and the HUD would offer to apply
  it — but only for rolls the HUD itself issued. A player who declined the damage prompt and
  used the *Roll Lethality* button on the system's own attack card got nothing: that button
  calls `DeltaGreenItem#roll`, which goes straight to `actor.sheet.processRoll`, and the system
  fires no hook anywhere in its roll pipeline. Damage and Lethality rolls are now observed
  through their chat message, so wherever they are rolled from — the HUD, the character sheet,
  or the card's own buttons — the result can be applied. Rolls the HUD issued are marked so
  they are still offered exactly once.
- **Rolling damage with several targets held did nothing, silently.** Resolution against more
  than one target is genuinely ambiguous, so automation stands down — but it now says so
  instead of looking like a broken Apply button.
- **Clearing several targets left a stack of *Select target* buttons.** Foundry fires
  `targetToken` once per token, and Argon's `ButtonHud` appends its controls *after* the only
  step that clears the element, so overlapping renders accumulated one button per target.
  Renders are now serialised and coalesced.
- **Lethality never rolled from the HUD.** The damage path called the system's
  `item.roll({ critical, lethal })` with a positional boolean, so both flags were discarded:
  every right-click rolled ordinary damage, and a critical never doubled. Right-click now
  mirrors the character sheet's own `damage-or-lethality` control, which asks the player which
  to roll.
- **Willpower Boost could be paid for and lost.** The cost was deducted when the boost was
  armed, but the bonus was held only in memory — so cancelling the modifier dialog, a blocked
  roll, or a page reload spent the Willpower for nothing. Willpower is now taken *after* the
  dice are actually rolled, and the boost is a toggle that can be cancelled at no cost.
- **Removed a self-referential symlink** that had been committed at the repository root.
- **Removed a weapon-button override that did nothing.** `useTargetPicker` was forced on, but
  Argon gates its picker on `useTargetPicker && targets > 0` and `targets` defaults to `0`, so
  the override never had any effect — while also overriding a HUD preference that belongs to
  Argon. Argon's TargetPicker is deliberately *not* requested: its tutorial promises "right
  click to cancel", but that is a document-level listener, so Foundry opens the Token HUD on
  the same click, and its teardown scrambles the active scene-control tool. The target reticle
  covers the same need without either problem.
- **The target block overlapped the portrait.** Argon pins its side HUD at a hardcoded
  `left: 375px` while declaring the portrait `min-width: 375px` — growable. Delta Green vitals
  render wider than that (463px measured), so the block was drawn 88px over the portrait. It
  now measures the portrait and sits against its actual edge, following it as the actor,
  scale or window changes.
- **Weapon range could produce a broken range ring.** The button returned the schema's
  free-text range (`"10M"`) where Argon does arithmetic, giving `"10M" + offset`. It no longer
  claims a numeric range it does not have.

### Changed

- `spendWillpowerBoost()` is now `toggleWillpowerBoost()`, reflecting that arming is free and
  reversible. `isWillpowerBoostArmed()` and `rollWeaponDamage()` were added alongside it.
