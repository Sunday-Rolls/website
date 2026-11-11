export const ANALYTICS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS dashboard_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing accounts predate is_admin. Add the column nullable, promote those
-- rows once, then require the flag. Later migrates match no nulls.
ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS is_admin boolean;
UPDATE dashboard_users SET is_admin = true WHERE is_admin IS NULL;
ALTER TABLE dashboard_users ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE dashboard_users ALTER COLUMN is_admin SET NOT NULL;

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
  source text NOT NULL DEFAULT 'sales-tracker',
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
ALTER TABLE analytics_orders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sales-tracker';

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
  region_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (date, channel)
);
ALTER TABLE analytics_daily_traffic
  ADD COLUMN IF NOT EXISTS region_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS analytics_daily_ad_spend (
  date date NOT NULL,
  platform text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  spend numeric(12,2) NOT NULL DEFAULT 0,
  platform_reported_sales numeric(12,2) NOT NULL DEFAULT 0,
  platform_reported_orders integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, platform, campaign)
);

ALTER TABLE analytics_daily_ad_spend ADD COLUMN IF NOT EXISTS sessions integer NOT NULL DEFAULT 0;

-- Upgrade older installs that used (date, platform) only
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_ad_spend' AND column_name = 'platform'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_ad_spend' AND column_name = 'campaign'
  ) THEN
    ALTER TABLE analytics_daily_ad_spend ADD COLUMN campaign text NOT NULL DEFAULT '';
    ALTER TABLE analytics_daily_ad_spend DROP CONSTRAINT analytics_daily_ad_spend_pkey;
    ALTER TABLE analytics_daily_ad_spend ADD PRIMARY KEY (date, platform, campaign);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS analytics_google_ads_daily (
  date date NOT NULL,
  campaign_id text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  conversions numeric(12,2) NOT NULL DEFAULT 0,
  conversion_value numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (date, campaign_id)
);

CREATE TABLE IF NOT EXISTS analytics_google_ads_search_terms (
  term text NOT NULL,
  campaign text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end date NOT NULL,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  conversions numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (term, campaign)
);

CREATE TABLE IF NOT EXISTS analytics_search_keywords (
  query text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  visits integer NOT NULL DEFAULT 0,
  PRIMARY KEY (query, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS analytics_daily_product_views (
  date date NOT NULL,
  product_name text NOT NULL,
  category text,
  views integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, product_name)
);
CREATE INDEX IF NOT EXISTS analytics_daily_product_views_date_idx
  ON analytics_daily_product_views (date);

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

CREATE TABLE IF NOT EXISTS analytics_customer_orders (
  channel text NOT NULL,
  external_id text NOT NULL,
  ordered_at timestamptz NOT NULL,
  email text NOT NULL,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  PRIMARY KEY (channel, external_id)
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

-- Small per-integration state (e.g. Etsy's rotating OAuth refresh token), keyed by integration name.
CREATE TABLE IF NOT EXISTS analytics_integration_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Etsy detail data from the Open API (see docs/ETSY_SYNC.md). Money in dollars.
CREATE TABLE IF NOT EXISTS analytics_etsy_receipts (
  receipt_id text PRIMARY KEY,
  ordered_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT '',
  buyer_user_id text,
  grandtotal numeric(12,2) NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  shipping_charged numeric(12,2) NOT NULL DEFAULT 0,
  tax numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  refunded numeric(12,2) NOT NULL DEFAULT 0,
  shop_coupon numeric(12,2) NOT NULL DEFAULT 0,
  buyer_coupon numeric(12,2) NOT NULL DEFAULT 0,
  units integer NOT NULL DEFAULT 0,
  is_shipped boolean NOT NULL DEFAULT false,
  shipped_at timestamptz,
  processing_fees numeric(12,2),
  actual_fees numeric(12,2),
  label_cost numeric(12,2),
  offsite_ads_fee numeric(12,2),
  net numeric(12,2),
  payment_synced boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_etsy_receipts_ordered_at_idx ON analytics_etsy_receipts (ordered_at);

CREATE TABLE IF NOT EXISTS analytics_etsy_fees_daily (
  date date NOT NULL,
  ledger_type text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  entries integer NOT NULL DEFAULT 0,
  PRIMARY KEY (date, ledger_type)
);

CREATE TABLE IF NOT EXISTS analytics_etsy_listings (
  listing_id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  url text,
  state text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 0,
  favorites integer NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_etsy_reviews (
  review_key text PRIMARY KEY,
  listing_id text,
  transaction_id text,
  rating integer NOT NULL,
  review text,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_etsy_reviews_created_idx ON analytics_etsy_reviews (created_at);

CREATE TABLE IF NOT EXISTS analytics_etsy_shop_daily (
  date date PRIMARY KEY,
  shop_name text NOT NULL DEFAULT '',
  url text,
  favorites integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  review_average numeric(4,2),
  total_sold integer NOT NULL DEFAULT 0,
  active_listings integer NOT NULL DEFAULT 0
);
`
