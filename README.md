# Warehouse Restock

A shared, real-time "bring from warehouse" list for a retail shop floor.
An employee sells something, searches for it, taps it, and it appears
instantly on every warehouse employee's screen. The warehouse employee
taps one button to mark it brought, and it's gone from the active list
(but kept in history) for everyone.

## How it's organized

```
db/         Postgres schema + migrations (source of truth for structure)
import/     One-time/repeatable pipeline that loads the product master
            list into the database, using ONLY the product name field —
            see "Why name-only" below.
server/     Node + TypeScript + Express backend (API + realtime + auth)
web/        React + TypeScript + Vite PWA (the app itself)
render.yaml Render blueprint for deploying server + web together
```

Each piece talks to the next only through an API contract or the
database schema, so any layer (database host, backend framework,
frontend, auth, realtime transport) can be swapped independently later
— e.g. moving off Render onto the Mac mini M4 is an environment-variable
change, not a rewrite.

## Why name-only

The supplied product master list (`Product_list.xlsx`) has 11 columns,
but only the product **name** column is actually populated with real,
reliable data — price, barcode, discount, and PLU are entirely empty,
and the HS/customs code and POS department fields don't map cleanly to
a retail category. Per instruction, only the name field is treated as
real; everything else in the schema is nullable and reserved for future
data (real prices, barcodes, supplier info) rather than fabricated now.

`legacy_code` (the source spreadsheet's internal ID) is kept only so the
same file can be re-imported without creating duplicate products — it is
not treated as a SKU.

## Local setup

Prerequisites: Node 20+, a Postgres 16 database (local, Docker, or Neon),
`psql` on your PATH.

```bash
# 1. Apply the schema
cd server
cp .env.example .env        # fill in DATABASE_URL, JWT_SECRET, etc.
npm install
npm run migrate             # runs db/migrations/*.sql in order

# 2. Import the product catalogue (idempotent — safe to re-run)
cd ../
npm install
npm run build
DATABASE_URL=postgres://... node dist/import/run-import.js /path/to/Product_list.xlsx

# 3. Create the first admin account
cd server
npm run build
DATABASE_URL=... JWT_SECRET=... npm run seed-admin -- <username> <password> "<full name>"

# 4. Run the backend
npm run dev          # http://localhost:4000

# 5. Run the frontend (separate terminal)
cd ../web
cp .env.example .env  # points at the backend above
npm install
npm run dev           # http://localhost:5173
```

## Deploying to Render + Neon

1. Create a Neon Postgres project, copy its connection string.
2. Run the schema migrations and the import script once against that
   connection string (steps 1–3 above, pointed at Neon; set `PGSSL=true`
   or leave unset — Neon requires SSL, which is the default).
3. Push this repo to GitHub, then in Render: **New → Blueprint**, point
   it at the repo — `render.yaml` defines both services.
4. Fill in the environment variables Render marks as "sync: false":
   - `warehouse-api`: `DATABASE_URL` (Neon connection string), `CORS_ORIGIN`
     (the web service's URL, once known)
   - `warehouse-web`: `VITE_API_URL` / `VITE_WS_URL` (the API service's
     URL, once known — `wss://` for the websocket)
5. Deploy. Re-deploy `warehouse-web` once you know the API's final URL,
   since Vite bakes `VITE_*` vars in at build time.

## Moving to the Mac mini later

Nothing in the backend or frontend code assumes Render or Neon
specifically — both are configured entirely through `DATABASE_URL`,
`PGSSL`, `CORS_ORIGIN`, `VITE_API_URL`, and `VITE_WS_URL`. Point
`DATABASE_URL` at a local Postgres instance, set `PGSSL=false`, run the
same `npm run build && npm start`, and the app behaves identically. A
future local AI layer (per the product brief) would sit behind its own
env-configured endpoint the same way, rather than being wired into the
application logic directly.

## What's intentionally not built yet

Per the brief, no analytics, pricing, purchasing, or AI features are
implemented — there's no real data to back them. The schema has room
for all of it (nullable price/SKU/barcode fields, a `category` column
independent of the unreliable HS code, room for a future `pgvector`
column for semantic search) without requiring a rewrite when that data
arrives.

## Reviewing flagged/ambiguous products

The import run prints how many products were flagged (`needs_review`)
and how many likely-duplicate pairs it found (`product_merge_candidates`,
using pg_trgm similarity ≥ 0.85 — chosen by inspecting this catalogue's
actual score distribution, see `import/run-import.ts` for the reasoning).
Nothing is auto-merged. A quick way to see them:

```sql
select canonical_name, review_notes from products where needs_review order by canonical_name;

select a.canonical_name, b.canonical_name, m.similarity_score
from product_merge_candidates m
join products a on a.id = m.product_a_id
join products b on b.id = m.product_b_id
where m.status = 'pending'
order by m.similarity_score desc;
```

An admin review UI for these two queues (confirm duplicate / confirm
distinct / edit brand) is the natural next increment — deliberately left
out of this MVP to keep the employee-facing workflow the focus, per the
brief's instruction to avoid unnecessary admin/dashboard surface area
until the core loop is proven.
