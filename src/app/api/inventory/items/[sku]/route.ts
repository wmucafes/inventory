import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const { session, error } = await requireRole(request, ["admin", "commissary"]);
    if (error) return error;

    const { sku } = await params;

    if (!sku) {
      return NextResponse.json({ error: "SKU is required." }, { status: 400 });
    }

    const pool = getDbPool();

    await pool.query(
      `WITH target AS (SELECT id FROM items WHERE sku = $1)
       DELETE FROM inventory_balances WHERE item_id IN (SELECT id FROM target)`,
      [sku],
    );

    await pool.query(
      `WITH target AS (SELECT id FROM items WHERE sku = $1)
       DELETE FROM item_prices WHERE item_id IN (SELECT id FROM target)`,
      [sku],
    );

    await pool.query(
      `WITH target AS (SELECT id FROM items WHERE sku = $1)
       DELETE FROM stock_request_lines WHERE item_id IN (SELECT id FROM target)`,
      [sku],
    );

    const result = await pool.query(
      `DELETE FROM items WHERE sku = $1 RETURNING sku`,
      [sku],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }

    await logAudit(session.email, "item_deleted", "item", sku, { sku });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete item", error);
    return NextResponse.json({ error: "Unable to delete item right now." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const { session, error } = await requireRole(request, ["admin", "commissary"]);
    if (error) return error;

    const { sku } = await params;
    const body = (await request.json()) as {
      name?: string;
      unit_type?: string;
      units_per_case?: number | null;
      case_price?: number | null;
      unit_price?: number | null;
      on_hand_qty?: number;
      description?: string | null;
      cafe_ids?: number[];
      tag_ids?: number[];
      category?: string;
    };

    const pool = getDbPool();

    const validCategories = ["food", "nonfood", "produce"];
    const category = validCategories.includes(body.category ?? "") ? body.category! : "food";

    // Update items table
    await pool.query(
      `UPDATE items
       SET name = $1, unit_type = $2, units_per_case = $3, description = $4, category = $5, updated_at = NOW()
       WHERE sku = $6`,
      [body.name, body.unit_type, body.units_per_case ?? null, body.description?.trim() ?? null, category, sku],
    );

    // Update current price row (effective_to IS NULL)
    await pool.query(
      `UPDATE item_prices
       SET price_per_unit = $1::numeric, case_price = $2::numeric, updated_at = NOW()
       WHERE item_id = (SELECT id FROM items WHERE sku = $3)
         AND effective_to IS NULL`,
      [body.unit_price ?? null, body.case_price ?? null, sku],
    );

    // Upsert on-hand balance — insert if missing, update if exists
    await pool.query(
      `INSERT INTO inventory_balances (location_id, item_id, on_hand_qty)
       SELECT l.id, i.id, $1
       FROM inventory_locations l, items i
       WHERE l.code = 'COMMISSARY' AND i.sku = $2
       ON CONFLICT (location_id, item_id)
       DO UPDATE SET on_hand_qty = EXCLUDED.on_hand_qty, updated_at = NOW()`,
      [body.on_hand_qty ?? 0, sku],
    );

    // Replace cafe visibility rows BEFORE the final SELECT so response has correct cafe_ids
    if (Array.isArray(body.cafe_ids)) {
      try {
        await pool.query(
          `DELETE FROM item_cafe_visibility WHERE item_id = (SELECT id FROM items WHERE sku = $1)`,
          [sku],
        );
        for (const cafeId of body.cafe_ids) {
          await pool.query(
            `INSERT INTO item_cafe_visibility (item_id, cafe_id)
             SELECT id, $1 FROM items WHERE sku = $2
             ON CONFLICT DO NOTHING`,
            [cafeId, sku],
          );
        }
      } catch (visErr) {
        console.error(`[cafe_visibility] FAILED for sku=${sku}:`, visErr);
      }
    }

    // Replace tag rows
    if (Array.isArray(body.tag_ids)) {
      try {
        await pool.query(
          `DELETE FROM item_tags WHERE item_id = (SELECT id FROM items WHERE sku = $1)`,
          [sku],
        );
        for (const tagId of body.tag_ids) {
          await pool.query(
            `INSERT INTO item_tags (item_id, tag_id)
             SELECT id, $1 FROM items WHERE sku = $2
             ON CONFLICT DO NOTHING`,
            [tagId, sku],
          );
        }
      } catch (tagErr) {
        console.error(`[item_tags] FAILED for sku=${sku}:`, tagErr);
      }
    }

    // Return updated row
    const result = await pool.query(
      `SELECT
         i.sku,
         i.name AS item_name,
         i.description,
         i.unit_type,
         i.units_per_case::text,
         NULL AS case_size,
         COALESCE(b.on_hand_qty, 0)::text AS on_hand_qty,
         ip.case_price::text,
         ip.price_per_unit::text AS unit_price,
         COALESCE(
           (SELECT json_agg(icv.cafe_id ORDER BY icv.cafe_id)
            FROM item_cafe_visibility icv WHERE icv.item_id = i.id),
           '[]'::json
         ) AS cafe_ids
       FROM items i
       LEFT JOIN inventory_locations l ON l.code = 'COMMISSARY'
       LEFT JOIN inventory_balances b ON b.item_id = i.id AND b.location_id = l.id
       LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.effective_to IS NULL
       WHERE i.sku = $1`,
      [sku],
    );

    const item = result.rows[0];
    await logAudit(session.email, "item_edited", "item", sku, {
      sku,
      name: body.name,
      unit_type: body.unit_type,
      units_per_case: body.units_per_case,
      on_hand_qty: body.on_hand_qty,
      unit_price: body.unit_price,
      case_price: body.case_price,
    });

    return NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    console.error("Failed to update item", error);
    return NextResponse.json({ error: "Unable to update item right now." }, { status: 500 });
  }
}
