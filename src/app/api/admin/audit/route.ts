import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";

export async function GET(request: NextRequest) {
  const { session, error } = await requireRole(request, ["admin"]);
  if (error) return error;
  void session;

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 50;
  const offset = (page - 1) * limit;

  const validFilters = ["all", "item", "stock_request", "user_access", "tag"];
  const entityFilter = validFilters.includes(filter) && filter !== "all" ? filter : null;

  const pool = getDbPool();

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM audit_log ${entityFilter ? "WHERE entity_type = $1" : ""}`,
    entityFilter ? [entityFilter] : [],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const rows = await pool.query(
    `SELECT id, actor_email, action, entity_type, entity_id, details, created_at
     FROM audit_log
     ${entityFilter ? "WHERE entity_type = $1" : ""}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    entityFilter ? [entityFilter] : [],
  );

  return NextResponse.json({ logs: rows.rows, total, page, limit }, { status: 200 });
}
