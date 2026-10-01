import { pool } from "./db";

export async function recordAudit(input: {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await pool.query(
      `INSERT INTO audit_events (actor_id, actor_role, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.actorId || null,
        input.actorRole || null,
        input.action,
        input.targetType || null,
        input.targetId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  } catch (error) {
    console.error("audit_events:", error instanceof Error ? error.message : String(error));
  }
}
