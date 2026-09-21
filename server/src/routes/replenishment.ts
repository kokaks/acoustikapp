import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";

export const replenishmentRouter = Router();

// ── Active shared list ──────────────────────────────────────────────────
replenishmentRouter.get("/active", requireAuth, async (_req, res) => {
  const { rows } = await pool.query(`
    select ri.id, ri.total_quantity, ri.first_requested_at, ri.last_requested_at,
           p.id as product_id, p.canonical_name, p.brand
    from replenishment_items ri
    join products p on p.id = ri.product_id
    where ri.status = 'pending'
    order by ri.last_requested_at desc
  `);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.canonical_name,
      brand: r.brand,
      quantity: r.total_quantity,
      firstRequestedAt: r.first_requested_at,
      lastRequestedAt: r.last_requested_at,
    })),
  });
});

// ── Add a sold product to the list (the single most common action) ────
const addSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(999).default(1),
});

replenishmentRouter.post("/items", requireAuth, async (req, res) => {
  const parsed = addSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "productId is required (quantity optional, defaults to 1)." });
  }
  const { productId, quantity } = parsed.data;
  const employeeId = req.auth!.employeeId;

  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query(
      `insert into replenishment_items (product_id, total_quantity, last_requested_by)
       values ($1, $2, $3)
       on conflict (product_id) where status = 'pending'
       do update set
         total_quantity = replenishment_items.total_quantity + excluded.total_quantity,
         last_requested_at = now(),
         last_requested_by = excluded.last_requested_by
       returning id, total_quantity`,
      [productId, quantity, employeeId]
    );
    const item = rows[0];

    await client.query(
      `insert into replenishment_events (item_id, product_id, employee_id, event_type, quantity)
       values ($1, $2, $3, 'add', $4)`,
      [item.id, productId, employeeId, quantity]
    );

    await client.query("commit");
    res.status(201).json({ id: item.id, totalQuantity: item.total_quantity });
  } catch (err) {
    await client.query("rollback");
    if (err instanceof Error && /foreign key/i.test(err.message)) {
      return res.status(404).json({ error: "Product not found." });
    }
    throw err;
  } finally {
    client.release();
  }
});

// ── Mark as brought — disappears from active list, joins history ──────
replenishmentRouter.post("/items/:id/complete", requireAuth, async (req, res) => {
  const employeeId = req.auth!.employeeId;
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query(
      `update replenishment_items
       set status = 'completed', completed_by = $2, completed_at = now()
       where id = $1 and status = 'pending'
       returning id, product_id, total_quantity`,
      [req.params.id, employeeId]
    );
    if (!rows[0]) {
      await client.query("rollback");
      return res.status(404).json({ error: "Active item not found (already completed?)." });
    }
    const item = rows[0];

    await client.query(
      `insert into replenishment_events (item_id, product_id, employee_id, event_type, quantity)
       values ($1, $2, $3, 'complete', $4)`,
      [item.id, item.product_id, employeeId, item.total_quantity]
    );

    await client.query("commit");
    res.json({ id: item.id, status: "completed" });
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
});

// ── History — recently completed, paginated ────────────────────────────
replenishmentRouter.get("/history", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const before = req.query.before ? new Date(String(req.query.before)) : new Date();

  const { rows } = await pool.query(
    `
    select ri.id, ri.total_quantity, ri.completed_at,
           p.canonical_name, p.brand,
           req.full_name as last_requested_by_name,
           comp.full_name as completed_by_name
    from replenishment_items ri
    join products p on p.id = ri.product_id
    left join employees req on req.id = ri.last_requested_by
    left join employees comp on comp.id = ri.completed_by
    where ri.status = 'completed' and ri.completed_at < $1
    order by ri.completed_at desc
    limit $2
    `,
    [before.toISOString(), limit]
  );

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.canonical_name,
      brand: r.brand,
      quantity: r.total_quantity,
      completedAt: r.completed_at,
      requestedBy: r.last_requested_by_name,
      completedBy: r.completed_by_name,
    })),
  });
});
