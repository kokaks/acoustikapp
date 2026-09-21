-- 0001_init.sql
-- Warehouse Replenishment App — initial schema
--
-- DESIGN NOTE: The only reliable field in the supplied source data is the
-- product NAME. Everything else in the original export (price, barcode,
-- discount, PLU, HS/customs code, POS department, weight flag) was either
-- entirely empty or constant/meaningless, so none of it is imported or
-- relied upon. `legacy_code` is kept purely as an idempotency key so the
-- same source file can be re-imported without creating duplicate rows —
-- it is NOT treated as a SKU or barcode. All commerce fields (sku, barcode,
-- price, supplier info) are nullable and reserved for real data later.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fuzzy / typo-tolerant search
create extension if not exists unaccent;   -- diacritic-insensitive matching

-- ─────────────────────────────────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────────────────────────────────
create table products (
  id                 uuid primary key default gen_random_uuid(),

  -- provenance / idempotent re-import key. Not a SKU.
  legacy_code        text unique,

  -- the untouched original string from the source name column — never edited.
  source_name_raw    text not null,

  -- cleaned, human-facing name shown in the UI.
  canonical_name     text not null,

  -- derived fields, extracted from the name with varying confidence.
  brand              text,
  brand_confidence   text not null default 'unknown'
                       check (brand_confidence in ('confirmed', 'guessed', 'unknown')),

  -- reserved for real data that does not exist yet — never fabricated.
  category           text,
  sku                text,
  supplier_sku       text,
  barcode            text,
  unit_price         numeric(12,2),
  currency           text default 'AMD',

  status             text not null default 'active'
                       check (status in ('active', 'discontinued')),

  needs_review       boolean not null default false,
  review_notes       text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index products_brand_idx on products (brand);
create index products_needs_review_idx on products (needs_review) where needs_review;

-- Full-text search vector: canonical name + brand. Aliases are searched
-- separately (see product_aliases) and merged in the application query.
alter table products add column search_tsv tsvector
  generated always as (
    to_tsvector('simple', coalesce(canonical_name, '') || ' ' || coalesce(brand, ''))
  ) stored;

create index products_search_tsv_idx on products using gin (search_tsv);
create index products_name_trgm_idx on products using gin (canonical_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────
-- PRODUCT ALIASES — abbreviations, alt spellings, parsed name tokens,
-- admin-added shortcuts. Never invented wholesale; seeded from parsing
-- and extended over time by admins/employees using real search behaviour.
-- ─────────────────────────────────────────────────────────────────────────
create table product_aliases (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  alias_text    text not null,
  alias_type    text not null
                  check (alias_type in ('brand_token', 'model_token', 'descriptor_token',
                                         'abbreviation', 'misspelling', 'admin_added')),
  source        text not null default 'import'
                  check (source in ('import', 'admin', 'system')),
  created_at    timestamptz not null default now(),
  unique (product_id, alias_text)
);

create index product_aliases_text_trgm_idx on product_aliases using gin (alias_text gin_trgm_ops);
create index product_aliases_product_id_idx on product_aliases (product_id);

-- ─────────────────────────────────────────────────────────────────────────
-- MERGE / DUPLICATE REVIEW — never silently merged. Flagged for a human.
-- ─────────────────────────────────────────────────────────────────────────
create table product_merge_candidates (
  id                  uuid primary key default gen_random_uuid(),
  product_a_id        uuid not null references products(id) on delete cascade,
  product_b_id        uuid not null references products(id) on delete cascade,
  similarity_score    real not null,
  reason              text,
  status              text not null default 'pending'
                        check (status in ('pending', 'confirmed_duplicate', 'confirmed_distinct', 'merged')),
  reviewed_by         uuid,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  check (product_a_id <> product_b_id)
);

create unique index product_merge_candidates_pair_idx
  on product_merge_candidates (least(product_a_id, product_b_id), greatest(product_a_id, product_b_id));

-- ─────────────────────────────────────────────────────────────────────────
-- EMPLOYEES / AUTH
-- ─────────────────────────────────────────────────────────────────────────
create table employees (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  username       text not null unique,
  password_hash  text not null,
  role           text not null default 'employee' check (role in ('employee', 'admin')),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- REPLENISHMENT — the actual product feature.
--
-- `replenishment_items`: one row per product currently in play. While
-- status='pending' it IS the shared active list (fast to query, trivially
-- aggregates repeated "sold again" adds into one row). When marked
-- brought, status flips to 'completed' — it disappears from the active
-- view instantly (just a WHERE filter) but the row itself is never
-- deleted, so it doubles as history.
--
-- `replenishment_events`: append-only audit trail. Every add and every
-- completion is logged here permanently, independent of aggregation.
-- ─────────────────────────────────────────────────────────────────────────
create table replenishment_items (
  id                 uuid primary key default gen_random_uuid(),
  product_id         uuid not null references products(id),
  status             text not null default 'pending' check (status in ('pending', 'completed')),
  total_quantity     integer not null default 1 check (total_quantity > 0),

  first_requested_at timestamptz not null default now(),
  last_requested_at  timestamptz not null default now(),
  last_requested_by  uuid references employees(id),

  completed_by       uuid references employees(id),
  completed_at       timestamptz,

  created_at         timestamptz not null default now()
);

-- Only one active (pending) row per product at a time — repeats aggregate
-- into it instead of creating duplicate list entries.
create unique index replenishment_items_one_pending_per_product
  on replenishment_items (product_id) where status = 'pending';

create index replenishment_items_status_idx on replenishment_items (status);
create index replenishment_items_completed_at_idx on replenishment_items (completed_at desc);

create table replenishment_events (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references replenishment_items(id) on delete cascade,
  product_id    uuid not null references products(id),
  employee_id   uuid references employees(id),
  event_type    text not null check (event_type in ('add', 'complete')),
  quantity      integer,
  created_at    timestamptz not null default now()
);

create index replenishment_events_item_id_idx on replenishment_events (item_id);
create index replenishment_events_product_id_idx on replenishment_events (product_id);
create index replenishment_events_created_at_idx on replenishment_events (created_at desc);

-- keep updated_at fresh on products
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();
