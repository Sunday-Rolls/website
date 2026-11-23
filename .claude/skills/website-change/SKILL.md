---
name: website-change
description: >-
  Walk a Sunday Rolls teammate through changing the website end to end: branch
  from main, build the change, push and open a PR, hand back the GitHub Pages
  preview link, then merge to main once the change is approved. Use when the
  user wants to change, add, fix or update something on the site or
  storefront ("change the homepage copy", "add a section", "fix the cart"),
  wants to run a change as an A/B test, asks how to ship a change, or asks
  what step they are on.
argument-hint: "[what you want to change]"
---

# Change the Sunday Rolls website

The loop is always the same, and each step has its own skill:

| Step | Skill | Ends with |
|------|-------|-----------|
| 1. Start | `/start-feature` | A fresh branch off up-to-date `main` |
| 2. Build | (this skill) | The change working locally, tests and lint passing |
| 3. Preview | `/open-preview` | A PR and its public preview link `https://sunday-rolls.github.io/website/previews/pr-N/` |
| 4. Ship | `/merge-feature` | The PR merged to `main`, live site rebuilding |

Feedback after step 3 loops back to step 2 on the same branch: edit, then run `/open-preview` again. It pushes to the same PR and the same preview link updates.

## Figure out where they are

Before doing anything, check the state so you resume instead of restarting:

```bash
git status -sb
git branch --show-current
gh pr view --json number,url,state,reviewDecision 2>/dev/null
```

- On `main` with no PR → step 1. If `$ARGUMENTS` or their message says what to change, carry it into the branch name.
- On a feature branch with no PR → step 2 (or 3 if the change is done).
- On a branch with an open PR → they are reviewing. Ask whether there is feedback to make (step 2) or it is approved (step 4).
- On a branch whose PR is merged → offer to switch back to `main` and pull.

Say in one line which step they are on and what happens next. Teammates may not be developers: use plain words ("a branch is your own copy of the site to change safely"), and don't dump git output on them.

## Step 2: build the change

1. Read the relevant code before editing. The storefront is in `src/` (React 19 + Vite + Tailwind); the API and dashboard are in `server/`. `README.md` has the map.
2. Make the change. Keep it to what they asked for.
3. Show it running. Start the storefront with `npm run dev` (and `cd server && npm run dev` if the change touches the API or dashboard), then check the page in the browser and tell them the local URL to look at.
4. Run the checks for what you touched:
   - Storefront: `npm test` and `npm run lint`
   - `server/`: `cd server && npm test && npm run typecheck`
   Fix failures before moving on. If a failure is unrelated to the change, say so and ask whether to continue.
5. When they're happy with it locally, go to `/open-preview`.

## Run it as an A/B test

Offer this when they're unsure whether a change helps ("will this sell more?", "test it against the current page") or ask for an A/B test. The loop is the same four steps; the change ships **dark** and an operator turns it on from the dashboard. Background: `docs/AB_TESTING_PLAN.md` §7; exact formats: `docs/EXPERIMENTS_CONTRACT.md`.

1. **Pick a key** (`home-banner`: lowercase, dashes, 2–48 chars) and check no running test targets the same page (only one test per page at a time).
2. **Add the registry file** `src/experiments/<key>.json`, copying `src/experiments/aa-check.json`: `name`, `hypothesis`, `variants` (one must be `control`, integer weights summing to 100), `primaryMetric` (default `add_to_cart`; `begin_checkout`, `contact_submit`, `newsletter_subscribe`, `purchase`), `paths` (e.g. `["/"]`; `[]` means site-wide and blocks every other test), and optional `minVisitorsPerArm` / `minDays` / `maxDays`. The schema is `src/experiments/schema.json`.
3. **Gate the change** with one of:
   - `<Variant experiment="<key>" is="b" fallback={<Current />}><New /></Variant>` from `@/components/experiments`, around the part that differs. Give control a branch too (`fallback` or `<Variant is="control">`) so both arms log exposures the same way. Lazy-load heavy new components so control visitors don't download them.
   - `const arm = useVariant('<key>')` in the component that shows the difference (rendering it counts as an exposure, so don't call it higher up than needed).
   - Copy-only tests: an `experiments` block in the page JSON under `src/content/`: `"experiments": { "<key>": { "b": { "hero": { "headline": "…" } } } }`. It deep-merges over the page for arm `b`; no component change.
   Use the key as a string literal: `npm test` (`src/experiments/registry.test.ts`) checks every `useVariant` / `<Variant experiment>` / content `experiments` key has a valid registry file, and fails otherwise.
4. **Check both arms locally** with `?sr_force=<key>:b` and `?sr_force=<key>:control` (stored for the tab; `?sr_force=clear` resets). Run `npm test` and `npm run lint`.
5. **Open the preview** with `/open-preview`, then add the label (ask first; it's a GitHub write): `gh pr edit <N> --add-label ab-test`. The **Experiments** workflow re-checks the registry, comments one preview link per arm (`…/previews/pr-N/<path>?sr_force=<key>:<arm>`) and creates a **draft** in Dashboard → Experiments. If the comment says the dashboard sync isn't set up, the one-time setup in README → "A/B tests" hasn't been done; the previews still work.
6. **Merge dark** with `/merge-feature` once approved. Everyone keeps seeing `control`; the bot comments "Merged dark. Start it from Dashboard → Experiments." Tell them the test starts only when someone presses **Start** on the dashboard (`/admin-handoff` covers running it). Closing the PR unmerged archives the draft.
7. **After it concludes** (Promote or Stop on the dashboard), a GitHub issue "Clean up experiment `<key>`: keep `<arm>`" lists the files to change. Do it as a normal change: keep the winning arm's code, delete the other arms and `src/experiments/<key>.json`, no `ab-test` label. A weekly job re-opens the issue if the flag code is still there two weeks after the end.

## Rules

- Never work directly on `main`. Every change goes through a branch and PR.
- Shopify and Railway changes (products, discounts, env vars) are live-store writes, not website changes. Confirm with the user before any of them, per `CLAUDE.md`.
- Never invent or commit secrets. If `.env` is missing values, point them at `.env.example` and the team.
- Don't commit `test-results/`, `output/`, `.env` or browser profiles.
- Merging is the one step that changes the real site. Only `/merge-feature` does it, and only after the user says the change is approved.
