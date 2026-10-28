---
name: start-feature
description: >-
  Start a Sunday Rolls website change on a fresh branch cut from the latest
  main. Use when the user is about to change the site and is on main, says
  "start a new feature/branch", or the website-change skill reaches step 1.
argument-hint: "[short description of the change]"
---

# Start a feature branch

Part of the `/website-change` loop (step 1 of 4).

## 1. Check the tools

```bash
gh auth status
git remote get-url origin
```

- `gh` missing or not signed in: they need the GitHub CLI (`brew install gh`) and `gh auth login`, which opens a browser sign-in they complete themselves. Stop until it works.
- `origin` should point at `Sunday-Rolls/website`.

## 2. Make sure nothing gets lost

Run `git status --porcelain`.

- Clean: continue.
- Only `test-results/` or `output/` changes: these are test leftovers. Leave them alone and continue.
- Anything else uncommitted: tell them which files, and ask whether those changes belong to the new feature (bring them along), belong to their current branch (commit or stash there first), or can be thrown away. Never discard work without a clear yes.

## 3. Name the branch

Build it from `$ARGUMENTS` or what they described, using the prefixes already in this repo:

- `feature/` for something new (`feature/gift-card-banner`)
- `fix/` for something broken (`fix/cart-total-rounding`)
- `chore/` for docs, tooling, cleanup

Lowercase, dashes, a few words. If you can't tell what the change is, ask in one short question rather than guessing.

## 4. Branch from the latest main

```bash
git fetch origin
git switch --no-track -c <branch> origin/main
```

If the branch name already exists locally or on `origin`, pick another name or ask whether they meant to continue that branch (`git switch <branch>`).

`--no-track` matters: without it the branch tracks `origin/main` and a later plain `git push` would target `main`.

## 5. Hand off

Tell them in a sentence: they're on `<branch>`, a safe copy of the site, and nothing they do here affects the live site until it's merged. Then continue with step 2 of `/website-change` (build the change).
