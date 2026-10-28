---
name: open-preview
description: >-
  Commit and push the current Sunday Rolls feature branch, open (or update) its
  pull request, wait for GitHub Actions to build the Pages preview, and hand
  back the public preview link. Use when the change is ready to look at, the
  user asks for a preview link or to "push", "open a PR", or "send it for
  review", or after making feedback changes on a branch that already has a PR.
---

# Push and get the preview link

Part of the `/website-change` loop (step 3 of 4). Every PR gets a public preview at `https://sunday-rolls.github.io/website/previews/pr-N/`, built by `.github/workflows/deploy-staging.yml`. The repo is private but the preview link is public, so it's safe to send to the client.

## 1. Check the branch

```bash
git branch --show-current
git status --porcelain
```

If the branch is `main`, stop: run `/start-feature` first and bring the changes along. Never push to `main`.

## 2. Run the checks

Run the checks for what changed (`git diff --name-only origin/main...` plus uncommitted files):

- Storefront: `npm test` and `npm run lint`
- `server/`: `cd server && npm test && npm run typecheck`

Don't push red checks. CI runs `npm test` before building the preview, so a failing test means no preview link.

## 3. Commit

- Stage the files that belong to the change by name. Don't use `git add -A` or `git add .`; never stage `test-results/`, `output/`, `.env*` (other than `.env.example`) or browser profiles.
- Show them the file list before committing if anything looks unexpected.
- Message style in this repo: one imperative sentence ending with a period, e.g. `Add gift card banner to the shop page.` Add the attribution trailer your harness asks for.
- If there's nothing new to commit and the branch is already pushed, skip to step 5.

## 4. Push

```bash
git push -u origin HEAD
```

If the push is rejected because the remote moved, `git pull --rebase` and push again; if that conflicts, explain and ask before resolving.

## 5. Open the PR (or find the existing one)

```bash
gh pr view --json number,url,state 2>/dev/null
```

- PR already open: pushing updated it. Say so and go to step 6.
- No PR: create one against `main`.

```bash
gh pr create --base main --title "<what changed, in plain words>" --body "<body>"
```

Body: a short **Summary** of what changed and why, a **How to check** list (which page, what to click), and the PR attribution footer your harness asks for. Write it for someone who will only look at the preview.

## 6. Wait for the preview

The preview build takes a few minutes. Run this in the background and wait for it to finish rather than polling:

```bash
gh run list --branch "$(git branch --show-current)" --workflow deploy-staging.yml --limit 1 --json databaseId,status,conclusion
gh run watch <databaseId> --exit-status
```

- Success: the link is `https://sunday-rolls.github.io/website/previews/pr-<N>/`. The workflow also posts it as a comment on the PR. GitHub Pages can take another minute to serve it, so if it 404s at first, wait a minute and reload.
- Failure: `gh run view <databaseId> --log-failed`, explain what broke in plain words, fix it on the branch, and run this skill again.
- Runs share one queue (`concurrency: github-pages`), so a run may sit queued behind another PR's. That's normal.

## 7. Hand back

Give them:

- The preview link (the thing to open and share)
- The PR link
- What to do next: look it over or send the preview to whoever approves it. Feedback → make the edits and run `/open-preview` again; the same link updates. Approved → `/merge-feature`.

If you can, open the preview in the browser and check the changed page actually shows the change before handing it over.
