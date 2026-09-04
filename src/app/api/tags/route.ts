import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";
import { getSession } from "@/lib/session-store";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("wmu_inventory_session")?.value;
  const session = await getSession(token);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pool = getDbPool();
  const result = await pool.query<{ id: number; name: string; slug: string; item_count: string }>(
    `SELECT t.id, t.name, t.slug, COUNT(it.item_id)::text AS item_count
     FROM tags t
     LEFT JOIN item_tags it ON it.tag_id = t.id
     GROUP BY t.id, t.name, t.slug
     ORDER BY t.name ASC`,
  );
  return NextResponse.json({ tags: result.rows }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const { session, error: authError } = await requireRole(request, ["admin"]);
  if (authError) return authError;

  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Tag name is required." }, { status: 400 });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) return NextResponse.json({ error: "Tag name must contain at least one letter or number." }, { status: 400 });

  const pool = getDbPool();
  try {
    const result = await pool.query<{ id: number; name: string; slug: string }>(
      `INSERT INTO tags (name, slug) VALUES ($1, $2) RETURNING id, name, slug`,
      [name, slug],
    );
    const tag = result.rows[0];
    await logAudit(session.email, "tag_created", "tag", tag.id, { name: tag.name, slug: tag.slug });
    return NextResponse.json({ tag: { ...tag, item_count: "0" } }, { status: 201 });
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === "23505") return NextResponse.json({ error: "A tag with that name already exists." }, { status: 409 });
    console.error("Failed to create tag", err);
    return NextResponse.json({ error: "Unable to create tag right now." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { session, error: authError } = await requireRole(request, ["admin"]);
  if (authError) return authError;

  const body = (await request.json()) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "Tag ID is required." }, { status: 400 });

  const pool = getDbPool();
  const tagRow = await pool.query<{ id: number; name: string; slug: string }>(`SELECT id, name, slug FROM tags WHERE id = $1`, [body.id]);
  if (tagRow.rowCount === 0) return NextResponse.json({ error: "Tag not found." }, { status: 404 });
  await pool.query(`DELETE FROM tags WHERE id = $1`, [body.id]);
  await logAudit(session.email, "tag_deleted", "tag", body.id, { name: tagRow.rows[0].name, slug: tagRow.rows[0].slug });
  return NextResponse.json({ ok: true }, { status: 200 });
}
