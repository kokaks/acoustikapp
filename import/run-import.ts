/**
 * Import pipeline for the product master list.
 *
 * - Reads the supplied Excel file (source of truth: product NAME only).
 * - Is idempotent: re-running with the same file updates existing products
 *   (matched by legacy_code) instead of creating duplicates.
 * - Never deletes or silently merges anything. Ambiguous rows are inserted
 *   normally but flagged (needs_review) with human-readable notes.
 * - After loading, runs a real pg_trgm similarity pass to find likely
 *   duplicate PAIRS across different legacy_codes and records them in
 *   product_merge_candidates for manual review — never auto-merged.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx ts-node import/run-import.ts <path-to-xlsx>
 */
import * as XLSX from "xlsx";
import { Pool } from "pg";
import { parseProductName } from "./parse-name";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL env var is required.");
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: run-import.ts <path-to-xlsx>");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// Column index 0 = legacy code, column index 2 = product name.
// (See README for why every other column is ignored.)
const LEGACY_CODE_COL = 0;
const NAME_COL = 2;

function loadRows(path: string): { legacyCode: string; name: string }[] {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const out: { legacyCode: string; name: string }[] = [];
  for (const r of rows.slice(1)) {
    const name = r[NAME_COL];
    const code = r[LEGACY_CODE_COL];
    if (!name || String(name).trim() === "") continue;
    if (code == null && typeof name === "number") continue; // spurious footer row
    out.push({ legacyCode: String(code ?? "").trim(), name: String(name).trim() });
  }
  return out;
}

async function upsertProduct(client: import("pg").PoolClient, parsed: ReturnType<typeof parseProductName>) {
  const { rows } = await client.query(
    `insert into products
       (legacy_code, source_name_raw, canonical_name, brand, brand_confidence, needs_review, review_notes)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (legacy_code) do update set
       source_name_raw = excluded.source_name_raw,
       canonical_name  = excluded.canonical_name,
       brand           = excluded.brand,
       brand_confidence = excluded.brand_confidence,
       needs_review    = excluded.needs_review,
       review_notes    = excluded.review_notes
     returning id`,
    [
      parsed.legacyCode || null,
      parsed.sourceNameRaw,
      parsed.canonicalName,
      parsed.brand.brand,
      parsed.brand.confidence,
      parsed.needsReview,
      parsed.reviewNotes.join(" | ") || null,
    ]
  );
  const productId = rows[0].id as string;

  // replace aliases for this product with the freshly parsed set
  await client.query(`delete from product_aliases where product_id = $1 and source = 'import'`, [productId]);
  for (const alias of parsed.aliasTokens) {
    await client.query(
      `insert into product_aliases (product_id, alias_text, alias_type, source)
       values ($1, $2, $3, 'import')
       on conflict (product_id, alias_text) do nothing`,
      [productId, alias.text, alias.type]
    );
  }
  return productId;
}

async function findDuplicateCandidates(client: import("pg").PoolClient) {
  // Real trigram similarity across canonical_name, excluding exact-same-row
  // and pairs already recorded. Threshold chosen empirically by sweeping
  // scores against this actual catalogue: below ~0.85 the results are
  // dominated by genuinely distinct products that just share a brand +
  // model prefix (e.g. cables/cases differing only by length or size —
  // "Cordial CCM 0,5 FM" vs "Cordial CCM 1 FM"), which would flood a human
  // reviewer with false positives. At 0.85+ matches are almost entirely
  // real near-duplicates (casing/typo variants, e.g. "Fender ... WN Կիթառ"
  // vs "... WN կիթառ") or truly ambiguous pairs worth a human's attention.
  const { rows } = await client.query(`
    select a.id as a_id, b.id as b_id,
           similarity(a.canonical_name, b.canonical_name) as score
    from products a
    join products b on a.id < b.id
    where similarity(a.canonical_name, b.canonical_name) > 0.85
  `);

  let inserted = 0;
  for (const row of rows) {
    const res = await client.query(
      `insert into product_merge_candidates (product_a_id, product_b_id, similarity_score, reason)
       values ($1, $2, $3, 'trigram_similarity')
       on conflict do nothing`,
      [row.a_id, row.b_id, row.score]
    );
    inserted += res.rowCount ?? 0;
  }
  return { scanned: rows.length, inserted };
}

async function main() {
  const rows = loadRows(filePath);
  console.log(`Loaded ${rows.length} usable rows from ${filePath}`);

  const client = await pool.connect();
  let created = 0;
  let reviewFlagged = 0;
  try {
    await client.query("begin");
    for (const row of rows) {
      const parsed = parseProductName(row.legacyCode, row.name);
      await upsertProduct(client, parsed);
      created++;
      if (parsed.needsReview) reviewFlagged++;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
  console.log(`Upserted ${created} products (${reviewFlagged} flagged for review).`);

  const dupClient = await pool.connect();
  try {
    const { scanned, inserted } = await findDuplicateCandidates(dupClient);
    console.log(`Duplicate-candidate scan: ${scanned} pairs above threshold, ${inserted} new candidates recorded.`);
  } finally {
    dupClient.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
