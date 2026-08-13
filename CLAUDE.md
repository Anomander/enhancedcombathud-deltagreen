# CLAUDE.md — Delta Green Enhanced Combat HUD

Foundry VTT module (`id: enhancedcombathud-deltagreen`). A combat surface for Delta Green that
puts everything an Agent needs during a firefight one click away and applies the results —
**without changing how Delta Green's dice work.**

It is currently delivered as an **Argon Core system module**: it registers Delta Green
components with [Argon - Combat HUD (CORE)](https://github.com/theripper93/enhancedcombathud),
which owns the chrome. That is a *containment decision, not an identity*. Everything outside
`scripts/argon/` is HUD-agnostic and survives Argon's removal (ARCH-6).

**Requires** `enhancedcombathud` ≥ 5.0.0, the `deltagreen` system ≥ 2.0.0, and Foundry v14.

**Read first:** the [project wiki](docs/README.md) — [PRODUCT](docs/PRODUCT.md) (what we are
building and what it must never become), [DESIGN](docs/DESIGN.md) (layer model, design
guidelines, dependency framework), [ARCHITECTURE](docs/ARCHITECTURE.md),
[REQUIREMENTS](docs/REQUIREMENTS.md), [TESTING](docs/TESTING.md), [RELEASE](docs/RELEASE.md).
The invariants below are the enforceable residue of those pages.

---

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full vitest unit test suite. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:coverage` | Vitest coverage report. |
| `npm run sync:schema` | Regenerate the Delta Green schema snapshot from an installed system. |
| `npm run sync:argon` | Regenerate the Argon component contract snapshot. |
| `npm run fvtt:probe` | List joinable users in the running world. |
| `npm run fvtt:diagnose` | Bind the HUD in a real browser and dump its diagnostic report. |
| `npm run fvtt:smoke` | Click through every roll path in the live world. |
| `npm run fvtt:verify` | End-to-end check of the paths unit tests cannot reach. |
| `npm run build` | Release artifact only — writes `dist/`. Not part of the dev loop. |

### Driving a live world

Argon's contract fails at render time, so some defects are invisible to unit tests.
`tools/foundry-driver.mjs` logs into a running Foundry with Playwright and reports what
actually rendered. It needs a **dedicated GM account** — Foundry disables a user who is
already connected, so it cannot share yours:

```bash
FOUNDRY_USER=Claude npm run fvtt:diagnose     # read-only
FOUNDRY_USER=Claude npm run fvtt:smoke        # creates chat messages
FOUNDRY_USER=Claude npm run fvtt:verify       # writes, then restores what it changed
HEADED=1 FOUNDRY_USER=Claude npm run fvtt:diagnose   # watch it
```

`fvtt:smoke` rolls in the live world (chat messages are the evidence a roll worked). It
deliberately skips Willpower Boost, which writes to the actor.

`fvtt:verify` covers what neither unit tests nor smoke can reach: that `Roll#_evaluated` is a
sound witness for "the dice were rolled", that Willpower is charged only afterwards, that
right-click opens the system's damage-or-lethality dialog, and that the Apply button on a
damage proposal writes to the target. It changes Willpower, target hit points and the
automation setting, and puts all three back; it does leave chat messages. It exits non-zero on
any failed check.

Screenshots land in `tools/.out/`. In-world, `ui.deltaGreenCombatHud.diagnose()` produces the
same report as `diagnose`.

There is **no build step for development, no TypeScript, and no linter.** `scripts/**/*.mjs`
is loaded by Foundry as native ESM directly from the tree — edit, reload, done.

`npm run build` produces the **release** artifact (`dist/`):
- `esbuild` with `--keep-names` (**mandatory** — Argon resolves component templates from
  constructor names at runtime; minification breaks every render).
- `external: ['/systems/*']` (**mandatory** — the Delta Green roll API is resolved by
  Foundry at runtime and must not be bundled).
- Fails if any module under `scripts/` is unreachable from the entrypoint.
- Fails if `module.json` omits the Argon dependency or declares a path `dist/` lacks.

---

## Architecture

Four layers; dependencies point down only. Full diagram in
[docs/DESIGN.md §1](docs/DESIGN.md).

- `scripts/delta-green-combat-hud.mjs` — Entrypoint. Registers settings and the
  `argonInit` hook. **No combat or token hooks** — Argon handles HUD visibility.
- `scripts/argon/register.mjs` — Builds and registers every component on `argonInit`.
- `scripts/argon/*.mjs` — **The presentation layer, and the only Argon-aware code in the
  repo.** One component per file. Each exports a `createX(ARGON)` factory, because the base
  classes only exist on `CONFIG.ARGON` once Argon is ready.
- `scripts/host.mjs` — The presentation seam. All the core may know about a HUD.
- `scripts/actor-adapter.mjs` — The only place that reads Delta Green actor data.
- `scripts/roll-service.mjs` — The only path to the dice. Wraps the system's `processDGRoll`.
- `scripts/roll-outcome.mjs` — Reads a finished roll. Pure.
- `scripts/resolution.mjs` — Damage after armour. Pure. The one place a rule is encoded.
- `scripts/automation.mjs` — Resolves damage against the target, offers it in chat.
- `scripts/damage-prompt.mjs` — Offers the damage roll the moment an attack lands.
- `scripts/events.mjs` — In-module bus publishing roll outcomes.
- `scripts/targeting.mjs` — What may be said about the current target. Pure.
- `scripts/roll-handler.mjs` — Pure math for the Willpower Boost house rule only.
- `scripts/settings.mjs` — Module settings. No keybindings (Argon owns Shift+A).
- `scripts/api.mjs` — Public API (`ui.deltaGreenCombatHud`), via the host seam.

### Where the seams are

- **Argon** is reached only through `CONFIG.ARGON` and the `argonInit` hook, only from
  `scripts/argon/`.
- **The Delta Green system** is reached only through `actor-adapter.mjs` (data) and
  `roll-service.mjs` (dice). Nothing else imports from `/systems/`.

### The test that keeps this true

> Delete `scripts/argon/`. The module must still load, pass its full test suite, and expose
> every capability through its API.

Mechanical proxy — this must return **only** `diagnostics.mjs`:

```bash
grep -rln "ui\.ARGON\|CONFIG\.ARGON" scripts/ | grep -v "^scripts/argon/"
```

Two files are exempt by role. `delta-green-combat-hud.mjs` is the **composition root** —
wiring a presentation layer in is its entire job. `diagnostics.mjs` **inspects the
environment** by definition, and a report that could not name Argon would be useless.

This is the term on which the Argon dependency was accepted
([docs/DESIGN.md §4](docs/DESIGN.md)); it is not stylistic hygiene. It is asserted by
`tests/architecture.test.mjs`, because the invariant existed in prose once and was violated
anyway.

The core reaches the HUD through `scripts/host.mjs`: the presentation layer registers
`{ actor, token, isVisible, toggle, refresh }` at `argonInit`, and with no HUD registered the
null host takes over so nothing throws.

---

## Invariants

Non-negotiable rules, cited by ID in code comments and in review. Rationale for all of them is
in [docs/DESIGN.md](docs/DESIGN.md); the product boundaries they enforce are in
[docs/PRODUCT.md](docs/PRODUCT.md).

**Architecture** — ARCH-1 Argon owns all chrome (position, theme, visibility, keybinds); never
reimplement or override it. ARCH-2 All UI is an `ArgonComponent` subclass; components use
`this.actor`, never their own resolver. ARCH-3 No `innerHTML` in `scripts/`. ARCH-4 Never
duplicate an Argon feature. ARCH-5 Never mutate a global. ARCH-6 The core is HUD-agnostic —
nothing outside `scripts/argon/` may reference Argon, and deleting that directory must leave a
module that loads and tests green. The core reaches the HUD through `host.mjs`. Exempt by
role: the composition root (`delta-green-combat-hud.mjs`) and `diagnostics.mjs`. ARCH-7 Every component sits **exactly one level** below an
Argon base class — Argon resolves templates from `Object.getPrototypeOf(this.constructor).name`
into its own partials directory, so a two-deep subclass looks for a template that does not
exist.

**Parity** — PAR-1 A roll issued from the HUD is indistinguishable from the same roll issued
from the character sheet: same dialog, same modifiers, same evaluation, same chat card. PAR-2
The HUD adds no modifier of its own, except a house rule the user has explicitly enabled.
PAR-3 Where the system offers a choice — modifier dialog, flat damage versus Lethality — the
HUD surfaces the system's own dialog rather than deciding for the player. PAR-4 The single
permitted deviation is **refusal**: the HUD may decline to roll (turn gating), and may never
alter a roll it does make.

**System integration** — SYS-1 Every data path is verified against
`systems/deltagreen/module/data/` and cited in a comment; no speculative `??` chains across
invented shapes. SYS-2 Skill keys and labels come from the actor, never a hardcoded list.
SYS-3 All dice go through `processDGRoll`. SYS-4 Import only from paths the system's
`module/MODULES.md` designates public. SYS-5 Missing data renders as absent, never as a
default. SYS-6 Where the system's schema cannot support a feature, the feature is not built —
it is raised upstream. Never shadow system state in module flags (see: `weapon.system.ammo` is
a `StringField`).

**Automation** — AUTO-1 Two modes only, Propose and Auto-apply, sharing one code path; the
mode decides only where it commits. AUTO-2 Automation acts on outcomes, never on decisions —
it may apply the result of a roll, never choose what to roll or what to target. AUTO-3 Every
automatic state change is legible: what changed, on whom, and why. AUTO-4 Never write to a
document the current user lacks permission to update — route it or refuse, never fail
silently. AUTO-5 Missing input means decline out loud and change nothing; never assume a
default.

**UX** — UX-1 Every rendered control acts, or is not rendered. UX-2 Every setting has a
reader. UX-3 No hardcoded user-facing strings. UX-4 Re-render is incremental. UX-5 Honour
`keepSanityPrivate` everywhere Sanity could surface — panel, tooltip, chat, diagnostics, logs.
UX-6 Turn restrictions explain refusals. UX-7 Speak Delta Green: Agent, Handler, Bond,
Breaking Point, Lethality. Never Argon's or D&D's vocabulary.

**Testing** — TEST-1 Fixtures derive from the system's schema; hand-written actor shapes are
forbidden. TEST-2 The drift test must keep passing. TEST-3 No production branch exists only
for tests — use the injection seams. TEST-4 A fix lands with a test proven to fail first.
TEST-5 Unreachable code is deleted, not tested. TEST-6 The core is testable headless — no
Foundry, no Argon, no DOM. A core module that needs a global is misusing its injection seam.

**Process** — PROC-1 Green tests are not evidence; verify in a live world. PROC-2 Delete dead
code in the commit that orphans it. PROC-3 Update this file in the same commit as an
architecture change. PROC-4 Re-read Argon/system source on dependency bumps. PROC-5 A feature
is done only when reachable, localised, tested and confirmed in-world. PROC-6 A dependency
tripwire firing ([docs/DESIGN.md §3](docs/DESIGN.md)) stops work against that dependency until
the framework has been re-run.

---

## Schema snapshot

`tests/fixtures/system-schema.json` is generated from an installed Delta Green system and is
what fixtures and CI are built on. `tests/schema-drift.test.mjs` re-extracts the live schema
when a system is installed and fails if the snapshot has drifted — run `npm run sync:schema`
and review the diff. Set `DG_SYSTEM_PATH` if the system is somewhere non-standard.

`tests/fixtures/argon-contract.json` does the same job for Argon's undocumented surface
(`npm run sync:argon`). Because Argon publishes no API contract, this snapshot *is* the
contract. Breakage on a minor version bump is a tripwire, not a chore — see PROC-6.

## Release

Releases are triggered by pushing `release-*` tags. GitHub Actions updates `module.json`,
builds `dist/`, packages `module.zip`, verifies zip declarations, and publishes to GitHub
Releases.
