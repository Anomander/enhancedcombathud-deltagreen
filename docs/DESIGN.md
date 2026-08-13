# DESIGN.md — how we decide

[PRODUCT.md](PRODUCT.md) says what we are building. This says how to make the calls that
building it requires — where code goes, what we are allowed to depend on, and how the thing
should behave. The invariants in [CLAUDE.md](../CLAUDE.md) are the enforceable residue of
this document.

---

## 1. The layer model

Four layers. **Dependencies point down. Never up, never sideways.**

```
  ┌──────────────────────────────────────────────────────────┐
  │  PRESENTATION            scripts/argon/*.mjs             │
  │  Knows Argon. Knows no Delta Green rules.                │
  │  Draws things, binds clicks, forwards to the core.       │
  └──────────────────────────────────────────────────────────┘
                              │ calls
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │  CORE                    scripts/*.mjs                   │
  │  Knows Delta Green and Foundry. Knows no HUD at all.     │
  │    actor-adapter   reads actor data — the only reader    │
  │    roll-service    issues dice — the only path           │
  │    automation      applies outcomes                      │
  │    roll-handler    pure math, no I/O                     │
  └──────────────────────────────────────────────────────────┘
                              │ two doors only
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │  SYSTEM                  deltagreen                      │
  │    module/roll/roll.js          dice                     │
  │    module/data/**               shapes                   │
  └──────────────────────────────────────────────────────────┘
                              ▼
  ┌──────────────────────────────────────────────────────────┐
  │  FOUNDRY                                                 │
  └──────────────────────────────────────────────────────────┘
```

### The one test that matters

> **Could you delete `scripts/argon/` and still have a module that loads, runs its full test
> suite, and exposes every capability through its API?**

If the answer is ever no, the seam has leaked and the leak is the bug. This test is the entire
reason the module can afford to depend on Argon at all — see §3.

Its cheap mechanical proxy must return **only** `diagnostics.mjs`:

```bash
grep -rln "ui\.ARGON\|CONFIG\.ARGON" scripts/ | grep -v "^scripts/argon/"
```

Two files are exempt by role. The **composition root** exists to wire a presentation layer in.
**Diagnostics** exists to describe the environment, and a report that could not name Argon
would be useless.

> **Status: failing.** `api.mjs` resolves its actor and token from `ui.ARGON._actor` /
> `._token`, so every roll method in the public API is Argon-coupled at the root. The fix is a
> host seam — presentation registers `{ actor, token, isVisible, toggle, refresh }` with the
> core; `api.mjs` depends on that interface. Recorded in [CLAUDE.md](../CLAUDE.md) under
> *Known deviation*. This matters beyond tidiness: §4 accepted the Argon dependency on a
> substitution cost that this violation understates.

### Where does this code go?

| If it… | It lives in |
|---|---|
| reads a value off an actor or item | `actor-adapter.mjs` — nowhere else reads system data |
| rolls dice, of any kind | `roll-service.mjs` — nowhere else touches the dice |
| computes something with no I/O | `roll-handler.mjs` or a sibling pure module |
| writes an outcome to a document | the automation layer, under the Propose/Auto-apply setting |
| decides what a button looks like | `scripts/argon/` |
| decides *whether a button exists* | `scripts/argon/`, asking the core for the data |
| needs `game`, `ui` or `canvas` at import time | nowhere — inject it (TEST-3) |

**The rule of thumb:** presentation asks questions and reports clicks. It never answers a
question about Delta Green.

---

## 2. Design guidelines

Eight principles, in priority order. Where two conflict, the earlier wins.

### 2.1 Parity over cleverness
The system adjudicates; the HUD accelerates. Surface the system's own dialogs — including for
choices like flat damage versus a Lethality roll — rather than deciding on the player's
behalf. A HUD that is *faster but subtly different* is worse than no HUD, because it
introduces a rules disagreement in the middle of a fight.

### 2.2 Discovery, not configuration
The named pain is *finding* the right roll, not *configuring* it. Effort goes into putting
the right three things in front of the player at the right moment. It does not go into
options that let each table arrange their own.

### 2.3 Honest absence
Missing data renders as absent. Never as zero, never as a dash that looks like a value, never
as a plausible default. An Unnatural has no Sanity score; it shows no Sanity row. A confident
wrong number is the worst thing this module can produce, because it will be believed.

### 2.4 State, never guess
The HUD displays what it read. Where it derives something, the derivation is visible and
traceable to a system value. This is what makes the *not a rules engine* anti-goal
enforceable in the UI and not just in the code.

### 2.5 Progressive disclosure
Three things belong in the fight: the weapon, the vitals, the roll you are about to make.
Everything else — the full skill list, Bonds, Motivations, statistics — is one layer deep and
stays there. Real estate on screen during combat is the scarcest resource the product has.

### 2.6 Speak Delta Green
Agent, Handler, Bond, Breaking Point, Willpower, Lethality, Unnatural. Never bonus action,
never cantrip, never hit dice. The HUD sits inside a framework built for a different game;
none of that vocabulary is allowed to leak through to the player. This is a tone requirement
as much as a correctness one — Delta Green is played in a register that "Bonus Action"
destroys.

### 2.7 Respect what is hidden
Sanity may be private from its own player, by the system's own setting. Anywhere Sanity could
surface — panel, tooltip, chat card, diagnostic dump, log line — it honours that. Secrecy is a
feature of the game, and leaking it through a convenience surface is a real harm to a table.

### 2.8 Automation shows its work
Every automatic change to game state names what changed, on whom, and why. In Propose mode
that is the offer itself; in Auto-apply mode it is a chat line after the fact. An automation
nobody can audit will be turned off the first time it is wrong, and it will be wrong.

---

## 3. The dependency framework

**The question this framework exists to answer:** *should this module depend on X?* It was
built to settle the Argon question and is meant to be re-run whenever a dependency is
proposed or a tripwire fires.

### Score the dependency

| Criterion | Ask |
|---|---|
| **Contract stability** | Is there a documented, versioned public API? Or are we reverse-engineering internals and private methods? |
| **Shape fit** | Does its domain model match ours, or are we translating between two different games' assumptions on every call? |
| **Value delivered** | What do we genuinely not have to build and maintain? |
| **Maintenance transfer** | Does it absorb churn we would otherwise eat ourselves — Foundry version bumps, browser changes? |
| **Blast radius** | How many layers does it touch? |
| **Substitution cost** | If it vanished tomorrow, how much do we rewrite? |

### The decision rule

> **A dependency with a poor contract may be adopted only if its blast radius is exactly one
> layer and its substitution cost is bounded and known.**

The corollary is what makes it work in practice: *a bad contract is survivable; a bad contract
that has spread through the codebase is not.* You do not manage this risk by choosing better
dependencies — the Foundry ecosystem does not offer many. You manage it by containment.

### Tripwires

Adopting a dependency with a poor contract means agreeing to watch it. Any of these fires →
stop, re-run the framework above, and do not write more code against it until that is done
(PROC-6):

- Upstream misses a Foundry major release by more than one cycle.
- The contract snapshot test (`npm run sync:argon`) breaks on a *minor* version bump twice
  running.
- A roadmap feature cannot be expressed within the eight `define*` statics without patching
  or monkey-patching upstream internals.
- We are overriding a private (`_`-prefixed) upstream method in more than three places.
- Upstream's licence, distribution or maintenance model changes.

---

## 4. Worked example — the Argon decision

Applying §3 to *Argon — Combat HUD (CORE)* at version 5.0.1, against the deltagreen system
2.0.1 on Foundry v14.

### Score

| Criterion | Finding | |
|---|---|---|
| **Contract stability** | No documented API. Components reach `ui.ARGON._actor`, override `_renderInner`, and depend on template paths resolved from **constructor names** at runtime (`component.js`), which is why `--keep-names` is load-bearing in the build. | ✗ Poor |
| **Shape fit** | Built for a D&D-shaped action economy. `colorScheme` enumerates bonus action / free action / reaction; `ActionPanel.maxActions` renders action pips; `WeaponSets` assumes primary/secondary sets; `MovementHud` assumes base/dash/danger bands. Delta Green has none of these. `movement-hud.mjs` exists *solely* to suppress a `NaN` render — Argon defaults `MOVEMENT` to a base class with an unimplemented getter, so opting out requires registering a permanently hidden subclass. | ✗ Poor |
| **Value delivered** | Positioning, theming, animation, tooltips, drawer, target picker, per-actor state, token binding, scene-control and token-HUD toggles, keybindings, a theme editor, and automatic re-render wiring across eight Foundry hooks with debouncing and batching. Several hundred lines of chrome, already debugged. | ✓ Large |
| **Maintenance transfer** | Absorbs Foundry version churn in the layer that churns most. Real, ongoing. | ✓ Yes |
| **Blast radius** | One layer — `scripts/argon/` — and only because we enforce it. | ✓ One |
| **Substitution cost** | Bounded: the presentation layer, roughly 650 lines. The core, the tests and every roll path survive untouched — *once the `api.mjs` leak in §1 is closed.* Today it is bounded plus one unbudgeted rewrite of the public API. | ✓ Bounded |

### Outcome

**Adopt, contained.** Two poor scores are outweighed by the value, *specifically and only
because* blast radius is one and substitution cost is bounded. Had Argon needed to be reached
from the roll path or the adapter, the same scores would have made it a rejection.

This is why §1's deletion test is not stylistic hygiene. It is the term on which the
dependency was accepted.

### Discovered constraints, promoted to invariants

Three facts about Argon were learned the expensive way and now live as invariants rather than
code comments, so they cost their discovery price only once:

- Every component must sit **exactly one level** below an Argon base class. Argon resolves a
  component's template from `Object.getPrototypeOf(this.constructor).name` into its *own*
  partials directory, so a two-deep subclass looks for a template that does not exist. → ARCH-7
- `ItemButton` defaults `inActionPanel` to `isWeaponSet`, leaving buttons styled for the
  accordion list and collapsed to zero width inside an action panel.
- `MovementHud.movementUsed` is a getter/setter pair; overriding only the getter shadows the
  setter and throws at render.

### The parity exception, recorded

Turn gating blocks a player's weapon attack outside their turn. The character sheet does not.
This is a knowing, bounded exception to §2.1, taken because turn discipline is worth it at
this table, and narrowed to the smallest form that preserves the guarantee:

> **The HUD may decline to roll. It may never alter a roll it does make.**

Refusal is a permission decision, not a dice decision — so parity survives intact for every
roll that actually happens. The Handler is never gated, and every refusal explains itself
(UX-6). Formalised as PAR-4.

---

## 5. Re-deciding

This document is meant to be re-run, not revered. Re-open the Argon decision when a tripwire
in §3 fires, or when a roadmap horizon in [PRODUCT.md](PRODUCT.md) proves inexpressible
within the eight `define*` statics.

If that day comes, the work is: write a presentation layer, delete `scripts/argon/`, and
change nothing else. That the answer is that short is the whole point of everything above it.
