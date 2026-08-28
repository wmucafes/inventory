import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireRole } from "@/lib/require-role";

export async function GET(request: NextRequest) {
  const { error } = await requireRole(request, ["admin", "commissary"]);
  if (error) return error;

  const pool = getDbPool();

  const result = await pool.query<{
    sku: string;
    name: string;
    category: string;
    unit_type: string;
    case_size: string | null;
    units_per_case: number | null;
    case_price: string | null;
    price_per_unit: string | null;
    description: string | null;
    tags: string;
    cafes: string;
  }>(`
    SELECT
      i.sku,
      i.name,
      i.category,
      i.unit_type,
      i.case_size,
      i.units_per_case,
      ip.case_price::text AS case_price,
      ip.price_per_unit::text AS price_per_unit,
      i.description,
      COALESCE(STRING_AGG(DISTINCT t.name, ', ' ORDER BY t.name), '') AS tags,
      COALESCE(STRING_AGG(DISTINCT c.name, ', ' ORDER BY c.name), '') AS cafes
    FROM items i
    LEFT JOIN item_prices ip ON ip.item_id = i.id AND ip.effective_from = (
      SELECT MAX(effective_from) FROM item_prices WHERE item_id = i.id
    )
    LEFT JOIN item_tags it ON it.item_id = i.id
    LEFT JOIN tags t ON t.id = it.tag_id
    LEFT JOIN item_cafe_visibility icv ON icv.item_id = i.id
    LEFT JOIN cafes c ON c.id = icv.cafe_id
    GROUP BY i.id, i.sku, i.name, i.category, i.unit_type, i.case_size,
             i.units_per_case, ip.case_price, ip.price_per_unit, i.description
    ORDER BY i.category, i.name
  `);

  const headers = [
    "SKU",
    "Item Name",
    "Category",
    "Unit Type",
    "Case Size",
    "Units Per Case",
    "Case Price ($)",
    "Unit Price ($)",
    "Description",
    "Tags",
    "Visible To Cafes",
  ];

  function escapeCsv(value: string | number | null | undefined): string {
    const s = value == null ? "" : String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const CATEGORY_LABELS: Record<string, string> = {
    food: "Food",
    nonfood: "Non-Food",
    produce: "Produce",
  };

  const rows = result.rows.map((r) => [
    escapeCsv(r.sku),
    escapeCsv(r.name),
    escapeCsv(CATEGORY_LABELS[r.category] ?? r.category),
    escapeCsv(r.unit_type),
    escapeCsv(r.case_size),
    escapeCsv(r.units_per_case),
    escapeCsv(r.case_price),
    escapeCsv(r.price_per_unit),
    escapeCsv(r.description),
    escapeCsv(r.tags),
    escapeCsv(r.cafes),
  ]);

  const csv = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.join(",")),
  ].join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wmu-inventory-${today}.csv"`,
    },
  });
}
