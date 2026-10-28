---
name: merge-feature
description: >-
  Merge an approved Sunday Rolls pull request into main, which updates the
  live site, then clean up the branch. Use only when the user says the change
  is approved or asks to merge/ship/go live with their PR, or the
  website-change skill reaches step 4.
argument-hint: "[PR number]"
---

# Merge to main

Part of the `/website-change` loop (step 4 of 4). Merging is the step that changes the real site: it updates the Pages site, rebuilds Railway `website`, and redeploys Railway `contact-api` if anything under `server/` changed.

## 1. Find the PR

Use `$ARGUMENTS` if it's a PR number, otherwise the current branch's PR:

```bash
gh pr view <N-or-blank> --json number,title,url,state,isDraft,mergeable,reviewDecision,headRefName,statusCheckRollup
```

Stop and explain if:

- `state` isn't `OPEN` (already merged or closed)
- `isDraft` is true (mark it ready with `gh pr ready` only if they say so)
- `mergeable` is `CONFLICTING`: bring `main` into the branch (`git fetch origin && git merge origin/main`), resolve, rerun the checks, push with `/open-preview`, and have them re-check the preview before merging
- any check in `statusCheckRollup` failed or is still running: wait or fix first
- `reviewDecision` is `CHANGES_REQUESTED`: there is open feedback to address

## 2. Confirm approval

`main` isn't branch-protected, so GitHub won't enforce approval. You enforce it. Ask in one line, naming the PR title and preview link, whether this is approved to go live. Merge only on a clear yes in chat for this PR. A yes for a different PR or an earlier version of this one doesn't count.

## 3. Merge

The repo merges with merge commits ("Merge pull request #N from …"):

```bash
gh pr merge <N> --merge --delete-branch
```

## 4. Watch the deploy

```bash
gh run list --branch main --workflow deploy-staging.yml --limit 1 --json databaseId,status,conclusion
gh run watch <databaseId> --exit-status
```

Run it in the background and wait. When it passes, `https://sunday-rolls.github.io/website/` shows the change. Railway `website` rebuilds from `main` on its own, and so does `contact-api` when `server/**` changed; if the Railway MCP is connected you can check those deployments (read-only), otherwise mention they take a few minutes. The closed PR's preview folder is removed automatically.

If the deploy fails, show `gh run view <databaseId> --log-failed` in plain words and fix it on a new branch with `/start-feature`. Don't push fixes to `main` directly.

## 5. Clean up locally

```bash
git switch main
git pull --ff-only
git branch -d <headRefName>
```

If `git switch main` is blocked by uncommitted files, they're not part of this change: say which and ask what to do.

## 6. Hand back

One or two lines: what's live, the site link, and that they can start the next change with `/website-change`.
