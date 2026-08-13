# REQUIREMENTS.md — what it must do

Numbered and traceable. Every requirement cites the invariant in [CLAUDE.md](../CLAUDE.md) or
the product statement in [PRODUCT.md](PRODUCT.md) it derives from, so a requirement can never
become an orphan preference nobody remembers agreeing to.

**Status** is `shipped`, `roadmap`, or `deferred` — deferred meaning consciously not built,
not forgotten.

---

## Environment

Hard constraints. Violating any of these means the module does not run.

| | Requirement | Enforced by |
|---|---|---|
| **ENV-1** | Foundry VTT **v14** (`compatibility`: minimum 14, verified 14, maximum 14). | `manifest.test.mjs` |
| **ENV-2** | Delta Green system **≥ 2.0.0** — the 2.x data model. Earlier versions have different actor shapes and the adapter reads `undefined` from them without erroring. | `manifest.test.mjs`, `schema-drift.test.mjs` |
| **ENV-3** | Argon — Combat HUD (CORE) **≥ 5.0.0**, declared in `relationships.requires`. The module contributes components and cannot render without it. | `manifest.test.mjs`, `build.mjs verifyManifest()` |
| **ENV-4** | Module id **must** be `enhancedcombathud-deltagreen`. Argon discovers its system module by looking up `enhancedcombathud-${game.system.id}` and shows a permanent error otherwise. Not a naming preference — a lookup key. | `manifest.test.mjs` |
| **ENV-5** | The settings namespace matches the module id. | `manifest.test.mjs` |
| **ENV-6** | Development requires Node 20 and no build step; Foundry loads `scripts/**/*.mjs` as native ESM from the tree. Chromium (via Playwright) is needed only for live-world verification. | CI |

---

## Functional requirements

### Reach — solving *"finding the right roll"*

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-1** | Show the current Agent's HP, WP, Sanity, Breaking Point and armour at a glance, with dying and dead states distinguished. | shipped | [PRODUCT.md](PRODUCT.md) pain 2 |
| **FR-2** | Present every equipped weapon as a one-click attack, with damage, Lethality, armour piercing, range and ammunition available without leaving the HUD. | shipped | pain 1 |
| **FR-3** | Present every skill the actor has — including typed skills and Special Training — grouped by trained/untrained, one layer deep. Keys and labels come from the actor, never a hardcoded list. | shipped | SYS-2, §2.5 |
| **FR-4** | Offer Dodge and Fight Back as reactions, each shown only if the actor has the skill. | shipped | UX-1 |
| **FR-5** | Offer a Sanity test. | shipped | |
| **FR-6** | Carry reference material a player *reads* rather than clicks — statistics, Bonds, Motivations — in the drawer, not the action bar. | shipped | §2.5 |
| **FR-7** | Seed weapon sets from the actor's equipped weapons, so the HUD is useful before anyone configures it; switching a set equips that set and unequips the rest. | shipped | UX-1 |
| **FR-8** | Support `agent`, `npc` and `unnatural` actors. `vehicle` is excluded — it has no Willpower, Sanity or skills. | shipped | SYS-5 |

### Rolls — the core promise

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-9** | A roll issued from the HUD is indistinguishable from the same roll issued from the character sheet: same modifier dialog, same evaluation, same chat card, same Dice So Nice. | shipped | **PAR-1** |
| **FR-10** | All dice go through the system's `processDGRoll`. The module never evaluates a roll itself. | shipped | **SYS-3** |
| **FR-11** | Where the system offers a choice — the modifier dialog, flat damage versus a Lethality roll — the HUD surfaces the system's own dialog rather than deciding. | shipped | **PAR-3** |
| **FR-12** | The originating event is passed through untouched, so shift-click behaves exactly as it does on the sheet. | shipped | PAR-1 |
| **FR-13** | The HUD adds no modifier of its own, except a house rule the user has explicitly enabled. | shipped | **PAR-2** |

### Turn gating — the one permitted deviation

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-14** | Outside their own turn, a player's weapon attack is refused. The Handler is never gated, and gating does not apply before initiative is rolled or outside combat. | shipped | **PAR-4** |
| **FR-15** | Every refusal explains itself in the player's language. | shipped | **UX-6**, UX-3 |
| **FR-16** | Refusal never alters a roll that does happen. Gating is a permission decision, not a dice decision. | shipped | **PAR-4** |

### House rules

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-17** | Willpower Boost: optionally spend WP for a percentile bonus on the next roll. Cost and bonus are configurable; **off by default**, so a stock game matches the book. | shipped | *not a house-rule framework* |
| **FR-18** | A boost refused for insufficient WP deducts nothing and says why. | shipped | UX-6, AUTO-5 |

### Automation

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-19** | Resolve an attack against the Foundry target: read armour, apply armour piercing, resolve Lethality versus damage through the system, and record the result on the target. | shipped | pain 3 |
| **FR-20** | One setting, two modes — **Propose** (default) and **Auto-apply** — sharing a single code path. No third mode, no per-feature toggles. | shipped | **AUTO-1** |
| **FR-21** | Automation acts on outcomes only. It never chooses what to roll, what to target, or whether a hit occurred. | shipped | **AUTO-2** |
| **FR-22** | Every automatic state change states what changed, on whom, and why. | shipped | **AUTO-3** |
| **FR-23** | Never write to a document the acting user lacks permission to update — route it or refuse, never fail silently. | shipped | **AUTO-4** |
| **FR-24** | Missing input (no target, no armour value) means decline out loud and change nothing. Never assume a default. | shipped | **AUTO-5**, SYS-5 |
| **FR-28** | A successful weapon attack offers its damage roll immediately, to the player who rolled, presenting exactly the options the system's chat card would. | shipped | pain 3, **PAR-3** |
| **FR-25** | Roll outcomes are observable as events, so effects can be attached without editing click handlers. Prerequisite for Sequencer integration. | shipped | [PRODUCT.md](PRODUCT.md) roadmap |

### Supporting

| | Requirement | Status | Trace |
|---|---|---|---|
| **FR-26** | Expose a public API (`ui.deltaGreenCombatHud`) for macros: roll a skill, roll Sanity, roll an attack, roll damage, arm or cancel a boost, read skills and weapons, toggle the HUD. | shipped | |
| **FR-27** | Produce a diagnostic report of what the HUD sees and built, in-world and from the command line, suitable for pasting into a bug report. | shipped | NFR-9 |

---

## Non-functional requirements

| | Requirement | Trace |
|---|---|---|
| **NFR-1** | **Correctness by delegation.** If a number can be read from the system, reading it is the only acceptable implementation — recomputing is a defect even when the result is correct. Every data path is verified against `systems/deltagreen/module/data/` and cited in a comment. | SYS-1, *not a rules engine* |
| **NFR-2** | **Honest absence.** Missing data renders as absent, never as zero or a plausible default. An Unnatural shows no Sanity row. | SYS-5, §2.3 |
| **NFR-3** | **Privacy.** Sanity honours the system's `keepSanityPrivate` setting everywhere it could surface — panel, tooltip, chat, diagnostics, logs. | UX-5, §2.7 |
| **NFR-4** | **Localisation.** No hardcoded user-facing strings. `en` and `es` maintained at full key parity with matching interpolation placeholders; every defined key is referenced and every referenced key is defined. | UX-3, `lang.test.mjs` |
| **NFR-5** | **Vocabulary.** Agent, Handler, Bond, Breaking Point, Lethality. Never Argon's or D&D's terms. A tone requirement as much as a correctness one. | UX-7, §2.6 |
| **NFR-6** | **Incremental re-render.** Update what changed; never rebuild the HUD wholesale on every actor update. | UX-4 |
| **NFR-7** | **No dead controls.** Every rendered control acts, or is not rendered. | UX-1 |
| **NFR-8** | **No global mutation.** | ARCH-5 |
| **NFR-9** | **Observability.** Debug logging behind a client setting; a diagnostic report available without a debugger. | UX-2 |
| **NFR-10** | **Substitutability.** Deleting `scripts/argon/` must leave a module that loads and passes its full test suite. This is the term on which the Argon dependency was accepted. Asserted by `tests/architecture.test.mjs`. | **ARCH-6**, [DESIGN.md §1](DESIGN.md) |
| **NFR-11** | **Headless testability.** The core tests with no Foundry, no Argon and no DOM, via injection seams rather than production branches. | TEST-3, TEST-6 |
| **NFR-12** | **Zero-friction development.** No build step, no TypeScript, no linter for development. Edit, reload, done. | |

---

## Out of scope

The four anti-goals, as exclusions. Full tests for each in [PRODUCT.md](PRODUCT.md).

| | Excluded | Boundary test |
|---|---|---|
| **OOS-1** | Reimplementing or reinterpreting Delta Green rules. | Does this code contain a formula from the Agent's Handbook? |
| **OOS-2** | Editing Agents — inventory, chargen, sheet authoring. | Does this write to an actor for a reason other than an action just taken? |
| **OOS-3** | Handler campaign tooling — NPC management, encounter building, prep. | Is this useful when no combat is running? |
| **OOS-4** | Arbitrary house-rule configuration. | Does this setting resolve a genuine system ambiguity, or encode a preference? |

**Deferred, not rejected:** Sanity-flow automation (prompting checks, applying loss,
Bond-spending), wound and status effects, initiative management. Reconsidered once the three
named pains are solved.

---

## Constraints imposed by dependencies

Not our choices, but binding, and the reason for several requirements above.

| Constraint | Consequence |
|---|---|
| `weapon.system.ammo` is a `StringField`, not `{value, max}` | Ammunition tracking cannot be built. Per SYS-6 the response is to raise a schema change upstream, never to shadow ammo in module flags. |
| The system applies no damage — it derives `health.protection` but never consumes it | Armour arithmetic has to live in the module. Confined to `resolution.mjs` and to three stated rules; a deliberate, narrow exception to OOS-1. |
| Argon's extension surface is eight `define*` statics | A feature inexpressible within them is a dependency tripwire, not a monkey-patching problem. |
| Argon resolves templates from the immediate parent's constructor name | Every component sits exactly one level below an Argon base (ARCH-7), and `--keep-names` is mandatory at build time. |
| Argon owns chrome, keybindings and actor binding | The module registers no keybindings and no combat or token hooks (ARCH-1). |

---

## Acceptance

**Product-level**, from [PRODUCT.md](PRODUCT.md) — the claims the module must be able to make:

1. Three clicks or fewer from *"I want to shoot him"* to damage recorded on the target.
2. Zero sheet-opening by a player during a combat round.
3. No arithmetic performed by a human to resolve an attack.
4. No new rules to learn — a player who knows the sheet knows the HUD.

Claims 1 and 3 were gated on FR-19, which has now shipped. Both are met for a Handler driving
the HUD, and for a player once the Handler clicks *Apply*. Neither has yet been confirmed in a
live world (PROC-1), so they are claimable but not yet verified.

**Per-feature**, from PROC-5 — a feature is done only when it is **reachable, localised, tested
and confirmed in a live world.** Green tests are not evidence (PROC-1).
