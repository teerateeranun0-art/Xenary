-- XENARY Store Relational Schema for PostgreSQL & Supabase
-- Run this SQL in Supabase SQL Editor (or let the PostgreSQL adapter apply it automatically).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  pass TEXT NOT NULL DEFAULT '',
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  firebase_uid TEXT,
  email TEXT,
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  ban_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  exp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions (exp);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  channel TEXT,
  name TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0,
  sold INTEGER NOT NULL DEFAULT 0,
  best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  key_based BOOLEAN NOT NULL DEFAULT TRUE,
  img TEXT NOT NULL DEFAULT '/assets/img/hero.jpg',
  plans JSONB NOT NULL DEFAULT '[]'::jsonb,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  download_url TEXT NOT NULL DEFAULT '',
  tutorial_video TEXT NOT NULL DEFAULT '',
  unused_keys INTEGER NOT NULL DEFAULT 0,
  price_from NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updating BOOLEAN NOT NULL DEFAULT FALSE,
  status_mode TEXT NOT NULL DEFAULT 'normal',
  update_note TEXT NOT NULL DEFAULT '',
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);

CREATE TABLE IF NOT EXISTS product_keys (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  plan_label TEXT,
  key_value TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  order_id TEXT,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_keys_lookup ON product_keys (product_id, is_used);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id TEXT NOT NULL,
  product JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT '฿',
  contact TEXT,
  keys_delivered JSONB NOT NULL DEFAULT '[]'::jsonb,
  download_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);

CREATE TABLE IF NOT EXISTS topups (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  method TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  voucher TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topups_uid ON topups (uid);

CREATE TABLE IF NOT EXISTS manual_topups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  channel_id TEXT NOT NULL DEFAULT 'kbank',
  channel_name TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  slip_url TEXT,
  qr_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE manual_topups ADD COLUMN IF NOT EXISTS admin_note TEXT;

CREATE INDEX IF NOT EXISTS idx_manual_topups_user_id ON manual_topups (user_id);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  per_user_limit INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon_uses (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupon_uses_lookup ON coupon_uses (coupon_id, user_id);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT 'ประกาศ',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',
  bank_name TEXT NOT NULL DEFAULT '',
  account_no TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  qr TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS support_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  handle TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_settings (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Supabase Row Level Security (RLS)
-- Express uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS) or direct PostgreSQL.
-- Public storefront tables allow anonymous read; sensitive tables are locked.
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Public read products') THEN
    CREATE POLICY "Public read products" ON products FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'news' AND policyname = 'Public read news') THEN
    CREATE POLICY "Public read news" ON news FOR SELECT USING (published = TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_channels' AND policyname = 'Public read enabled channels') THEN
    CREATE POLICY "Public read enabled channels" ON payment_channels FOR SELECT USING (enabled = TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_links' AND policyname = 'Public read enabled support links') THEN
    CREATE POLICY "Public read enabled support links" ON support_links FOR SELECT USING (enabled = TRUE);
  END IF;
END $$;
