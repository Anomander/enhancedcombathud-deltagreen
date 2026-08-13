# RELEASE.md — how it ships

Versioning, the automated pipeline, and the checklist around it.

> **Status: never run.** There is no git remote configured and no `release-*` tag exists. The
> pipeline below is implemented and its build step is exercised on every CI run, but the
> release path itself is unproven. See [First release](#first-release) before trusting it.

---

## Versioning

**Semantic versioning**, and **the git tag is the source of truth.**

```
release-1.2.0   →   module.json version 1.2.0
```

Pushing a tag matching `release-*` is the only thing that triggers a release. The workflow
strips the prefix, substitutes the result into `module.json`, and publishes.

**You do not need to hand-edit `module.json`'s version.** The *Verify version* step compares
`module.json` against the tag *after* substitution, so it can only fail if the substitution
step itself failed — it does not check that a human bumped anything. Keeping the committed
value roughly in step is good hygiene for readers; it is not load-bearing.

| Change | Bump |
|---|---|
| Bug fix, no behaviour change to a working feature | patch |
| New capability, new setting, new panel | minor |
| A dependency's *minimum* version rises; a setting is removed or its meaning changes; the public API changes shape | major |

---

## The pipeline

`.github/workflows/release.yml`, on `push` of a `release-*` tag:

```
  1  checkout, Node 20, npm install
  2  npm test                          ← a failing suite cannot ship
  3  read module id from module.json
  4  derive VERSION from the tag       release-1.2.0 → 1.2.0
  5  substitute into module.json:
        version   ← 1.2.0
        download  ← …/releases/download/release-1.2.0/module.zip   (this tag)
        manifest  ← …/releases/latest/download/module.json         (always latest)
  6  verify module.json version == tag version
  7  npm run build                     → dist/
  8  zip dist/ → module.zip            (excluding *.map)
  9  verify the zip contains every path module.json declares
 10  fetch any existing release body for the tag
 11  create/update the GitHub Release
        artifacts: module.json, module.zip, the sourcemap
 12  POST to the Foundry package registry   (only if FOUNDRY_API_TOKEN is set)
```

### The two manifest URLs, and why they differ

This trips people up, so it is worth stating plainly:

- **`download`** points at *this specific tag's* `module.zip`. It must be immutable — an
  installed 1.1.0 should keep resolving to 1.1.0's archive forever.
- **`manifest`** points at `releases/latest/download/module.json`. It must be *mutable* —
  this is the URL Foundry re-fetches to discover that a newer version exists. Pointing it at
  the tagged manifest would freeze every install on the version it was installed at, with no
  update ever offered.

### Step 9 is the one that catches real mistakes

The zip verification reads every path `module.json` declares — `esmodules`, `scripts`,
`styles`, `languages[].path` — and fails the release if any is absent from the archive. This
is the guard against the classic Foundry packaging failure: a module that installs cleanly and
then does nothing, because the manifest names a file the zip does not contain.

`tools/build.mjs` asserts the same thing locally in `verifyManifest()`, so `npm run build`
catches it before you tag.

---

## What the build produces

`npm run build` writes `dist/` — the exact tree that goes inside `module.zip`.

```
  dist/
    scripts/delta-green-combat-hud.mjs        bundled, minified, keepNames
    scripts/delta-green-combat-hud.mjs.map    external sourcemap (excluded from the zip,
                                              uploaded as a separate release asset)
    styles/delta-green-combat-hud.css         minified
    lang/en.json, lang/es.json                whitespace-stripped
    module.json, LICENSE, release_notes.txt   verbatim
```

Three build settings are **mandatory**, not preferences:

| Setting | Why |
|---|---|
| `keepNames: true` | Argon resolves component templates from constructor names at runtime. Minified names break every render. |
| `external: ['/systems/*']` | The Delta Green roll API is served by Foundry at runtime. Bundling it would inline a copy of the system's dice. |
| orphan check | Fails if any `.mjs` under `scripts/` is unreachable from the entrypoint — i.e. would silently not ship. |

The build is **release-only**. There is no build step for development: Foundry loads
`scripts/**/*.mjs` as native ESM straight from the tree.

---

## Release checklist

**Before tagging**

- [ ] `npm test` green.
- [ ] `npm run build` clean.
- [ ] Verified in a live world — `FOUNDRY_USER=… npm run fvtt:diagnose` and `fvtt:smoke`. Green tests are not evidence (PROC-1); a feature is done only when confirmed in-world (PROC-5).
- [ ] `module.json` compatibility block reflects the Foundry version actually tested.
- [ ] Dependency minimums in `relationships` are still accurate.
- [ ] `CHANGELOG.md` updated.
- [ ] `release_notes.txt` updated — **it ships inside the archive.**
- [ ] Docs updated in the same commit as any architecture change (PROC-3).

**Tag and push**

```bash
git tag release-1.2.0
git push origin release-1.2.0
```

To get useful release notes, **create the GitHub Release with its body first**, then push the
tag: step 10 fetches any existing body and step 11 preserves it, appending the installation
line. Push a bare tag and you get a release whose only body is that line.

**After**

- [ ] The Actions run is green.
- [ ] The release has all three assets: `module.json`, `module.zip`, the `.map`.
- [ ] Install from the manifest URL into a clean world and confirm the HUD binds.
- [ ] If publishing to the Foundry registry, confirm the listing shows the new version.

---

## First release

The pipeline has never run. Before the first tag:

1. **Create the GitHub repository and add it as `origin`.** There is currently no remote.
2. **Reconcile the URLs in `module.json`.** `url`, `manifest` and `download` all reference
   `github.com/Anomander/delta-green-combat-hud`. If the repo lands anywhere else, these must
   match or every install will 404. Note the repository name and the module id
   (`enhancedcombathud-deltagreen`) are deliberately different — the id is fixed by Argon's
   discovery convention and must not be changed to match the repo.
3. **Rewrite `CHANGELOG.md` and `release_notes.txt`.** Both currently describe the
   *pre-migration standalone module* and are now wrong: they advertise a "canvas target
   selection overlay with keyboard shortcuts (`Shift+A`, `T`, `+`, `-`)" and "Combat Tracker
   turn and movement tracking integration". Argon owns `Shift+A`, and the movement HUD is
   deliberately suppressed. `release_notes.txt` ships inside `dist/`, so this text reaches
   users.
4. **Optionally add the `FOUNDRY_API_TOKEN` secret** to publish to the Foundry package
   registry. The step is skipped when the secret is absent, so the release still succeeds
   without it.
5. **Do a dry run on a throwaway tag** (`release-0.0.1-test`), confirm all twelve steps, then
   delete the tag and release.

---

## Compatibility changes

Three version floors are declared in `module.json`, and each has a different failure mode:

| Declared | Failure if wrong |
|---|---|
| `compatibility` (Foundry v14) | The module refuses to load, or loads against APIs that moved. |
| `relationships.systems` (`deltagreen` ≥ 2.0.0) | Data paths silently return `undefined` — the worst failure, because nothing errors. |
| `relationships.requires` (`enhancedcombathud` ≥ 5.0.0) | Argon shows a permanent error; the HUD never appears. |

Raising any of them is a **major** bump, and PROC-4 applies: re-read the dependency's source
before bumping, do not assume a changelog is complete. Run `npm run sync:schema` and
`npm run sync:argon` and read the diffs — that is the fastest accurate summary of what changed
underneath you.

If an Argon bump breaks the contract snapshot on a *minor* version, that is a dependency
tripwire. Stop and re-run the framework in [DESIGN.md §3](DESIGN.md) before writing more code
against it (PROC-6).

---

## Hotfixes

`main` is the only branch and releases come from tags on it, so a hotfix is just: fix, verify
in-world, bump patch, tag. There is no release branch to maintain and no backporting story —
deliberately, at this scale. If the project ever supports two Foundry majors at once, that
changes, and this page changes with it.
