# New idea — scaffold reference

## Route snippet (`src/router.tsx`)

Add the import with other page imports, then a child route under `Layout`:

```tsx
import { ExampleIdeaPage } from '@/pages/ideas/ExampleIdeaPage'

// inside children:
{ path: 'ideas/example-slug', element: <ExampleIdeaPage /> },
```

## Minimal idea page template

Replace `Example`, `example-slug`, and copy as needed.

`src/pages/ideas/ExampleIdeaPage.tsx`:

```tsx
import { useEffect } from 'react'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

const PAGE_TITLE = 'Idea preview — Example'

export function ExampleIdeaPage() {
  useEffect(() => {
    document.title = PAGE_TITLE
  }, [])

  return (
    <Container className="py-section-y">
      <PageHeader
        eyebrow="Idea preview"
        title="Example concept"
        description="Replace this scaffold with the experiment the user asked for."
      />
      <p className="font-body text-body text-matte-black/80">
        Build out sections here using existing components from <code>@/components</code>.
      </p>
    </Container>
  )
}
```

## Preview URL cheat sheet

| PR number | Site root preview | Idea at `ideas/my-slug` |
| --- | --- | --- |
| 17 | `https://sunday-rolls.github.io/website/previews/pr-17/` | `https://sunday-rolls.github.io/website/previews/pr-17/ideas/my-slug` |

Production site (after merge to `main`): `https://sunday-rolls.github.io/website/`

## PR body template

```markdown
## Idea

[What this preview demonstrates and why.]

## How to review

- Open the preview link below
- Navigate to: `/ideas/<slug>` (omit if the change is on `/` or another existing route)

## Preview

Public link for clients (GitHub Pages). The repo stays private.

Deploy GitHub Pages runs on this PR; the bot comment will mirror the URL below once CI completes.

https://sunday-rolls.github.io/website/previews/pr-<PR_NUMBER>/
```
