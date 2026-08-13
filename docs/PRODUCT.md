# PRODUCT.md — what we are building

The definition of the product. When a decision cannot be settled by
[DESIGN.md](DESIGN.md) or the invariants in [CLAUDE.md](../CLAUDE.md), it is settled here.

---

## One sentence

A combat surface for Delta Green in Foundry VTT that puts everything an Agent needs during a
firefight one click away, and applies the results — **without changing how Delta Green's dice
work.**

---

## Who it is for

| | |
|---|---|
| **Primary** | A player running one Agent through a fight. |
| **Secondary** | The Handler, running NPCs and unnatural things from the same surface. Needs fast actor switching and must work for a one-off NPC dragged onto the canvas mid-scene. |
| **Not a user** | Anyone outside combat. Prep, chargen and campaign management are other tools' jobs. |

Built for one table first. Published if it earns it — which means community release is a
quality bar, not a design constraint. We do not add configuration for hypothetical tables.

---

## The problem

Delta Green combat is fast and lethal in the fiction and slow at the table in practice. Three
things cost time, in order:

**1. Finding the right roll.** An Agent sheet carries ~40 skills plus typed skills, Special
Training and six statistics. In a firefight you need three of them. The cost is scrolling and
scanning a sheet while the clock is on you.

**2. Tracking HP / WP / SAN.** Three resources, one of which may be hidden from its own
player, plus a Breaking Point threshold whose meaning changes the moment it is crossed. The
cost is players losing the plot on their own condition.

**3. Resolving damage and Lethality.** Delta Green has two damage models — ordinary damage
dice, and a Lethality percentage that kills outright or falls back to the tens+ones of the
same d100 — plus armour and armour piercing. The cost is per-attack arithmetic and then a
hunt for whose sheet to edit.

**Not a problem at this table:** turn order. Initiative is DEX-ordered and the Handler tracks
it fine. We do not invest here.

---

## What "easier" means

Success is falsifiable. These are the claims the product must be able to make:

1. **Three clicks or fewer** from *"I want to shoot him"* to *damage recorded on the target*.
2. **Zero sheet-opening** by a player during a combat round.
3. **No arithmetic performed by a human** to resolve an attack.
4. **No new rules to learn.** A player who knows the character sheet already knows the HUD.

Claim 4 is the load-bearing one, and it constrains the other three. Speed bought by inventing
a new rolling UX is not a win — it is a second system to learn and a second place for the
rules to be wrong.

---

## The core promise

> **The HUD is an accelerator, not an alternative.**

Rolling from the HUD is *identical* to rolling from the character sheet: the same modifier
dialog, the same modifiers, the same success/critical/fumble evaluation, the same chat card,
the same Dice So Nice animation. The HUD changes **how fast you reach the roll** and **what
happens after it lands**. It never changes the roll.

This is not modesty; it is the cheapest correctness guarantee available. Delta Green's rules
live in exactly one place, are maintained by the people who wrote them, and are already right.

**Corollary — the answer to most design questions.** Any question of the form *"what should
the HUD do about rule X?"* has the answer *"whatever the character sheet does."* If the sheet
opens a dialog to choose between flat damage and a Lethality roll, so does the HUD. If the
sheet blocks a roll, so does the HUD.

**The one deviation, deliberately chosen:** the HUD may *refuse* to roll — it gates a player's
weapon attack to their own turn, which the sheet does not. Refusal is a permission decision,
not a dice decision. When the HUD does roll, parity is absolute. See PAR-4 in
[CLAUDE.md](../CLAUDE.md).

---

## Anti-goals

Four things this product does not become. Each is written as a test, so it can settle an
argument rather than start one.

### Not a rules engine
If a number can be read from the system, reading it is the **only** acceptable
implementation. Recomputing it is a defect *even when the result is correct*, because it
creates a second source of truth that drifts on the next system release.

> **Test:** does this code contain a formula from the Agent's Handbook? If yes, the system
> already has it. Find it.

### Not a character sheet
Read and act; never author. No editing Agents, no inventory management, no chargen.

> **Test:** does this write to an actor for a reason other than the consequence of an action
> just taken? If yes, it belongs on the sheet. The narrow exception is a resource the rules
> define as *part of* taking an action — spending WP for a Willpower Boost is such a spend.

### Not a Handler campaign tool
Combat only. No NPC management, encounter building, loot, prep or session tooling.

> **Test:** is this useful when no combat is running? If yes, it is a different module.

### Not a house-rule framework
The settings surface does not grow to absorb arbitrary table variants. Every setting is a
maintenance liability, a branch in the code and a line in two translation files.

> **Test:** does this setting resolve something the *system* leaves genuinely ambiguous, or
> does it encode a preference? Preferences are declined. Willpower Boost is grandfathered as
> the exception, not the precedent.

---

## Automation posture

The module computes attack outcomes and writes them to the game. How far it goes is **one
setting with two modes**:

| Mode | Behaviour |
|---|---|
| **Propose** (default) | Computes the full result and offers it. A human click commits every state change. |
| **Auto-apply** | The same computation commits itself. |

Both modes run **the same code path**; the mode decides only where it commits. There is never
a third mode, and never a per-feature toggle — that road ends in a settings page nobody
understands and a combinatorial test surface.

Two rules bound what automation may touch:

- **Automation acts on outcomes, never on decisions.** It may apply the result of a roll that
  happened. It may never choose what to roll, what to target, or whether a hit occurred.
- **Automation that cannot proceed says so.** No target selected, no armour value, a
  permission it lacks — it declines, out loud, and changes nothing. It never assumes a
  default.

---

## Roadmap

What the architecture must leave room for. Horizons, not dates.

**Now — reach.** Attacks, skills, Sanity tests, vitals at a glance, reference drawer. Solving
problem 1 and problem 2.

**Next — target-aware attack resolution.** Read the Foundry target, resolve Lethality versus
damage through the system, subtract armour, apply armour piercing, write HP. Solving problem
3. This is the first feature that writes to a document the acting player may not own, so it is
also where the permission story gets built.

**Later — Sequencer and visual effects.** Muzzle flashes, impacts, and outcome-driven effects
keyed off roll results. Requires that roll outcomes are observable events rather than side
effects buried in a click handler — an architectural requirement *today*, not later.

**Deliberately deferred.** Sanity-flow automation (prompting SAN checks, applying loss,
Bond-spending), wound and status effects, initiative management. Not rejected — simply not
worth building before the three named pains are solved.

---

## Known blockers, named honestly

**Ammunition tracking is blocked at the system layer.** `weapon.system.ammo` is a
`StringField` — free text, not `{ value, max }`
(`systems/deltagreen/module/data/item/weapon.js`). No reliable decrement can be built on it.

Per the *not a rules engine* anti-goal, the response is **not** to shadow ammo counts in
module flags. It is to raise a schema change upstream, or to do nothing. Doing nothing is an
acceptable outcome.

This is the template for every future gap: a system limitation is a system problem. Working
around it in the module buys a feature and sells the correctness guarantee that makes the
whole product cheap.
