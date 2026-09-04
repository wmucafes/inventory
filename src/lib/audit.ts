import { getDbPool } from "@/lib/db";

type AuditAction =
  | "item_added"
  | "item_edited"
  | "item_deleted"
  | "request_created"
  | "request_fulfilled"
  | "request_recorded"
  | "request_deleted"
  | "access_granted"
  | "access_revoked"
  | "password_reset"
  | "user_login"
  | "tag_created"
  | "tag_deleted";

type AuditEntityType = "item" | "stock_request" | "user_access" | "tag";

export async function logAudit(
  actorEmail: string,
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: string | number | null,
  details: Record<string, unknown>,
) {
  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO audit_log (actor_email, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorEmail, action, entityType, entityId?.toString() ?? null, JSON.stringify(details)],
    );
  } catch (err) {
    // Never let audit logging failure break the main flow
    console.error("Audit log write failed", err);
  }
}
