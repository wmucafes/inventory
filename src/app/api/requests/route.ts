import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const { session, error } = await requireRole(request, ["cafe", "driver", "admin", "commissary"]);
    if (error) return error;

    const body = (await request.json()) as {
      items: { sku: string; qty: number }[];
      notes?: string;
      requested_by_name?: string;
      cafe_code?: string;
    };

    const lines = (body.items ?? []).filter((l) => l.qty > 0);
    const notes = body.notes?.trim() || null;
    const requestedByName = body.requested_by_name?.trim() || null;
    const cafeCode = body.cafe_code?.trim() || null;

    if (lines.length === 0) {
      return NextResponse.json({ error: "Add at least one item to your request." }, { status: 400 });
    }

    if (!requestedByName) {
      return NextResponse.json({ error: "Please enter your name before submitting." }, { status: 400 });
    }

    if (!cafeCode) {
      return NextResponse.json({ error: "Please select a cafe before submitting." }, { status: 400 });
    }

    const pool = getDbPool();

    const reqResult = await pool.query<{ id: number }>(
      `INSERT INTO stock_requests (cafe_id, request_date, status, submitted_by, submitted_at, notes, requested_by_name)
       SELECT id, CURRENT_DATE, 'submitted', $1, NOW(), $2, $3
       FROM cafes WHERE code = $4 AND active = TRUE
       RETURNING id`,
      [session.email, notes, requestedByName, cafeCode],
    );

    const requestId = reqResult.rows[0].id;

    // Insert request lines
    for (const line of lines) {
      await pool.query(
        `INSERT INTO stock_request_lines (stock_request_id, item_id, requested_qty)
         SELECT $1, id, $2 FROM items WHERE sku = $3`,
        [requestId, line.qty, line.sku],
      );
    }

    await logAudit(session.email, "request_created", "stock_request", requestId, {
      request_id: requestId,
      cafe_code: cafeCode,
      requested_by_name: requestedByName,
      item_count: lines.length,
      items: lines,
    });

    return NextResponse.json({ ok: true, requestId }, { status: 201 });
  } catch (error) {
    console.error("Failed to submit request", error);
    return NextResponse.json({ error: "Unable to submit request right now." }, { status: 500 });
  }
}
