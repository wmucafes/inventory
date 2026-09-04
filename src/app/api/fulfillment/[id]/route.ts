import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, error } = await requireRole(request, ["admin", "commissary"]);
    if (error) return error;

    const { id } = await params;
    const requestId = parseInt(id, 10);

    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
    }

    const pool = getDbPool();

    await pool.query(`DELETE FROM stock_request_lines WHERE stock_request_id = $1`, [requestId]);
    const result = await pool.query(`DELETE FROM stock_requests WHERE id = $1 RETURNING id`, [requestId]);

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    await logAudit(session.email, "request_deleted", "stock_request", requestId, { request_id: requestId });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete request", error);
    return NextResponse.json({ error: "Unable to delete request right now." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, error } = await requireRole(request, ["admin", "commissary"]);
    if (error) return error;

    const { id } = await params;
    const requestId = parseInt(id, 10);

    if (isNaN(requestId)) {
      return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
    }

    const body = (await request.json()) as {
      lines: { sku: string; qty: number }[];
      fulfillment_notes?: string | null;
      fulfilled_by_name?: string;
    };

    const lines = body.lines ?? [];
    const fulfillmentNotes = body.fulfillment_notes?.trim() || null;
    const fulfilledByName = body.fulfilled_by_name?.trim() || null;

    if (lines.length === 0) {
      return NextResponse.json({ error: "No lines to fulfill." }, { status: 400 });
    }

    if (!fulfilledByName) {
      return NextResponse.json({ error: "Please enter your name before confirming fulfillment." }, { status: 400 });
    }

    const pool = getDbPool();

    // Live stock check against current on_hand_qty
    const skus = lines.map((l) => l.sku);
    const stockResult = await pool.query<{ sku: string; item_name: string; on_hand_qty: string }>(
      `SELECT i.sku, i.name AS item_name, COALESCE(b.on_hand_qty, 0)::text AS on_hand_qty
       FROM items i
       LEFT JOIN inventory_locations l ON l.code = 'COMMISSARY'
       LEFT JOIN inventory_balances b ON b.item_id = i.id AND b.location_id = l.id
       WHERE i.sku = ANY($1)`,
      [skus],
    );

    const stockMap = new Map(
      stockResult.rows.map((r) => [r.sku, { item_name: r.item_name, on_hand_qty: parseFloat(r.on_hand_qty) }]),
    );

    const issues = lines
      .filter((l) => {
        const stock = stockMap.get(l.sku);
        return !stock || l.qty > stock.on_hand_qty;
      })
      .map((l) => {
        const stock = stockMap.get(l.sku);
        return {
          sku: l.sku,
          item_name: stock?.item_name ?? l.sku,
          requested_qty: l.qty,
          on_hand_qty: stock?.on_hand_qty ?? 0,
        };
      });

    if (issues.length > 0) {
      return NextResponse.json({ issues }, { status: 409 });
    }

    // Fetch original requested_qty for each line to determine partial vs full
    const origResult = await pool.query<{ sku: string; requested_qty: string }>(
      `SELECT i.sku, srl.requested_qty::text
       FROM stock_request_lines srl
       JOIN items i ON i.id = srl.item_id
       WHERE srl.stock_request_id = $1`,
      [requestId],
    );

    const origMap = new Map(origResult.rows.map((r) => [r.sku, parseFloat(r.requested_qty)]));

    const isPartial = lines.some((l) => {
      const orig = origMap.get(l.sku);
      return orig === undefined || l.qty < orig;
    });

    const status = isPartial ? "partially_fulfilled" : "fulfilled";

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const line of lines) {
        await client.query(
          `UPDATE inventory_balances ib
           SET on_hand_qty = ib.on_hand_qty - $1, updated_at = NOW()
           FROM items i
           JOIN inventory_locations l ON l.code = 'COMMISSARY'
           WHERE i.sku = $2
             AND ib.item_id = i.id
             AND ib.location_id = l.id`,
          [line.qty, line.sku],
        );

        await client.query(
          `UPDATE stock_request_lines srl
           SET fulfilled_qty = $1
           FROM items i
           WHERE srl.stock_request_id = $2
             AND i.sku = $3
             AND srl.item_id = i.id`,
          [line.qty, requestId, line.sku],
        );
      }

      const result = await client.query(
        `UPDATE stock_requests
         SET status = $1, fulfillment_notes = $2, fulfilled_by = $3, fulfilled_by_name = $4, fulfilled_at = NOW(), updated_at = NOW()
         WHERE id = $5
         RETURNING id`,
        [status, fulfillmentNotes, session.email, fulfilledByName, requestId],
      );

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Request not found." }, { status: 404 });
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await logAudit(session.email, "request_fulfilled", "stock_request", requestId, {
      request_id: requestId,
      status,
      fulfilled_by_name: fulfilledByName,
      lines,
    });

    return NextResponse.json({ ok: true, status }, { status: 200 });
  } catch (error) {
    console.error("Failed to fulfill request", error);
    return NextResponse.json({ error: "Unable to fulfill request right now." }, { status: 500 });
  }
}
