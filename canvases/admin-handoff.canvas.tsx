import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Code,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Link,
  Pill,
  Row,
  Stack,
  Table,
  Text,
  TodoListCard,
  useCanvasAction,
  useCanvasState,
  type TodoItem,
  type TodoStatus,
} from "cursor/canvas";

type Track = "operations" | "workflow";

const SHOPIFY_ADMIN = "https://admin.shopify.com/store/chrgrk-ff";
const SHOPIFY_ORDERS = `${SHOPIFY_ADMIN}/orders`;
const SHOPIFY_DISCOUNTS = `${SHOPIFY_ADMIN}/discounts`;
const SHOPIFY_PRODUCTS = `${SHOPIFY_ADMIN}/products`;
const SHOPIFY_CUSTOMER_EVENTS = `${SHOPIFY_ADMIN}/settings/customer_events`;
const SHOPIFY_LOCATIONS = `${SHOPIFY_ADMIN}/settings/locations`;
const SHOPIFY_SHIPPING = `${SHOPIFY_ADMIN}/settings/shipping`;
const SHIPPO_APP = "https://apps.shopify.com/shippo";
const SHIPPO_DOCS =
  "https://support.goshippo.com/hc/en-us/articles/360029218511-Use-Shopify-with-Shippo";
const DASHBOARD = "https://contact-api-production-9af6.up.railway.app/dashboard/";
const LIVE_SITE = "https://www.sundayrollsgolf.com";
const DEMO_SITE = "https://sunday-rolls.github.io/website/";
const GITHUB_REPO = "https://github.com/Sunday-Rolls/website";
const SALES_TRACKER =
  "https://docs.google.com/spreadsheets/d/1v18ftrLt5jcyGJsKFq37CwIYYY04aKIDeeEp0F5_XMU/edit";

const OPS_TODO_DEFS: { id: string; content: string }[] = [
  { id: "ops-orders", content: "Check Shopify Orders (and Shippo Orders) for new purchases" },
  { id: "ops-fulfill", content: "Buy Shippo label → tracking syncs; refunds stay in Shopify" },
  { id: "ops-sync", content: "If numbers look stale, Sync Shopify + Sync GA4 in the dashboard" },
  { id: "ops-qr", content: "When packaging, print review QR sheets from Dashboard → Data" },
  { id: "ops-contact", content: "Skim contact inbox (CONTACT_TO_EMAIL) and dashboard reviews" },
];

const SETUP_TODO_DEFS: { id: string; content: string }[] = [
  { id: "wf-node", content: "Confirm Node 22+ (`node -v`)" },
  { id: "wf-clone", content: "Clone Sunday-Rolls/website and open in Cursor" },
  { id: "wf-env-spa", content: "Copy `.env.example` → `.env` at repo root" },
  { id: "wf-env-api", content: "Copy `server/.env.example` → `server/.env`" },
  { id: "wf-install", content: "`npm install` at root and in `server/`" },
  { id: "wf-dev", content: "Run `npm run dev` (SPA) and `cd server && npm run dev` (API)" },
  { id: "wf-open", content: "Open SPA (Vite) and http://localhost:3001/dashboard/" },
];

function cycleStatus(status: TodoStatus): TodoStatus {
  if (status === "pending") return "in_progress";
  if (status === "in_progress") return "completed";
  if (status === "completed") return "pending";
  return "pending";
}

function buildTodos(
  defs: { id: string; content: string }[],
  statuses: Record<string, TodoStatus>,
): TodoItem[] {
  return defs.map((d) => ({
    id: d.id,
    content: d.content,
    status: statuses[d.id] ?? "pending",
  }));
}

function KeyLinks() {
  return (
    <Stack gap={8}>
      <H3>Bookmarks</H3>
      <Table
        headers={["Place", "URL"]}
        rows={[
          ["Live site", <Link href={LIVE_SITE}>www.sundayrollsgolf.com</Link>],
          ["Demo (GitHub Pages)", <Link href={DEMO_SITE}>sunday-rolls.github.io/website</Link>],
          ["Shopify Admin", <Link href={SHOPIFY_ADMIN}>admin.shopify.com/store/chrgrk-ff</Link>],
          ["Orders", <Link href={SHOPIFY_ORDERS}>Orders</Link>],
          ["Discounts", <Link href={SHOPIFY_DISCOUNTS}>Discounts</Link>],
          ["Shippo (labels)", <Link href={SHIPPO_APP}>apps.shopify.com/shippo</Link>],
          ["Analytics dashboard", <Link href={DASHBOARD}>Railway /dashboard/</Link>],
          ["GitHub", <Link href={GITHUB_REPO}>Sunday-Rolls/website</Link>],
        ]}
        columnAlign={["left", "left"]}
        striped
      />
    </Stack>
  );
}

function OperationsView({
  todos,
  onTodoClick,
}: {
  todos: TodoItem[];
  onTodoClick: (todo: TodoItem) => void;
}) {
  const dispatch = useCanvasAction();

  return (
    <Stack gap={20}>
      <Callout tone="info" title="Two hubs (+ Shippo)">
        Commerce (orders, discounts, checkout rates) lives in Shopify Admin. Labels and
        carrier pickup are bought in Shippo, which syncs tracking back to Shopify.
        Analytics sync, P&L, and review QR PDFs live on the Railway dashboard. This SPA
        does not buy labels or manage discount codes.
      </Callout>

      <Grid columns={2} gap={12}>
        <Card>
          <CardHeader trailing={<Pill active size="sm">Commerce</Pill>}>
            Shopify Admin
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small" tone="secondary">
                Shop: chrgrk-ff.myshopify.com
              </Text>
              <Text>
                Purchases, refunds, discounts, catalog, and checkout shipping rates.
              </Text>
              <Row gap={8} wrap>
                <Link href={SHOPIFY_ORDERS}>Orders</Link>
                <Link href={SHOPIFY_DISCOUNTS}>Discounts</Link>
                <Link href={SHOPIFY_PRODUCTS}>Products</Link>
                <Link href={SHIPPO_APP}>Shippo app</Link>
              </Row>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader trailing={<Pill active size="sm">Ops tools</Pill>}>
            Railway dashboard
          </CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text>
                Sync GA4 / Shopify, P&L and ROAS, export review QR PDFs, smoke-test contact
                and reviews.
              </Text>
              <Link href={DASHBOARD}>Open /dashboard/</Link>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <Stack gap={12}>
        <H2>See purchases and ship with Shippo</H2>
        <Text>
          Paid checkouts land in <Link href={SHOPIFY_ORDERS}>Shopify Orders</Link> and
          import into Shippo once the app is connected. Buy the label in Shippo; tracking
          and “fulfilled” sync back to Shopify.
        </Text>
        <Callout tone="warning" title="Setup still needed on chrgrk-ff">
          Shippo is not installed yet. Location street address is incomplete (MN 55419
          only). Follow docs/SHIPPO.md before relying on label sync.
        </Callout>
        <CollapsibleSection title="Day-to-day ship path" defaultOpen>
          <Stack gap={6}>
            <Text>1. Confirm the order in Shopify Orders (Unfulfilled).</Text>
            <Text>2. Open the same order in Shippo → set weight / dimensions.</Text>
            <Text>3. Pick a carrier rate → Buy label → print.</Text>
            <Text>
              4. Shippo syncs tracking + marks fulfilled; customer gets Shopify’s shipping
              email (if that sync option is on).
            </Text>
            <Text tone="secondary" size="small">
              Refunds and cancellations stay on the Shopify order page. Checkout rates
              customers pay are under Settings → Shipping and delivery (currently flat
              Standard $8 / $0 and Express $15) — separate from what you pay Shippo for
              the label.
            </Text>
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="One-time Shippo setup">
          <Stack gap={6}>
            <Text>
              1. Complete <Link href={SHOPIFY_LOCATIONS}>Locations</Link> street address.
            </Text>
            <Text>
              2. Install <Link href={SHIPPO_APP}>Shippo</Link> on chrgrk-ff and authorize.
            </Text>
            <Text>
              3. In Shippo Stores → Manage: enable sync tracking + Shopify customer
              notification.
            </Text>
            <Text>4. Smoke-test one order end-to-end (label → fulfilled in Shopify).</Text>
            <Row gap={8} wrap>
              <Button
                variant="secondary"
                onClick={() => dispatch({ type: "openFile", path: "docs/SHIPPO.md" })}
              >
                docs/SHIPPO.md
              </Button>
              <Link href={SHIPPO_DOCS}>Shippo’s Shopify guide</Link>
              <Link href={SHOPIFY_SHIPPING}>Shopify shipping settings</Link>
            </Row>
          </Stack>
        </CollapsibleSection>
      </Stack>

      <Stack gap={12}>
        <H2>Record keeping</H2>
        <Text>
          Shopify is the source of truth for website sales. The dashboard pulls those
          orders into Postgres for P&L / ROAS. Legacy and multi-channel history still
          uses the Sales Tracker workbook.
        </Text>
        <Table
          headers={["Source", "Where", "When"]}
          rows={[
            [
              "Website sales",
              "Shopify → dashboard Sync Shopify",
              "After orders land / when numbers look stale",
            ],
            [
              "Traffic & ads",
              "Dashboard Sync GA4",
              "After campaigns or weekly check-in",
            ],
            [
              "Legacy / other channels",
              <Link href={SALES_TRACKER}>Sales Tracker sheet</Link>,
              "Owned by Derick; optional import into Postgres",
            ],
          ]}
          striped
        />
        <Row gap={8} wrap>
          <Button
            variant="secondary"
            onClick={() =>
              dispatch({ type: "openFile", path: "docs/DASHBOARD_ACCESS.md" })
            }
          >
            Dashboard access doc
          </Button>
        </Row>
      </Stack>

      <Stack gap={12}>
        <H2>Shopify day-to-day</H2>
        <CollapsibleSection title="Discount codes" defaultOpen>
          <Stack gap={6}>
            <Text>
              Create and edit codes under{" "}
              <Link href={SHOPIFY_DISCOUNTS}>Discounts</Link> (percentage, fixed amount,
              free shipping, automatic discounts). There is no discount UI in this app —
              the storefront honors whatever Shopify applies at checkout.
            </Text>
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Products and inventory">
          <Stack gap={6}>
            <Text>
              Manage catalog in <Link href={SHOPIFY_PRODUCTS}>Products</Link>. The site
              reads the Storefront API; after catalog changes, soft-refresh the live
              site. Bulk port scripts live under <Code>npm run catalog:*</Code> for
              developers.
            </Text>
          </Stack>
        </CollapsibleSection>
        <CollapsibleSection title="Purchase analytics pixel">
          <Stack gap={6}>
            <Text>
              Checkout purchase events fire from a Shopify Customer Events custom pixel
              named <Code>Sunday Rolls GA4</Code>. Confirm it under{" "}
              <Link href={SHOPIFY_CUSTOMER_EVENTS}>Settings → Customer events</Link>.
              Setup notes:{" "}
              <Button
                variant="ghost"
                onClick={() =>
                  dispatch({ type: "openFile", path: "docs/SHOPIFY_WEB_PIXEL.md" })
                }
              >
                SHOPIFY_WEB_PIXEL.md
              </Button>
            </Text>
          </Stack>
        </CollapsibleSection>
      </Stack>

      <Stack gap={12}>
        <H2>Print review QR codes</H2>
        <Text>
          QR codes open a product page with the leave-a-review form (
          <Code>?review=1</Code>). Preferred path is the dashboard PDF export.
        </Text>
        <Stack gap={6}>
          <Text>1. Open the analytics dashboard → Data.</Text>
          <Text>
            2. Under Review QR codes, pick GitHub Pages or Live site.
          </Text>
          <Text>3. Click Export PDF — one letter page per product (3×3 cutouts).</Text>
        </Stack>
        <Text size="small" tone="secondary">
          CLI fallback from repo root: <Code>npm run reviews:qr:pages</Code> or{" "}
          <Code>npm run reviews:qr:live</Code> → <Code>output/product-review-qrs/</Code>
        </Text>
        <Button
          variant="secondary"
          onClick={() =>
            dispatch({ type: "openFile", path: "docs/REVIEW_QR_CODES.md" })
          }
        >
          REVIEW_QR_CODES.md
        </Button>
      </Stack>

      <Stack gap={12}>
        <H2>Contact and reviews</H2>
        <Text>
          Contact form submissions go to Resend → <Code>CONTACT_TO_EMAIL</Code>, and are
          stored in Postgres. Product reviews also land in Postgres (and email). Use
          Dashboard → Tests to smoke-test contact, reviews, and a tagged $0 order.
        </Text>
        <Button
          variant="secondary"
          onClick={() =>
            dispatch({ type: "openFile", path: "docs/CONTACT_EMAIL.md" })
          }
        >
          CONTACT_EMAIL.md
        </Button>
      </Stack>

      <Stack gap={12}>
        <H2>Weekly operator checklist</H2>
        <Text tone="secondary" size="small">
          Click a row to cycle pending → in progress → done.
        </Text>
        <TodoListCard todos={todos} defaultExpanded onTodoClick={onTodoClick} />
      </Stack>

      <KeyLinks />
    </Stack>
  );
}

function WorkflowView({
  todos,
  onTodoClick,
}: {
  todos: TodoItem[];
  onTodoClick: (todo: TodoItem) => void;
}) {
  const dispatch = useCanvasAction();

  return (
    <Stack gap={20}>
      <Callout tone="info" title="Ask an agent for a guided setup">
        In Cursor chat, ask to run the admin-handoff skill (or say “guided setup”). The
        agent walks these steps with you and opens the relevant docs.
      </Callout>

      <Stack gap={12}>
        <H2>Toolchain</H2>
        <Table
          headers={["Tool", "Role", "Link"]}
          rows={[
            [
              "Node 22 + npm",
              "Runtime / package manager",
              <Link href="https://nodejs.org/">nodejs.org</Link>,
            ],
            [
              "Cursor",
              "IDE + agents for this repo",
              <Link href="https://cursor.com/">cursor.com</Link>,
            ],
            [
              "Claude Code",
              "Optional CLI coding agent",
              <Link href="https://docs.anthropic.com/en/docs/claude-code">Claude Code docs</Link>,
            ],
            [
              "GitHub",
              "Source, PRs, Pages previews",
              <Link href={GITHUB_REPO}>Sunday-Rolls/website</Link>,
            ],
            [
              "Shopify",
              "Checkout + Admin API",
              <Link href={SHOPIFY_ADMIN}>chrgrk-ff Admin</Link>,
            ],
            [
              "Railway",
              "contact-api + Postgres (+ website cutover)",
              <Link href="https://railway.com/">railway.com</Link>,
            ],
          ]}
          striped
        />
        <Text size="small" tone="secondary">
          Stack: React 19 + Vite storefront, Hono API under <Code>server/</Code>, Shopify
          Storefront API (headless — not a Liquid theme deploy).
        </Text>
      </Stack>

      <Stack gap={12}>
        <H2>First-time setup</H2>
        <Text>
          You need two env files and two process. Secrets come from Railway / Shopify
          Admin / the team — never invent or commit them. Start from the examples.
        </Text>
        <CollapsibleSection title="Commands" defaultOpen>
          <Stack gap={8}>
            <Text>
              SPA: <Code>cp .env.example .env && npm install && npm run dev</Code>
            </Text>
            <Text>
              API:{" "}
              <Code>
                cd server && cp .env.example .env && npm install && npm run dev
              </Code>
            </Text>
            <Text>
              Dashboard locally:{" "}
              <Link href="http://localhost:3001/dashboard/">
                http://localhost:3001/dashboard/
              </Link>
            </Text>
          </Stack>
        </CollapsibleSection>
        <Text tone="secondary" size="small">
          Click a row to cycle status as you complete setup.
        </Text>
        <TodoListCard todos={todos} defaultExpanded onTodoClick={onTodoClick} />
      </Stack>

      <Stack gap={12}>
        <H2>Idea → preview → production</H2>
        <Text>
          Current ship path uses GitHub Pages for the SPA (demo + PR previews) and
          Railway for the API. Walk a change end-to-end like this:
        </Text>
        <Stack gap={8}>
          <Text weight="semibold">1. Branch</Text>
          <Text tone="secondary">
            From <Code>main</Code>: <Code>git checkout -b feature/your-idea</Code>
          </Text>
          <Text weight="semibold">2. Implement and test locally</Text>
          <Text tone="secondary">
            Run both servers. Use <Code>npm test</Code> / <Code>npm run lint</Code> at the
            root; in <Code>server/</Code> use <Code>npm test</Code> and{" "}
            <Code>npm run typecheck</Code>.
          </Text>
          <Text weight="semibold">3. Open a pull request</Text>
          <Text tone="secondary">
            Push and open a PR on GitHub. Actions builds a preview with base path{" "}
            <Code>/website/previews/pr-N/</Code> and comments the URL.
          </Text>
          <Text weight="semibold">4. Review the feature branch preview</Text>
          <Text tone="secondary">
            Open{" "}
            <Code>https://sunday-rolls.github.io/website/previews/pr-N/</Code> (replace{" "}
            <Code>N</Code> with the PR number). Private repo; preview links are public.
          </Text>
          <Text weight="semibold">5. Merge to production path</Text>
          <Text tone="secondary">
            Merge to <Code>main</Code> → Pages site at{" "}
            <Link href={DEMO_SITE}>sunday-rolls.github.io/website/</Link> updates.
            Changes under <Code>server/**</Code> also autodeploy Railway{" "}
            <Code>contact-api</Code>.
          </Text>
        </Stack>
        <Callout tone="warning" title="Production cutover target">
          Live custom domain is planned on Railway <Code>website</Code> + DNS. Follow{" "}
          <Button
            variant="ghost"
            onClick={() =>
              dispatch({ type: "openFile", path: "docs/RAILWAY_CUTOVER.md" })
            }
          >
            RAILWAY_CUTOVER.md
          </Button>{" "}
          when flipping www.sundayrollsgolf.com off Pages.
        </Callout>
      </Stack>

      <Stack gap={12}>
        <H2>Where docs live</H2>
        <Table
          headers={["Doc", "Covers"]}
          rows={[
            ["docs/DASHBOARD_ACCESS.md", "Access checklist, IDs, partner punch list"],
            ["docs/ANALYTICS.md", "GTM / GA4 demo vs live"],
            ["docs/REVIEW_QR_CODES.md", "QR generation and print"],
            ["docs/SHOPIFY_WEB_PIXEL.md", "Purchase pixel install"],
            ["docs/CONTACT_EMAIL.md", "Resend contact path"],
            ["docs/RAILWAY_CUTOVER.md", "SPA → Railway production cutover"],
            ["server/README.md", "API endpoints, dashboard, Railway"],
          ]}
          striped
        />
      </Stack>

      <KeyLinks />
    </Stack>
  );
}

export default function AdminHandoffCanvas() {
  const [track, setTrack] = useCanvasState<Track>("track", "operations");
  const [opsStatuses, setOpsStatuses] = useCanvasState<Record<string, TodoStatus>>(
    "opsTodoStatuses",
    {},
  );
  const [setupStatuses, setSetupStatuses] = useCanvasState<Record<string, TodoStatus>>(
    "setupTodoStatuses",
    {},
  );

  const opsTodos = buildTodos(OPS_TODO_DEFS, opsStatuses);
  const setupTodos = buildTodos(SETUP_TODO_DEFS, setupStatuses);

  return (
    <Stack gap={20} style={{ padding: 24, maxWidth: 920 }}>
      <Stack gap={8}>
        <H1>Sunday Rolls — Admin handoff</H1>
        <Text tone="secondary">
          How to run the site day-to-day, and how to set up the toolchain and ship a
          change. Source of truth in the repo: <Code>canvases/admin-handoff.canvas.tsx</Code>
        </Text>
      </Stack>

      <Row gap={8} align="center">
        <Pill active={track === "operations"} onClick={() => setTrack("operations")}>
          Operations
        </Pill>
        <Pill active={track === "workflow"} onClick={() => setTrack("workflow")}>
          Workflow
        </Pill>
      </Row>

      {track === "operations" ? (
        <OperationsView
          todos={opsTodos}
          onTodoClick={(todo) =>
            setOpsStatuses((prev) => ({
              ...prev,
              [todo.id]: cycleStatus(todo.status),
            }))
          }
        />
      ) : (
        <WorkflowView
          todos={setupTodos}
          onTodoClick={(todo) =>
            setSetupStatuses((prev) => ({
              ...prev,
              [todo.id]: cycleStatus(todo.status),
            }))
          }
        />
      )}
    </Stack>
  );
}
