export const ANALYTICS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dashboard_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dashboard_sessions_user_idx ON dashboard_sessions (user_id);
CREATE INDEX IF NOT EXISTS dashboard_sessions_expires_idx ON dashboard_sessions (expires_at);

CREATE TABLE IF NOT EXISTS analytics_orders (
  id uuid PRIMARY KEY,
  external_id text NOT NULL,
  channel text NOT NULL,
  ordered_at timestamptz NOT NULL,
  revenue numeric(12,2) NOT NULL,
  fees numeric(12,2) NOT NULL DEFAULT 0,
  shipping_cost numeric(12,2) NOT NULL DEFAULT 0,
  marketing_cost numeric(12,2) NOT NULL DEFAULT 0,
  state text,
  customer_email text,
  is_returning boolean NOT NULL DEFAULT false,
  traffic_source text,
  UNIQUE (channel, external_id)
);
CREATE INDEX IF NOT EXISTS analytics_orders_ordered_at_idx ON analytics_orders (ordered_at);
CREATE INDEX IF NOT EXISTS analytics_orders_channel_idx ON analytics_orders (channel);

CREATE TABLE IF NOT EXISTS analytics_order_lines (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES analytics_orders(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_sku text,
  category text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  line_revenue numeric(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_order_lines_order_idx ON analytics_order_lines (order_id);

CREATE TABLE IF NOT EXISTS analytics_daily_traffic (
  date date NOT NULL,
  channel text NOT NULL DEFAULT 'website',
  visits integer NOT NULL DEFAULT 0,
  unique_visitors integer NOT NULL DEFAULT 0,
  product_views integer NOT NULL DEFAULT 0,
  add_to_carts integer NOT NULL DEFAULT 0,
  checkouts integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  source_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (date, channel)
);

CREATE TABLE IF NOT EXISTS analytics_daily_ad_spend (
  date date NOT NULL,
  platform text NOT NULL,
  spend numeric(12,2) NOT NULL DEFAULT 0,
  platform_reported_sales numeric(12,2) NOT NULL DEFAULT 0,
  platform_reported_orders integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, platform)
);

CREATE TABLE IF NOT EXISTS analytics_search_keywords (
  query text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  visits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (query, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS analytics_expenses (
  id uuid PRIMARY KEY,
  spent_at date NOT NULL,
  category text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  amount numeric(12,2) NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('cogs', 'sga')),
  product_line text
);
CREATE INDEX IF NOT EXISTS analytics_expenses_spent_at_idx ON analytics_expenses (spent_at);

CREATE TABLE IF NOT EXISTS analytics_cash_forecast (
  month_end date PRIMARY KEY,
  beginning_balance numeric(12,2) NOT NULL,
  collections numeric(12,2) NOT NULL,
  freight_and_fees numeric(12,2) NOT NULL,
  marketing numeric(12,2) NOT NULL,
  website numeric(12,2) NOT NULL DEFAULT 0,
  manufacturing numeric(12,2) NOT NULL DEFAULT 0,
  ending_balance numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_abandoned_carts (
  period_start date NOT NULL,
  period_end date NOT NULL,
  abandoned integer NOT NULL DEFAULT 0,
  recovered integer NOT NULL DEFAULT 0,
  recovered_revenue numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (period_start, period_end)
);

CREATE TABLE IF NOT EXISTS analytics_sync_runs (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'ok', 'error')),
  message text,
  rows_touched integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS analytics_sync_runs_source_started_idx
  ON analytics_sync_runs (source, started_at DESC);
`
