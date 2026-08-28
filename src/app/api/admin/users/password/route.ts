import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  const { session, error } = await requireRole(request, ["admin"]);
  if (error) return error;

  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);
  const pool = getDbPool();

  const result = await pool.query(
    `UPDATE user_roles SET password_hash = $1 WHERE email = $2 RETURNING email`,
    [hash, email],
  );

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  await logAudit(session!.email, "password_reset", "user_access", email, { target_email: email });
  return NextResponse.json({ ok: true }, { status: 200 });
}
