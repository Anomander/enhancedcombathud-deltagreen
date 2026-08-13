# Delta Green Enhanced Combat HUD — project wiki

A combat surface for Delta Green in Foundry VTT that puts everything an Agent needs during a
firefight one click away, and applies the results — **without changing how Delta Green's dice
work.**

This wiki is the reasoning behind the code. It is versioned with the code, and it is expected
to be wrong the moment it stops being updated alongside it (PROC-3).

---

## Start here

**New to the project?** [PRODUCT.md](PRODUCT.md) → [ARCHITECTURE.md](ARCHITECTURE.md) →
[TESTING.md](TESTING.md). About forty minutes, and you will know why the code looks the way it
does.

**Making a design decision?** [DESIGN.md](DESIGN.md). It carries the layer model, the design
guidelines and the dependency framework — including the worked example that settled whether to
depend on Argon at all.

**Adding a feature?** [REQUIREMENTS.md](REQUIREMENTS.md) to see whether it is already scoped or
deliberately excluded, then [ARCHITECTURE.md § Adding a component](ARCHITECTURE.md).

**Shipping?** [RELEASE.md](RELEASE.md).

**Writing code right now?** [CLAUDE.md](../CLAUDE.md) — commands and the invariant list, which
is the enforceable residue of everything here.

---

## Pages

| Page | What it settles |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Who it is for, what "easier combat" means as a falsifiable claim, and the four things this must never become. |
| [DESIGN.md](DESIGN.md) | The layer model, eight design guidelines, and the reusable framework for deciding what to depend on. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Module inventory, lifecycle, data flow, the four seams, Argon's sharp edges, and known debt. |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Numbered, traceable requirements with status. What is shipped, on the roadmap, and consciously deferred. |
| [TESTING.md](TESTING.md) | The four testing tiers, the snapshot-contract pattern, and what to do when a drift test fails. |
| [RELEASE.md](RELEASE.md) | Versioning, the twelve-step pipeline, and the checklist around it. |
| [PLAN.md](PLAN.md) | The current improvement plan — phased, traced to requirements, with what we are deliberately not doing. |
| [CLAUDE.md](../CLAUDE.md) | Commands, seams, and the invariants — cited by ID in code comments and review. |

---

## The three ideas everything else follows from

**1. The HUD is an accelerator, not an alternative.** Rolling from the HUD is *identical* to
rolling from the character sheet — same dialogs, same modifiers, same chat cards. The HUD
changes how fast you reach the roll and what happens after it lands. It never changes the roll.
This is the cheapest correctness guarantee available: Delta Green's rules live in one place,
maintained by the people who wrote them.

**2. The HUD framework is a replaceable detail.** Everything that knows about Delta Green is
isolated from everything that knows about Argon. That containment is the term on which an
undocumented third-party dependency was accepted, and it is checked by one test: *delete
`scripts/argon/` and the module still loads and passes.*

**3. Green tests are not evidence.** Both dependencies fail at render time in a browser. A
feature is done when it is reachable, localised, tested, and confirmed in a running world.

---

## Conventions

**Invariants** are cited by ID — `ARCH-6`, `PAR-1`, `SYS-3` — in code comments, commit
messages and review. The full list is in [CLAUDE.md](../CLAUDE.md); the rationale is in
[DESIGN.md](DESIGN.md). Families: **ARCH** architecture, **PAR** parity, **SYS** system
integration, **AUTO** automation authority, **UX**, **TEST**, **PROC** process.

**Known debt is written down, not implied.** Where a page states a rule the code does not yet
satisfy, it says so and names the fix. Two are open right now: the `api.mjs` Argon coupling and
the volatile Willpower Boost, both in
[ARCHITECTURE.md § Known debt](ARCHITECTURE.md).

**Anything unproven says so.** The release pipeline has never run; [RELEASE.md](RELEASE.md)
opens by saying that rather than reading as though it has.

---

## Publishing

These are plain Markdown with relative links, so `docs/` can be pushed to a GitHub Wiki or
served by GitHub Pages unchanged. Keeping it in-repo is deliberate: a wiki that can drift from
the code it describes will.
