import { Router } from "express";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

export const productsRouter = Router();

/**
 * Autocomplete search. Combines:
 *  - exact / prefix matching on canonical_name (ranked highest)
 *  - trigram fuzzy matching on canonical_name (typo tolerance)
 *  - exact / prefix / fuzzy matching against product_aliases
 *    (brand tokens, model tokens, admin-added abbreviations)
 * All in one indexed query — no AI call on every keystroke.
 */
productsRouter.get("/search", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length === 0) {
    return res.json({ results: [] });
  }
  const limit = Math.min(Number(req.query.limit ?? 8), 20);

  const { rows } = await pool.query(
    `
    with alias_match as (
      select product_id,
             max(similarity(alias_text, $1)) as alias_sim,
             bool_or(alias_text ilike $1 || '%') as alias_prefix
      from product_aliases
      where alias_text ilike $1 || '%' or alias_text % $1
      group by product_id
    )
    select
      p.id,
      p.canonical_name,
      p.brand,
      greatest(similarity(p.canonical_name, $1), coalesce(am.alias_sim, 0)) as score,
      (p.canonical_name ilike $1) as is_exact,
      (p.canonical_name ilike $1 || '%' or coalesce(am.alias_prefix, false)) as is_prefix
    from products p
    left join alias_match am on am.product_id = p.id
    where p.status = 'active'
      and (
        p.canonical_name ilike $1 || '%'
        or p.canonical_name % $1
        or am.product_id is not null
      )
    order by is_exact desc, is_prefix desc, score desc, p.canonical_name asc
    limit $2
    `,
    [q, limit]
  );

  res.json({
    results: rows.map((r) => ({
      id: r.id,
      name: r.canonical_name,
      brand: r.brand,
    })),
  });
});

productsRouter.get("/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `select id, canonical_name, brand, status from products where id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Product not found." });
  res.json(rows[0]);
});
