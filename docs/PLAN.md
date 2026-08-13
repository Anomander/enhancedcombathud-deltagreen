# PLAN.md — improvement plan

Derived by auditing the code against [REQUIREMENTS.md](REQUIREMENTS.md) and the invariants in
[CLAUDE.md](../CLAUDE.md), and by sequencing the roadmap in [PRODUCT.md](PRODUCT.md). Every
item cites what it satisfies, so nothing here is a preference that snuck in.

Sizes are **S** (an afternoon), **M** (a day or two), **L** (a week of evenings).

---

## Summary

| Phase | What it buys | Size | Status |
|---|---|---|---|
| **0 — Stop being wrong** | Three defects that ship today, one of them squarely in your #1 combat pain. | S | **done** |
| **1 — Make NFR-10 true** | The Argon dependency actually becomes evictable, and stays that way. | M | **done** |
| **2 — Observable outcomes** | One seam that both remaining roadmap items hang off. | S | **done** |
| **3 — Target-aware resolution** | **The product win.** Acceptance claims 1 and 3 become true. | L | **done**, rung B |
| **4 — Sequencer / VFX** | The thing you actually want to build next. | M | needs a dependency decision |
| **B — Release readiness** | Parallel track; the pipeline has never run. | M | needs a repository |

Phases 0→3 are strictly ordered and complete, unit-tested, **and confirmed in a live world**
(Foundry 14.363, Argon 5.0.1, deltagreen 2.0.1) — `npm run fvtt:verify`, nine checks green.
PROC-5 is satisfied for everything in them.

That pass found a bug the 143 green unit tests could not: forwarding the raw right-click event
to `processDGRoll` made it open a modifier dialog (`shiftKey || which === 3`), so every HUD
damage roll stalled on a dialog nobody asked for. Fixed in `asPlainRoll`, with the test that
was missing.

Phase 4 and Track B are both blocked on decisions rather than on code.

---

## What the audit found

Four things not already recorded in the wiki. The first is the most important.

### F-1 — Lethality never rolls from the HUD

`roll-service.mjs` calls the system's item roll positionally:

```js
return item.roll(critical);          // ours
async roll({ critical = false, lethal = false })   // the system's signature
```

Passing a boolean where an options object is expected means **both flags are silently
discarded**. Every right-click rolls ordinary damage dice. A shotgun, a heavy weapon, anything
with `isLethal` — never rolls Lethality from the HUD. Critical damage never doubles.

The docstring makes a claim the system does not honour: *"Delegates to the item document, which
picks DGDamageRoll or DGLethalityRoll based on `system.isLethal`."* It does not. It picks based
on the `lethal` argument it was passed.

**And the correct behaviour already exists, twice.**

*On the character sheet* — the parity reference (PAR-1) — a weapon row carries four roll
controls: `rolltype="weapon"` (attack), `damage`, `lethality`, and a combined
**`damage-or-lethality`** which opens a system dialog asking which to roll
(`roll-sheet-mixin.js` → `showDamageOrLethalityChoiceDialog`, exported from `roll-dialogs.js`,
a path `module/MODULES.md` designates public).

*On the chat card* — after a **successful** attack, `percentile-roll.hbs` renders
`.dg-result-actions` with a *Roll Damage* button when the weapon has damage and a *Roll
Lethality* button when it has lethality, and the player picks.

That is exactly the interaction you asked for: *"use the system dialog for choosing between a
flat damage or a lethality roll."* Already built, already localised, already contextual to the
weapon. The HUD's right-click bypasses both with a broken call. Violates **PAR-3** (surface the
system's choice, don't decide) and **SYS-1** (verified, cited paths).

### F-2 — A committed self-referential symlink

`delta-green-combat-hud -> /Users/anomander/dev/delta-green-combat-hud` is staged in git as
mode `120000`. It is an absolute path to the repo from inside the repo. On any other machine it
dangles; in any recursive tree walk it loops. `tools/build.mjs` only walks `scripts/`, so the
build survives — today.

### F-3 — Willpower Boost is lost on reload

Already recorded in [ARCHITECTURE.md](ARCHITECTURE.md), restated here because it is a
user-facing correctness bug, not just debt: the WP deduction is persisted via `actor.update()`,
the armed bonus is held in an in-memory `Map`. Reload between spending and rolling and the
player has paid and lost the bonus, silently. Violates **AUTO-3** in spirit — a state change
the user cannot see or audit.

### F-4 — The system fires no roll hook

There is no `Hooks.call` anywhere in the Delta Green roll pipeline. Nothing to subscribe to.

This is good news, and it decides Phase 2's design: the observable-outcome seam must live in
**our** `roll-service.mjs`, which already receives every evaluated roll and returns it. No chat
scraping, no `renderChatMessageHTML` parsing, no coupling to the system's DOM.

**Clean audit results,** for the record: no `innerHTML` anywhere in `scripts/` (ARCH-3); no
`game.settings` reads outside `settings.mjs` except `diagnostics.mjs` reading *Argon's* settings,
which is its job (UX-2); the portrait panel's data paths are all real schema fields, honestly
absent where a type lacks them, and honour `keepSanityPrivate` (SYS-5, UX-5).

---

## Phase 0 — Stop being wrong

Everything here is the module currently asserting something untrue. Cheapest work, highest
value per hour.

| | Task | Trace | Size |
|---|---|---|---|
| **0.1** | Rebuild right-click on the sheet's `damage-or-lethality` control — see below. | F-1, PAR-1, PAR-3, SYS-1 | S |
| **0.2** | Delete the `delta-green-combat-hud` symlink and `git rm --cached` it. | F-2 | S |
| **0.3** | Deduct Willpower **after** the roll, not before — see below. | F-3, AUTO-3 | S |
| **0.4** | Rewrite `CHANGELOG.md` and `release_notes.txt` to describe the module that exists. | [RELEASE.md](RELEASE.md) | S |

### 0.1 — right-click mirrors the sheet

**Decided:** keep right-click, and make it do what the sheet's combined control does.

```js
// mirror rolltype="damage-or-lethality" from the weapon row
const choice = await showDamageOrLethalityChoiceDialog({ itemName: item.name });
if (!choice) return;                       // player closed the dialog — roll nothing
const roll = createDGRollFromDataset({ rolltype: choice }, { actor, item, token });
await processDGRoll(event, roll);          // shift-click still opens the modifier dialog
```

This is strictly better than deleting the shortcut, because it is *the sheet's own path*:
`createDGRollFromDataset` + `processDGRoll` are the same two calls `roll-sheet-mixin.js` makes,
so PAR-1 holds by construction rather than by discipline. It also keeps a capability the chat
card cannot provide — the card's buttons only render on a **successful** attack, so there is
otherwise no way to roll damage standalone when the Handler rules a hit some other way.

Do **not** branch on `item.system.isLethal` to pick for the player. A weapon can carry both a
damage formula and a Lethality rating; the dialog exists precisely because that choice is the
player's (PAR-3).

### 0.3 — deduct after the roll

**Decided:** arm the boost without writing; deduct once the dice have actually been rolled.

This dissolves the persistence question rather than answering it — a reload now loses an armed
boost that cost nothing, which is a recoverable annoyance rather than silent theft. No actor
flag needed.

It also fixes a second, more common failure the reload bug was hiding. Today `#consumeBoost()`
runs **before** `processDGRoll`, and `processDGRoll` returns early — without rolling — when the
roll is blocked or when the player cancels the modifier dialog. So shift-clicking and pressing
Cancel currently costs the WP *and* discards the boost. Cancelling a dialog happens far more
often than reloading mid-roll.

**The one thing this needs care with:** `processDGRoll` returns `undefined` whether it rolled or
bailed, so the commit must detect evaluation on the roll object itself (`roll._evaluated`, or
`roll.total` being numeric). Verify which against Foundry v14's `Roll` in a live world before
relying on it (PROC-1). If it did not evaluate: deduct nothing, and leave the boost armed.

Re-check affordability at the moment the bonus is applied, not only at arm time — WP can change
between arming and rolling.

**Consequent UX work:** with no immediate deduction, the button must show an armed state, and
clicking it again must disarm. Today there is no way to cancel an armed boost at all (UX-1).

**Done when:** a lethal weapon can roll Lethality from the HUD via the system's own dialog,
confirmed in a live world (PROC-1); `git ls-files` shows no symlink; no sequence of cancel,
block or reload can separate a paid cost from its bonus; shipped release notes describe shipped
features.

---

## Phase 1 — Make NFR-10 true

The Argon dependency was accepted on one condition: it stays evictable
([DESIGN.md §4](DESIGN.md)). That condition is currently not met, and every phase after this
one adds code that would otherwise inherit the problem.

| | Task | Trace | Size |
|---|---|---|---|
| **1.1** | Define a host interface: `{ actor, token, isVisible, toggle, refresh }`. Core-owned, HUD-agnostic. | ARCH-6 | S |
| **1.2** | Move `api.mjs` onto it. It stops importing anything Argon-shaped. | ARCH-6, NFR-10 | M |
| **1.3** | `scripts/argon/register.mjs` registers the Argon implementation of the host at `argonInit`. | ARCH-6 | S |
| **1.4** | Add the ARCH-6 grep as a test, so this cannot regress silently. | TEST-2 | S |

1.4 is the part that matters in a year. The invariant already exists in prose and was violated
anyway; an invariant a machine does not check is a preference.

**Done when:** `grep -rln "ui\.ARGON\|CONFIG\.ARGON" scripts/ | grep -v "^scripts/argon/"`
returns only `diagnostics.mjs`, asserted by a test; and deleting `scripts/argon/` leaves a
suite that passes.

---

## Phase 2 — Observable outcomes

Small, and both remaining roadmap items depend on it. Building it now means Phase 3 is a
*consumer* of a general seam rather than a special case that Phase 4 then has to be retrofitted
into.

| | Task | Trace | Size |
|---|---|---|---|
| **2.1** | `roll-service` emits a typed outcome after every roll: actor, token, item, roll type, success, critical, total, target. Read off the returned roll object; compute nothing. | FR-25, OOS-1 | S |
| **2.2** | Unit-test it headless — outcomes are plain data, no Foundry needed. | TEST-6 | S |

Per F-4, this is ours to build because the system offers nothing to subscribe to. Emit *after*
`processDGRoll` resolves, so the system's dialog, evaluation and chat card have all completed
and parity is untouched (PAR-1).

**Done when:** an outcome is observable for every roll type, with no consumer yet, and a test
proves the payload matches the roll the system evaluated.

---

## Phase 3 — Target-aware attack resolution

The product win. Your #3 pain, and the gate on acceptance claims 1 (*three clicks to damage on
the target*) and 3 (*no human arithmetic*).

| | Task | Trace | Size |
|---|---|---|---|
| **3.1** | **Resolution core** — a pure function: outcome + weapon + target armour → proposed changes. No I/O, no Foundry, fully headless-testable. | FR-19, TEST-6 | M |
| **3.2** | Read the Foundry target and its armour via `actor-adapter`. Armour comes from the system's derived `system.health.protection`; armour piercing from `weapon.system.armorPiercing`. Read, never recompute. | SYS-1, OOS-1 | S |
| **3.3** | Lethality resolution reads `DGLethalityRoll`'s own result — lethal when `total <= target`, otherwise its `nonLethalDamage` tens+ones. **Never reimplement this.** | OOS-1, SYS-3 | S |
| **3.4** | The **Propose / Auto-apply** setting. One code path; the mode decides only where it commits. | FR-20, AUTO-1 | M |
| **3.5** | Permission routing — a player applying damage to a target they do not own. Route or refuse; never fail silently. | FR-23, AUTO-4 | M |
| **3.6** | Chat legibility: what changed, on whom, why. | FR-22, AUTO-3 | S |
| **3.7** | Decline out loud when there is no target, or no armour value to read. | FR-24, AUTO-5 | S |

**3.5 — the permission ladder.** Applying damage means writing to an actor the acting player
usually does not own. Four rungs, cheapest first:

| | Approach | Dependency | Enables |
|---|---|---|---|
| **a** | Compute and state the result; write nothing. Handler applies by hand. | none | Propose, no arithmetic |
| **b** | Post a chat card with an **Apply** button. The write runs in *whoever clicks*, so a Handler click carries GM permissions. | none | Propose, fully |
| **c** | Relay to a GM client over Foundry's native socket, with your own GM election and payload validation. | none | Auto-apply for players |
| **d** | Same, via `socketlib`. | **+1 hard dependency** | Auto-apply for players |

**Build (b).** It is the canonical Foundry damage-application pattern, needs nothing new, and
*fully* implements Propose — which is the default mode (AUTO-1). Note also that when the
**Handler** drives the HUD, Auto-apply already works with no relay at all, because a GM owns
everything.

That leaves the relay needed only for the intersection of *Auto-apply enabled* **and** *a
player acting* — the narrowest case there is. Adopting a dependency for it up front is exactly
the speculative adoption [DESIGN.md §3](DESIGN.md) exists to prevent.

**Consider instead: Auto-apply is Handler-only by design.** When a player acts with Auto-apply
on, it degrades to Propose and says so. That is AUTO-4-compliant, needs no socket ever, and is
arguably the correct semantics — a player's click should not silently mutate an NPC the Handler
owns. Delta Green is a Handler-authority game; the software can say so.

If (c) or (d) is ever built, the GM side **validates** the request rather than executing it —
a relay that trusts its payload is a client-authoritative write with extra steps.

**Sequencing note:** 3.1–3.3 are pure and testable with no UI. Build and test them before any
of 3.4–3.7 exists. That is where this phase's risk lives, and it is the part that never needs a
browser.

**Done when:** an attack on a target produces correct damage after armour, in both modes, with
Lethality handled by the system's own roll; and you can state claims 1 and 3 truthfully.

---

## Phase 4 — Sequencer and visual effects

A consumer of Phase 2. Should require no changes to the roll path at all — if it does, Phase 2
was built wrong.

| | Task | Trace | Size |
|---|---|---|---|
| **4.1** | Score Sequencer (and JB2A if used) against [DESIGN.md §3](DESIGN.md) before adopting. | PROC-6 | S |
| **4.2** | An effects layer subscribing to outcome events. Zero coupling to Argon or to the roll path. | FR-25 | M |
| **4.3** | Absent Sequencer, the module behaves exactly as it does today. A **soft** dependency, unlike Argon. | UX-1 | S |

4.3 is the design constraint worth stating up front: this must never become a second `requires`
in the manifest.

---

## Track B — Release readiness

Parallel. Nothing after Phase 0 blocks on it, and it blocks nothing.

| | Task | Size |
|---|---|---|
| **B.1** | Create the GitHub repository; add `origin`. | S |
| **B.2** | Reconcile `module.json` `url` / `manifest` / `download` with where it actually lives. Do **not** rename the module id — Argon discovers it by convention (ENV-4). | S |
| **B.3** | Dry-run the pipeline on a throwaway tag; confirm all twelve steps; delete tag and release. | M |
| **B.4** | Optionally add `FOUNDRY_API_TOKEN` to publish to the Foundry registry. | S |

Recommended: run B.3 after Phase 1, as a `0.9.0`. Proving the pipeline on something you are not
announcing is much cheaper than discovering step 9 fails during a real release.

---

## Not doing, and why

A plan that only adds is not a plan. These look like improvements and are declined by the
documents:

| Declined | Why |
|---|---|
| Ammunition tracking | `weapon.system.ammo` is a `StringField`. Shadowing it in module flags trades the correctness guarantee for a feature. Raise a schema change upstream or do nothing (**SYS-6**). |
| A one-click modifier ladder in the HUD | You chose the system's dialog. Rebuilding the ladder is a second rules surface and a second place to be wrong (**PAR-3**). |
| Sanity-flow automation | Consciously deferred until the three named pains are solved. Not rejected. |
| Initiative / turn-order management | Not a pain at your table. Do not invest. |
| More settings | Each is a branch, a test axis and two translation entries. Needs a genuine system ambiguity, not a preference (**OOS-4**). |
| A second HUD skin | Argon is contained, not replaced. Revisit only when a tripwire fires ([DESIGN.md §3](DESIGN.md)). |

---

## Decisions

**Settled and implemented**

- **Right-click (0.1)** — kept, rebuilt on the sheet's `damage-or-lethality` control.
- **Willpower Boost (0.3)** — deducted after the roll. No persistence needed.
- **Cross-user writes (3.5)** — rung **B**. A chat card with an *Apply* button; the write runs
  as whoever clicks. No socket, no new dependency.

**Still open**

- **Auto-apply for players** — today Auto-apply degrades to Propose when the acting user
  cannot write to the target, which is AUTO-4-compliant and needs no relay. Whether that
  should instead be *Handler-only by design* (stated in the setting rather than discovered at
  the moment of use) is worth deciding after a session of play, not before.
- **Should there be an "off"?** AUTO-1 permits exactly two modes, so a table that wants no
  automation uses Propose and ignores the card. That is a real UX imposition — a chat card
  after every targeted damage roll, forever — and if it grates, the honest response is to
  revisit AUTO-1 deliberately rather than to quietly add a third mode.

Everything else follows from the documents without further input.
