import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { session, error } = await requireRole(request, ["admin", "commissary"]);
    if (error) return error;

    const { id } = await params;
    const requestId = parseInt(id, 10);
    if (isNaN(requestId)) return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });

    const body = (await request.json()) as { recorded_by_name?: string };
    const recordedByName = body.recorded_by_name?.trim() || null;

    if (!recordedByName) {
      return NextResponse.json({ error: "Please enter your name before recording." }, { status: 400 });
    }

    const pool = getDbPool();
    const result = await pool.query(
      `UPDATE stock_requests
       SET status = 'recorded', recorded_by = $1, recorded_by_name = $2, recorded_at = NOW(), updated_at = NOW()
       WHERE id = $3
         AND status IN ('fulfilled', 'partially_fulfilled')
       RETURNING id`,
      [session.email, recordedByName, requestId],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Request not found or not in a fulfillable state." }, { status: 404 });
    }

    await logAudit(session.email, "request_recorded", "stock_request", requestId, {
      request_id: requestId,
      recorded_by_name: recordedByName,
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to record request", error);
    return NextResponse.json({ error: "Unable to record request right now." }, { status: 500 });
  }
}
