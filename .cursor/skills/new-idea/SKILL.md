---
name: new-idea
description: >-
  Starts a git branch, scaffolds a Sunday Rolls site experiment, opens a draft PR,
  and shares the GitHub Pages preview URL. Use when the user wants a new idea,
  concept branch, client preview, or asks to run /new-idea.
---

# New idea

Turn a rough concept into a shareable preview on GitHub Pages without merging to `main`.

## Before you start

Collect or infer:

1. **Idea name** — short label (becomes branch slug and page title seed).
2. **Scope** — default is an isolated preview page; user may want edits to home, shop, or an existing page instead.
3. **Base branch** — use `main` unless the user names another branch.

Do not scaffold server-only work with this skill unless the user explicitly asks; this flow targets the Vite storefront in the repo root.

## Workflow

Copy and track progress:

```
- [ ] Branch created from base
- [ ] Idea scaffolded (minimal, runnable)
- [ ] npm run test (and npm run lint if you touched TS/TSX)
- [ ] Committed and pushed
- [ ] Draft PR opened against base
- [ ] Preview URL shared with user
```

### 1. Branch

From the repo root:

```bash
git fetch origin main
git checkout main
git pull origin main
git checkout -b idea/<slug>
```

**Slug rules:** lowercase letters, numbers, and dashes only (e.g. `hero-video`, `spring-drop`). Derive from the idea name; keep it under ~40 characters.

### 2. Scaffold

Pick the lightest option that matches the request.

| Scope | When | What to add |
| --- | --- | --- |
| **Isolated page** (default) | New layout, copy, or UI to review in isolation | Route + page under `ideas/<slug>` — see [reference.md](reference.md) |
| **Existing page** | Tweaks to home, shop, about, etc. | Edit the relevant `src/pages/*`, `src/content/pages/*.json`, and/or `src/components/**` |
| **New first-class page** | Must live at a top-level URL (e.g. `/lookbook`) | Same as isolated page but use the desired path; wire `src/router.tsx` only |

**Isolated page checklist:**

1. Add `src/pages/ideas/<PascalName>Page.tsx` using existing UI primitives (`Container`, `PageHeader`, `Button`, theme tokens).
2. Register route in `src/router.tsx`: `path: 'ideas/<slug>', element: <...Page />`.
3. Prefer inline or local constants for copy on first pass; only extend `src/lib/content.ts` and `PageKey` if the idea needs the full content pipeline.

Match existing patterns: functional components, `@/` imports, `document.title` in `useEffect`, Tailwind classes consistent with neighboring pages.

Skip nav/footer links unless the user wants the idea discoverable from the main site; the preview URL can deep-link to `/ideas/<slug>`.

### 3. Verify locally (quick)

```bash
npm ci
npm run test
npm run lint
```

Fix failures before pushing. Optional smoke: `npm run dev` and open the idea path.

### 4. Commit and push

One focused commit is enough for the scaffold:

```bash
git add -A
git commit -m "idea: scaffold <human-readable idea name>"
git push -u origin idea/<slug>
```

### 5. Open a draft PR

- **Base:** `main` (or the branch the user specified).
- **Title:** `idea: <human-readable idea name>`
- **Body:** Include:
  - One paragraph on what the preview shows
  - **Preview path** on the deployed site (e.g. `ideas/<slug>` or `/` if home changed)
  - Note that the public link is GitHub Pages, not the private repo

Use the **ManagePullRequest** tool when available (`create_pr`, `draft: true`). Do not use `gh pr create` in cloud-agent runs.

### 6. Preview URL

After the PR exists, CI workflow **Deploy GitHub Pages** (`.github/workflows/deploy-staging.yml`) builds and deploys a PR preview.

**Public preview URL (send this to the client):**

```text
https://sunday-rolls.github.io/website/previews/pr-<PR_NUMBER>/
```

Append the in-app path when the idea is not the homepage (respect `VITE_BASE_PATH` / router basename):

```text
https://sunday-rolls.github.io/website/previews/pr-<PR_NUMBER>/ideas/<slug>
```

The workflow also posts or updates a PR comment with the same base URL. Prefer that comment once CI finishes; until then, give the constructed URL and mention the deploy may take a few minutes.

If CI fails, fix on the same branch, push, and update the PR — preview refreshes on synchronize.

## Response to the user

Always end with:

1. Branch name
2. PR link (markdown)
3. **Preview link** (full URL including path if applicable)
4. One sentence on what was scaffolded and what to try next

## Examples

**User:** “New idea: alternate hero with full-bleed video”

- Branch: `idea/hero-full-bleed`
- Scaffold: isolated page or `HomePage` + `home.json` depending on whether they want only a mock or live home swap
- PR title: `idea: full-bleed hero video`
- Preview: `.../previews/pr-42/` or `.../previews/pr-42/ideas/hero-full-bleed`

**User:** “/new-idea spring collection landing”

- Run the full workflow without asking for permission at each git step unless the working tree has unrelated uncommitted changes — then stash or branch from a clean base and say what you did.

## Additional resources

- File templates and route snippet: [reference.md](reference.md)
