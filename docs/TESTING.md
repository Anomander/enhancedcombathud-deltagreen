# TESTING.md — how we know it works

The testing strategy, the four tiers, and the operational workflows for the two that fail in
unusual ways.

---

## The problem this strategy solves

The module sits between **two undocumented dependencies that both fail at render time.**

Argon publishes no API contract; its rules — inheritance depth, abstract methods, accessor
pairs, icon formats — are enforced by a `console.error` in a browser, not by anything a test
runner can see. The Delta Green system publishes a data model that changes between releases,
and reading a field that no longer exists yields `undefined`, not an error.

A conventional unit suite is blind to both. It will pass, confidently, against shapes neither
dependency has ever had — which is exactly how the pre-migration suite passed while the HUD
was broken.

So the strategy answers four different questions with four different mechanisms:

| Question | Mechanism |
|---|---|
| Is our logic right? | Unit tests, headless |
| Do our assumptions about our dependencies still hold? | **Snapshot-contract tests** |
| Will the artifact we ship actually load? | Build and manifest tests |
| Does it work in a real world? | Live-world driver |

---

## Tier 1 — Unit tests

Vitest, `environment: node`, no DOM, no Foundry, no Argon. Everything in the core layer is
reachable this way because its dependencies are injected rather than imported at module scope
(TEST-6).

| Suite | Question it answers |
|---|---|
| `actor-adapter.test.mjs` | Do we read the right fields, and report absence honestly? |
| `roll-service.test.mjs` | Does every roll reach `processDGRoll` with the right arguments? |
| `roll-handler.test.mjs` | Is the Willpower Boost arithmetic right, including refusals? |
| `logger.test.mjs` | Does debug output respect its setting? |

Two examples of what these are really for. `actor-adapter.test.mjs` asserts *"reads Sanity from
`system.sanity`, not `system.san`"* — a field name the old implementation guessed wrong.
`roll-service.test.mjs` asserts *"passes a TokenDocument, never a PIXI placeable"* — because a
placeable is deeply circular, throws on serialisation into the chat message, and loses the roll
silently.

**Tests name the defect, not the method.** A test called `it('reads proficiency, not value')`
tells the next person what went wrong last time.

---

## Tier 2 — Snapshot-contract tests

The load-bearing tier, and the one worth understanding before changing anything.

### How it works

For each undocumented dependency there is **one static extractor**, used by both the snapshot
writer and the drift test — so the two cannot disagree about how to read the dependency:

```
  installed dependency on disk
            │
            ▼
   tools/system-schema.mjs          tools/argon-contract.mjs
     (static text extraction)         (static text extraction)
            │                                 │
      ┌─────┴─────┐                     ┌─────┴─────┐
      ▼           ▼                     ▼           ▼
  sync-system   schema-drift        sync-argon   argon-contract
  -schema.mjs   .test.mjs           -contract    .test.mjs
      │                                 │
      ▼                                 ▼
  tests/fixtures/               tests/fixtures/
  system-schema.json            argon-contract.json
  (committed snapshot)          (committed snapshot)
```

Extraction is **static text parsing, not import.** The system's schema files call
`foundry.data.fields.*` at module scope and cannot be loaded in Node at all.

The snapshot is committed. When a dependency is installed locally, the test re-extracts and
compares; when it is not installed (CI), the test asserts against the snapshot alone. So CI
stays green and deterministic while a developer's machine catches drift the day it appears.

### What each records

**`system-schema.json`** — skill key lists per skill set, resource field shapes, item types and
their fields, which actor types have numeric Sanity, where armour is derived. `schema-drift.test.mjs`
then asserts the specific facts the adapter depends on: *resources are `{min,value,max}`*,
*there is no `skill` or `equipment` item type*, *armour derives onto `system.health.protection`*,
*`agent` and `npc` have numeric Sanity and `unnatural` has only loss formulas*.

**`argon-contract.json`** — the three things that actually bit during the migration: abstract
methods a subclass must implement (they only `console.error`), constructor options and their
defaults, and accessors defined as getter/setter pairs. `argon-contract.test.mjs` then checks
*our* components against it: inheritance depth is exactly one, every abstract method is
implemented, no getter-only override of a paired accessor, `classes` extends the base list
rather than replacing it, icons are image paths not Font Awesome classes.

That last set is the payoff — **Argon's undocumented rules, enforced at `npm test` instead of
at render time in a browser.**

### When a drift test fails

It is a signal, not a chore. Do not regenerate reflexively.

```bash
npm run sync:schema     # or: npm run sync:argon
git diff tests/fixtures/
```

1. **Read the diff.** It is a precise statement of what your dependency changed.
2. **Fix the code first** if a field we read moved or vanished.
3. **Then** commit the regenerated snapshot, in the same commit as the fix.
4. If it is Argon, and this is a *minor* version bump, log it — two minor-version breaks in a
   row is a dependency tripwire and stops further work against Argon until the framework in
   [DESIGN.md §3](DESIGN.md) has been re-run (PROC-6).

Set `DG_SYSTEM_PATH` or `ARGON_PATH` if either dependency is installed somewhere non-standard.

---

## Tier 3 — Build and manifest tests

Packaging correctness, which is invisible to both other tiers.

| Suite | Question |
|---|---|
| `build.test.mjs` | Does `tools/build.mjs` run clean and produce a valid `dist/`? |
| `manifest.test.mjs` | Does `module.json` declare the right id, versions and paths — and do those paths exist? |
| `lang.test.mjs` | Do `en` and `es` define the same keys, with the same placeholders and no empty values — and does every key referenced in code exist, and vice versa? |

`manifest.test.mjs` guards one non-obvious requirement: the module id **must** be
`enhancedcombathud-deltagreen`, because Argon discovers its system module by looking up
`enhancedcombathud-${game.system.id}` and shows a permanent error if it is not active. It also
asserts the id and the settings namespace stay in step.

`lang.test.mjs` enforces UX-3 mechanically in both directions — an orphaned key and a missing
key are both failures.

---

## Tier 4 — Live-world verification

> **Green tests are not evidence** (PROC-1). A feature is done only when it has been confirmed
> in a running world (PROC-5).

`tools/foundry-driver.mjs` logs into a live Foundry with Playwright and reports what actually
rendered, turning a reload-and-screenshot cycle into one command.

```bash
FOUNDRY_USER=Claude npm run fvtt:probe        # list joinable users
FOUNDRY_USER=Claude npm run fvtt:diagnose     # bind the HUD, dump its report — read-only
FOUNDRY_USER=Claude npm run fvtt:smoke        # click through every roll path
HEADED=1 FOUNDRY_USER=Claude npm run fvtt:diagnose   # watch it happen
```

**It needs a dedicated GM account.** Foundry disables a user who is already connected, so the
driver cannot share yours. Create a second GM (e.g. `Claude`) and pass it via `FOUNDRY_USER`.

| Variable | Default |
|---|---|
| `FOUNDRY_URL` | `http://localhost:30000` |
| `FOUNDRY_USER` | first joinable gamemaster |
| `FOUNDRY_PASSWORD` | none |
| `HEADED=1` | headless |

`fvtt:smoke` **rolls in the live world** — chat messages are the evidence a roll worked. It
deliberately skips Willpower Boost, which writes to the actor. Screenshots land in
`tools/.out/`. In-world, `ui.deltaGreenCombatHud.diagnose()` produces the same report, which is
also what to ask a user for in a bug report.

The driver is a development tool: not bundled, not shipped.

---

## Rules for writing tests

The invariants, with the how-to.

**TEST-1 — Fixtures derive from the system's schema.** Hand-written actor shapes are forbidden;
that is what let the old suite pass against a data model the system never had. Use the builders
in `tests/fixtures/dg-actors.mjs` (`makeSkills`, `makeWeapon`, …), which read key lists and
field names out of `system-schema.json`. A fixture that a schema change should invalidate
*must* break.

**TEST-2 — The drift test keeps passing.** Never delete or skip it to get green.

**TEST-3 — No production branch exists only for tests.** No `typeof game !== 'undefined'` in
`scripts/`. Use the injection seams — `new RollService({ loadApi })` is the pattern.

**TEST-4 — A fix lands with a test proven to fail first.** Write it, watch it fail for the right
reason, then fix. A test that never failed has proven nothing.

**TEST-5 — Unreachable code is deleted, not tested.** Coverage of dead code is a liability.

**TEST-6 — The core is testable headless.** No Foundry, no Argon, no DOM. A core module that
needs a global is misusing its injection seam.

---

## What is deliberately not unit-tested

**The presentation layer's rendering.** Argon's failures are render-time and browser-only;
mocking enough of Argon to unit-test a component would test the mock. Instead: the contract
test asserts our components' *structure* statically, and the live driver verifies their
*behaviour* in a real world. Between them the gap is small and known.

**Anything the system owns.** Roll evaluation, crit/fumble logic, chat cards, dialogs. Testing
those would be testing the system, and would encode a second copy of rules we have promised not
to hold (PAR-1, *not a rules engine*).

---

## CI

`.github/workflows/test.yml` runs on push and PR to `main`: Node 20, `npm install`, `npm test`,
then `npm run build` to prove the release path still works. `release.yml` runs `npm test` again
before it will build a release — a failing suite cannot ship.
