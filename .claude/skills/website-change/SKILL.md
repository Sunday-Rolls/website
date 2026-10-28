---
name: website-change
description: >-
  Walk a Sunday Rolls teammate through changing the website end to end: branch
  from main, build the change, push and open a PR, hand back the GitHub Pages
  preview link, then merge to main once the change is approved. Use when the
  user wants to change, add, fix or update something on the site or
  storefront ("change the homepage copy", "add a section", "fix the cart"),
  asks how to ship a change, or asks what step they are on.
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

## Rules

- Never work directly on `main`. Every change goes through a branch and PR.
- Shopify and Railway changes (products, discounts, env vars) are live-store writes, not website changes. Confirm with the user before any of them, per `CLAUDE.md`.
- Never invent or commit secrets. If `.env` is missing values, point them at `.env.example` and the team.
- Don't commit `test-results/`, `output/`, `.env` or browser profiles.
- Merging is the one step that changes the real site. Only `/merge-feature` does it, and only after the user says the change is approved.
