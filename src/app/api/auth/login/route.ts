import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDbPool } from "@/lib/db";
import { createSession, UserRole } from "@/lib/session-store";

export const runtime = "nodejs";

const GENERIC_ERROR = "Invalid email or password.";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const pool = getDbPool();
    const result = await pool.query<{
      role: string;
      cafe_id: number | null;
      password_hash: string | null;
    }>(
      `SELECT role, cafe_id, password_hash FROM user_roles WHERE email = $1`,
      [email],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return NextResponse.json({ error: "No password set for this account. Contact your administrator." }, { status: 401 });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const role = user.role as UserRole;
    const cafe_id = user.cafe_id ?? null;

    const redirectMap: Record<UserRole, string> = {
      admin: "/",
      commissary: "/",
      cafe: "/request",
      driver: "/fulfillment",
    };

    const session = await createSession(email, role, cafe_id);

    const response = NextResponse.json(
      { email, role, cafe_id, redirect: redirectMap[role] },
      { status: 200 },
    );

    response.cookies.set({
      name: "wmu_inventory_session",
      value: session.token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: session.maxAgeSec,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to log in right now." }, { status: 500 });
  }
}
