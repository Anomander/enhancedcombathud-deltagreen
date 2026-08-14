# ARCHITECTURE.md — how it is built

The structure of the module and the reasoning behind it. For *why* the structure is shaped
this way, see [DESIGN.md](DESIGN.md); for what it is meant to achieve, [PRODUCT.md](PRODUCT.md).

---

## The approach in one paragraph

This is a **containment architecture**. The module's single organising idea is that the HUD
framework it currently renders through — Argon Core — is a *replaceable detail*, not the
module's identity. Everything that knows about Delta Green is isolated from everything that
knows about Argon, and the two meet at one seam. That constraint is what earns the right to
depend on an undocumented third-party framework at all ([DESIGN.md §4](DESIGN.md)), and it is
also what makes the interesting code testable without a browser.

---

## Layers

Four, dependencies pointing down only. The authoritative diagram and the *where does this code
go* table are in [DESIGN.md §1](DESIGN.md). In short:

```
  PRESENTATION   scripts/argon/*        knows Argon, knows no rules
  CORE           scripts/*              knows Delta Green, knows no HUD
  SYSTEM         deltagreen             two doors: roll/roll.js, data/**
  FOUNDRY
```

---

## Module inventory

| File | Layer | Responsibility | May be imported by |
|---|---|---|---|
| `delta-green-combat-hud.mjs` | root | **Composition root.** Registers settings, subscribes automation, hooks `argonInit`, publishes the API. | nothing |
| `api.mjs` | core | Public API surface (`ui.deltaGreenCombatHud`). | root |
| `host.mjs` | core | **The presentation seam.** What the core is allowed to know about a HUD. | anything |
| `actor-adapter.mjs` | core | **The only reader of Delta Green actor data.** | anything |
| `roll-service.mjs` | core | **The only path to the dice.** Wraps `processDGRoll`. Owns turn gating and Willpower Boost arming. | anything |
| `roll-outcome.mjs` | core | Reads a finished roll: evaluated or not, success, Lethality. Pure. | anything |
| `roll-observer.mjs` | core | Republishes damage and Lethality rolls the module did not issue. | root |
| `resolution.mjs` | core | Damage after armour and armour piercing. Pure. | anything |
| `automation.mjs` | core | Resolves damage against the target and offers it in chat. | root |
| `damage-prompt.mjs` | core | Offers the damage roll the moment an attack lands. | root |
| `attack-targets.mjs` | core | Records who an attack was aimed at; names them per viewer. | root |
| `events.mjs` | core | In-module event bus for roll outcomes. | anything |
| `targeting.mjs` | core | What may be said about the current target. Pure. | anything |
| `weapon-sets.mjs` | core | What a weapon set names, and what switching to it equips. Pure. | anything |
| `roll-handler.mjs` | core | Pure math for the Willpower Boost house rule. No I/O. | anything |
| `settings.mjs` | core | Setting registration and typed readers. | anything |
| `logger.mjs` | core | Levelled logging, gated on the `debugMode` setting. | anything |
| `diagnostics.mjs` | core¹ | Environment report for bug triage. | api |
| `argon/register.mjs` | presentation | Builds and registers every component on `argonInit`. | root only |
| `argon/portrait-panel.mjs` | presentation | Portrait, vitals, dying/dead state. | register |
| `argon/weapon-panel.mjs` | presentation | Attacks panel and weapon buttons. | register |
| `argon/skill-panels.mjs` | presentation | Skills, Reactions and Sanity panels and their buttons. | register |
| `argon/stat-panel.mjs` | presentation | Statistics panel and its roll buttons. | register |
| `argon/tile-monogram.mjs` | presentation | The glyph a skill or statistic tile carries in place of art. | skill-panels, stat-panel |
| `argon/drawer-panel.mjs` | presentation | Reference drawer: Bonds, Motivations. | register |
| `argon/weapon-sets.mjs` | presentation | Seeds and prunes the sets in Argon's flag, applies a set change, Willpower Boost control. | register |
| `argon/target-hud.mjs` | presentation | Target readout, in Argon's `ButtonHud` slot. | register |
| `argon/movement-hud.mjs` | presentation | Suppressed. Exists only to opt out of Argon's movement tracker. | register |

¹ `diagnostics.mjs` is exempt from ARCH-6 by role: describing the environment is its job.
The composition root is exempt for the same reason — wiring a presentation layer in is what it
is for. `tests/architecture.test.mjs` enforces the rule and those two exemptions.

---

## Lifecycle

```
  Foundry boot
      │
      ├─ Hooks.once("init")          settings registered
      │                              (must precede any settings read)
      │
      ├─ Argon: new CoreHud()
      │      └─ Hooks.callAll("argonInit", CoreHud)
      │             └─ registerArgonComponents(CoreHUD)
      │                    createPortraitPanel(CONFIG.ARGON)  ─┐
      │                    createWeaponPanel(CONFIG.ARGON)     ├─ classes built here,
      │                    createSkillPanels(CONFIG.ARGON)     │  not at import time
      │                    …                                  ─┘
      │                    CoreHUD.define*(…)
      │
      └─ Hooks.once("ready")         API published on
                                     ui.deltaGreenCombatHud and module.api
```

**Why every component is a `createX(ARGON)` factory.** The base classes live on `CONFIG.ARGON`,
which does not exist until Argon constructs its `CoreHud`. A top-level `class X extends
CONFIG.ARGON…` would evaluate at import time and throw. The factory defers class creation to
the moment the bases exist (ARCH-2).

---

## Data flow — one attack, end to end

```
  player clicks a weapon button
      │
  DGWeaponButton._onLeftClick(event)              scripts/argon/weapon-panel.mjs
      │   presentation knows only: "this was clicked, with this event"
      ▼
  rollService.rollWeaponAttack({actor, token, item, event})
      │
      ├─ canAct(actor) ────────── refused ──► ui.notifications.warn  (UX-6, PAR-4)
      │                                        no roll is made
      ▼ permitted
  #percentileRoll()
      ├─ await this.api()                 dynamic import of the system roll API
      ├─ new DGPercentileRoll(…)          system class, system semantics
      ├─ roll.modifier += armed WP boost  the only modifier we ever add (PAR-2)
      ▼
  processDGRoll(event, roll)              ── the system takes over here ──
      ├─ blockedRollMessage check
      ├─ shift-click → the system's modifier dialog   (PAR-3)
      ├─ roll.evaluate()                  crit/fumble/success per the system
      └─ roll.toChat()                    system chat card, Dice So Nice
```

The shape to notice: **the presentation layer forwards an event and never interprets it.** The
`event` object is passed through untouched so that shift-click opens the system's own modifier
dialog exactly as it does from the character sheet. That is PAR-1 implemented as a single
parameter rather than as a policy anyone has to remember.

---

## The five seams

### 1. The Argon seam — `argonInit` + `CONFIG.ARGON`
Argon is reached through exactly two things: the `argonInit` hook and the `CONFIG.ARGON`
namespace, both only from `scripts/argon/`. Registration uses eight `define*` statics
(`definePortraitPanel`, `defineDrawerPanel`, `defineMainPanels`, `defineWeaponSets`,
`defineMovementHud`, `defineButtonHud`, `defineSupportedActorTypes`, `defineTooltip`). **That
list is the entire extension surface.** A feature that cannot be expressed within it is a
dependency tripwire, not a puzzle to solve with monkey-patching ([DESIGN.md §3](DESIGN.md)).

### 2. The system data seam — `actor-adapter.mjs`
One module reads Delta Green actor data, and every path it reads is verified against
`systems/deltagreen/module/data/` and cited in a comment (SYS-1). It returns HUD-shaped data
with explicit `available: false` for anything an actor type genuinely lacks, so callers cannot
mistake absence for zero (SYS-5).

### 3. The system dice seam — `roll-service.mjs`
One module touches dice, and it only ever hands work to `processDGRoll`. The system API is
**injected, not imported at module scope**:

```js
constructor({ loadApi } = {}) {
  this.#loadApi = loadApi ?? (() => import(SYSTEM_ROLL_API_PATH));
}
```

`/systems/deltagreen/...` resolves only inside Foundry. Injecting the loader lets the whole
roll path be unit-tested in Node with no `typeof game` branches in production code (TEST-3,
TEST-6) — and is why `external: ['/systems/*']` is mandatory in the build.

### 4. The settings seam — `settings.mjs`
Settings are registered in one place and read through typed accessors (`getWpBoostSettings()`),
never via scattered `game.settings.get` calls. Every registered setting has a reader; a setting
with no reader is deleted, not left registered (UX-2).

### 5. The chat seam — `roll-observer.mjs`
The module cannot see a roll it did not make. The Delta Green system fires **no hook anywhere in
its roll pipeline**, and `DeltaGreenItem#roll` — what the *Roll Damage* / *Roll Lethality*
buttons on the system's own attack card call — goes straight to `actor.sheet.processRoll`. A
player who declined the HUD's prompt and used those buttons got no offer to apply the result,
which mattered most for a **failed Lethality**: it still deals its tens+ones damage, and that
damage had nowhere to go.

The one place every Delta Green roll surfaces is its chat message, and the system registers its
roll subclasses in `CONFIG.Dice.rolls`, so a roll read back off a message is a real
`DGLethalityRoll` — `target`, `nonLethalDamage` and `isSuccess` all answer, before and after a
reload. `roll-observer.mjs` watches `createChatMessage` and republishes damage and Lethality
rolls onto the same bus `roll-service.mjs` uses, so automation has one input regardless of where
the roll came from.

Two guards keep it honest:

- **Only the author's client acts.** `createChatMessage` fires everywhere; resolution belongs to
  the player who rolled, and theirs is the target that counts.
- **Rolls the module issued are skipped**, via `roll.options.dgHudOrigin` (`roll-service.mjs`).
  `roll.options` is serialised into the message, so the mark survives to where it is read. It
  changes no dialog, no modifier, no evaluation and nothing the card renders — PAR-1 holds — and
  **nothing may ever branch a roll on it.**

Attack rolls are deliberately *not* observed. The system's card already offers its own damage
buttons, so treating a sheet attack as a HUD one would put a second prompt in front of a player
who never asked the HUD for anything.

---

## State ownership

Knowing who owns what prevents most re-render bugs.

| State | Owner | Notes |
|---|---|---|
| Which actor the HUD shows | **Argon** (`ui.ARGON._actor`) | Components read `this.actor`; never resolve their own (ARCH-2). |
| HUD visibility, position, theme | **Argon** | Never reimplemented (ARCH-1). |
| Weapon-set configuration | **Argon**, in actor flags | We only supply `getDefaultSets()`. |
| Actor data, skills, items | **The system** | Read-only to us, via the adapter. |
| Equipped flags | **The system**, written by us on set change | `weapon-sets.mjs` `_onSetChange`. |
| Module settings | **Us**, world/client scoped | |
| Armed Willpower Boost | **Us**, in memory | See debt below. |

---

## Argon's sharp edges

Constraints learned the expensive way. They are recorded here, asserted by
`tests/argon-contract.test.mjs`, and the important ones are invariants — so they cost their
discovery price only once.

| Constraint | Symptom when violated | Mitigation |
|---|---|---|
| Templates resolve from `Object.getPrototypeOf(this.constructor).name` into *Argon's* partials dir | A two-deep subclass looks for a template that does not exist; render fails | **ARCH-7**: every component sits exactly one level below an Argon base. Asserted by the contract test. |
| Same mechanism at build time | Minified class names break every render | `--keep-names` is mandatory in `tools/build.mjs` |
| `ItemButton` defaults `inActionPanel` to `isWeaponSet` | Buttons styled for the accordion list collapse to zero width in an action panel | Pass `inActionPanel: true` explicitly |
| `MovementHud.movementUsed` is a getter/setter pair | Overriding the getter alone shadows the setter → *"Cannot set property … which has only a getter"* | Override the *method* that assigns, not the accessor. Contract test asserts no getter-only overrides of paired accessors. |
| A button's `icon` is applied as a CSS `background-image` | Font Awesome classes render as nothing | Use image paths. Contract test asserts this. |
| …except on `ButtonHud`, where `icon` is Font Awesome **classes** | An image path renders as nothing | Opposite convention in the same framework. |
| The target picker is gated on `useTargetPicker && targets > 0`, and `targets` defaults to `0` | Overriding `useTargetPicker` alone does nothing at all | Leave both alone. Declaring `targets` switches the picker on, and it is worse than the gap it fills — see below. |
| `TargetPicker` cancels on a document-level `mouseup`, and tears down via `document.querySelector('.control.tool').click()` | Foundry opens the Token HUD on the same right-click the tutorial says will cancel; the active tool is left scrambled | Do not request the picker. The target reticle serves the same purpose. |
| Argon re-renders on actor, item, token and combat changes — but never on targeting | A target readout goes stale | Hook `targetToken` once, at registration; not in a component constructor, which Argon rebuilds per render. |
| `ButtonHud.render` writes layout inline (`display:grid`, rows sized to the button count), and `.movement-hud:has(.button-hud-button)` sets `justify-content: unset` at higher specificity than a module class | A stylesheet cannot lay this component out | Set layout inline in `render()`; keep only appearance in CSS. |
| `ButtonHud.render` **appends** its buttons, while `_renderInner` is the only thing that clears the element | Two renders in flight interleave — clear, clear, append, append — and controls pile up. `targetToken` fires once per token, so dropping three targets left three stacked *Select target* buttons | Serialise and coalesce renders in the component; at most one waits behind the one in flight. |
| `.movement-hud` is pinned at a hardcoded `left: 375px`, but `.portrait-hud` is only `min-width: 375px` | Any system whose portrait grows past 375px has its side HUD drawn over the portrait — ours measured 463px, an 88px overlap | Measure the portrait and place beside its real right edge, kept current with a `ResizeObserver`. |
| `updateItem` re-renders matching buttons but never re-runs a panel's `_getButtons()` | A newly equipped weapon does not appear until the HUD rebinds — which is why switching actors appeared to "fix" it | Explicit `ui.ARGON.refresh()` after set changes |

`MovementHud` deserves its own note: Argon defaults `MOVEMENT` to a base class whose
`movementMax` is unimplemented, so *not* registering a movement HUD renders `NaN` over the
token. Opting out requires registering a permanently hidden subclass — which is what
`movement-hud.mjs` is, and its only reason to exist.

---

## Adding a component

1. Add `scripts/argon/<thing>.mjs` exporting `createThing(ARGON)`.
2. Extend an Argon base **directly** (ARCH-7). Never extend one of your own classes.
3. Get data from `actor-adapter.mjs`. Get dice from `roll-service.mjs`. Import nothing from
   `/systems/` (SYS-4).
4. Localise every string (UX-3) and add the key to **both** `lang/en.json` and `lang/es.json`
   — the language test enforces parity.
5. Register it in `argon/register.mjs`.
6. `npm test` — the contract test will catch inheritance depth, missing abstract methods,
   accessor shadowing and Font Awesome icons.
7. `FOUNDRY_USER=… npm run fvtt:diagnose` — because green tests are not evidence (PROC-1).

---

## The rule the module encodes itself

One exception to *not a rules engine*, and it is deliberate. **The Delta Green system does not
apply damage.** It derives `system.health.protection` from equipped armour, but nothing in the
system consumes it, and there is no `applyDamage` anywhere in `module/`. So armour arithmetic
has nowhere else to live.

It is confined to `resolution.mjs`, which is pure, and to exactly three rules:

1. Armour subtracts from incoming damage.
2. Armour Piercing reduces the target's armour for that attack.
3. A successful Lethality roll kills outright, ignoring armour; a failed one deals the
   system's own `nonLethalDamage` total, against which armour applies.

Everything else — whether the attack hit, how much damage was rolled, whether Lethality
killed — is read from the system's roll objects. Nothing may be added to that list without
first revisiting OOS-1 in [PRODUCT.md](PRODUCT.md).

**One divergence worth knowing.** `DGLethalityRoll.toChat()` prints LETHAL from
`total <= target` (the *unmodified* rating), while the inherited `isSuccess` compares against
`effectiveTarget`. With a modifier applied the two disagree. `roll-outcome.mjs` follows the
chat card, because that is what the table adjudicates from — a HUD claiming a kill on a card
that says failure is exactly the divergence PAR-1 exists to prevent. The inconsistency is the
system's; worth raising upstream.

## Known debt

**Nothing outstanding.** The `api.mjs` Argon coupling and the volatile Willpower Boost recorded
here previously are both fixed, and each now has a test that fails against the old behaviour.
