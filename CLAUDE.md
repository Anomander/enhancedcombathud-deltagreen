# CLAUDE.md — Delta Green Enhanced Combat HUD

Foundry VTT module (`id: delta-green-combat-hud`) implementing an Argon-style Enhanced Combat HUD tailored for the Delta Green system.

---

## Commands

| Command | What it does |
|---|---|
| `npm test` | Full vitest unit test suite. |
| `npm run build` | Release artifact only — writes `dist/`. Not part of the dev loop. |
| `npm run test:watch` | Vitest watch mode. |
| `npm run test:coverage` | Vitest coverage report. |

There is **no build step for development, no TypeScript, and no linter.** `scripts/*.mjs` is loaded by Foundry as native ESM directly from the tree — edit, reload, done.

`npm run build` exists only to produce the **release** artifact (`dist/`):
- Uses `esbuild` with `--keep-names` (**mandatory** so class constructor comparisons work).
- Bundles scripts into `dist/scripts/delta-green-combat-hud.mjs`.
- Minifies stylesheet into `dist/styles/delta-green-combat-hud.css`.
- Precompiles/validates Handlebars templates into `dist/templates/`.
- Verifies that all paths declared in `module.json` are present in `dist/`.

---

## Core Principles

1. **Purity Boundary**: Modules like `actor-adapter.mjs`, `roll-handler.mjs`, and `target-manager.mjs` maintain pure data/math logic free of browser DOM global dependencies so they can be unit-tested directly in Node/Vitest.
2. **Language Parity**: Both `lang/en.json` and `lang/es.json` must maintain 100% key parity in both directions.
3. **Release Integrity**: Releases are triggered by pushing `release-*` tags. GitHub Actions updates `module.json`, builds `dist/`, packages `module.zip`, verifies zip declarations, and publishes to GitHub Releases.

---

## Code Architecture

- `scripts/delta-green-combat-hud.mjs` — Main entrypoint & Foundry hook registration.
- `scripts/actor-adapter.mjs` — Adapter parsing Delta Green Agent stats (HP, WP, SAN, Skills, Weapons, Armor).
- `scripts/hud-app.mjs` — Application/HUD UI render controller & event handlers.
- `scripts/roll-handler.mjs` — Roll calculations (d100 skill checks, lethality rolls, damage, SAN loss, WP boost).
- `scripts/target-manager.mjs` — Target overlay & keybinding manager.
- `scripts/combat-tracker.mjs` — Foundry Combat Tracker turn/movement listener.
- `scripts/settings.mjs` — Module settings & client keybindings.
- `scripts/api.mjs` — Public module API (`ui.deltaGreenCombatHud`).
