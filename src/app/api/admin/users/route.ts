import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { session, error } = await requireRole(request, ["admin"]);
  if (error) return error;
  void session;

  const pool = getDbPool();
  const result = await pool.query<{ id: number; email: string; role: string; cafe_id: number | null; cafe_name: string | null; created_at: string }>(
    `SELECT ur.id, ur.email, ur.role, ur.cafe_id, c.name AS cafe_name, ur.created_at
     FROM user_roles ur
     LEFT JOIN cafes c ON c.id = ur.cafe_id
     ORDER BY ur.created_at ASC`,
  );
  return NextResponse.json({ users: result.rows }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireRole(request, ["admin"]);
  if (error) return error;
  void session;

  const body = (await request.json()) as { email?: string; role?: string; cafe_id?: number | null; password?: string };
  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim();
  const cafe_id = body.cafe_id ?? null;
  const password = body.password ?? "";

  if (!email || !role) {
    return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
  }

  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const validRoles = ["admin", "commissary", "cafe", "driver"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (!email.endsWith("@wmich.edu")) {
    return NextResponse.json({ error: "Only @wmich.edu emails are allowed." }, { status: 400 });
  }

  // cafe_id only makes sense for the cafe role
  const resolvedCafeId = role === "cafe" ? cafe_id : null;

  const passwordHash = await bcrypt.hash(password, 12);
  const pool = getDbPool();
  try {
    const result = await pool.query<{ id: number; email: string; role: string; cafe_id: number | null; cafe_name: string | null; created_at: string }>(
      `INSERT INTO user_roles (email, role, cafe_id, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, cafe_id = EXCLUDED.cafe_id, password_hash = EXCLUDED.password_hash
       RETURNING id, email, role, cafe_id, created_at`,
      [email, role, resolvedCafeId, passwordHash],
    );
    const user = result.rows[0];

    // Fetch cafe_name for the response
    let cafe_name: string | null = null;
    if (user.cafe_id) {
      const cafeRow = await pool.query<{ name: string }>(`SELECT name FROM cafes WHERE id = $1`, [user.cafe_id]);
      cafe_name = cafeRow.rows[0]?.name ?? null;
    }

    await logAudit(session!.email, "access_granted", "user_access", email, { target_email: email, role, cafe_id: resolvedCafeId });
    return NextResponse.json({ user: { ...user, cafe_name } }, { status: 201 });
  } catch (err) {
    console.error("Failed to add user", err);
    return NextResponse.json({ error: "Unable to add user right now." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error } = await requireRole(request, ["admin"]);
  if (error) return error;

  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

  if (email === "gregory.macleery@wmich.edu") {
    return NextResponse.json({ error: "Cannot remove the primary admin account." }, { status: 403 });
  }

  if (email === session!.email) {
    return NextResponse.json({ error: "You cannot remove your own access." }, { status: 403 });
  }

  const pool = getDbPool();
  await pool.query(`DELETE FROM user_roles WHERE email = $1`, [email]);
  await logAudit(session!.email, "access_revoked", "user_access", email, { target_email: email });
  return NextResponse.json({ ok: true }, { status: 200 });
}
