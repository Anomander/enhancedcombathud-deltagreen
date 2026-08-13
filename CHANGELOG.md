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
- **Public API** on `ui.deltaGreenCombatHud`.
- **Diagnostics** — `ui.deltaGreenCombatHud.diagnose()` reports what the HUD sees and built.

### Fixed

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
- **Argon's target picker never ran.** The weapon button forced `useTargetPicker` on, but Argon
  gates the picker on `useTargetPicker && targets > 0` and `targets` defaulted to `0`, so the
  override did nothing. Attacks now declare that they want one target, and whether to prompt is
  left to the player's own Argon setting.
- **Weapon range could produce a broken range ring.** The button returned the schema's
  free-text range (`"10M"`) where Argon does arithmetic, giving `"10M" + offset`. It no longer
  claims a numeric range it does not have.

### Changed

- `spendWillpowerBoost()` is now `toggleWillpowerBoost()`, reflecting that arming is free and
  reversible. `isWillpowerBoostArmed()` and `rollWeaponDamage()` were added alongside it.
