export const APPROVAL_HISTORY_PAGE_SIZE = 8;

export function approvalHistoryPage(page: unknown, pageSize = APPROVAL_HISTORY_PAGE_SIZE) {
  const parsed = Number(page);
  const safePage = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  return {
    page: safePage,
    pageSize,
    offset: (safePage - 1) * pageSize,
    pages(total: number) {
      return Math.max(1, Math.ceil(total / pageSize));
    },
  };
}

/** History stored in approval_history, limited to people who belong to one batch. */
export function batchApprovalHistoryFilter(alias = "ah") {
  return `(
    (${alias}.target_type = 'teacher' AND ${alias}.target_id IN (
      SELECT teacher_id FROM batch_teachers WHERE batch_id = $1
    ))
    OR
    (${alias}.target_type = 'trainer' AND ${alias}.target_id IN (
      SELECT trainer_id FROM batches WHERE id = $1 AND trainer_id IS NOT NULL
      UNION
      SELECT created_by FROM batches WHERE id = $1
    ))
  )`;
}

export function batchApprovalHistoryCountSql() {
  return `SELECT COUNT(*)::int AS total FROM approval_history ah WHERE ${batchApprovalHistoryFilter("ah")}`;
}

export function allApprovalHistorySelectSql(paged = false) {
  const limit = paged ? "LIMIT $1 OFFSET $2" : "LIMIT 5000";
  return `SELECT ah.id, ah.target_type, ah.target_id, ah.target_name, ah.target_email, ah.action,
            ah.performed_by, ah.performed_by_name, ah.performed_by_role, ah.created_at
          FROM approval_history ah
          ORDER BY ah.created_at DESC
          ${limit}`;
}

export function batchApprovalHistorySelectSql(paged: boolean) {
  const limit = paged ? "LIMIT $2 OFFSET $3" : "LIMIT 5000";
  return `SELECT ah.id, ah.target_type, ah.target_id, ah.target_name, ah.target_email, ah.action,
            ah.performed_by, ah.performed_by_name, ah.performed_by_role, ah.created_at
          FROM approval_history ah
          WHERE ${batchApprovalHistoryFilter("ah")}
          ORDER BY ah.created_at DESC
          ${limit}`;
}

const CSV_COLUMNS = [
  "created_at",
  "action",
  "target_type",
  "target_name",
  "target_email",
  "performed_by_name",
  "performed_by_role",
] as const;

function csvCell(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function approvalHistoryToCsv(rows: Array<Record<string, unknown>>) {
  const lines = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  return [CSV_COLUMNS.join(","), ...lines].join("\n");
}

export function mapApprovalHistoryRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    targetEmail: row.target_email,
    action: row.action,
    performedBy: row.performed_by,
    performedByName: row.performed_by_name,
    performedByRole: row.performed_by_role,
    createdAt: row.created_at,
  };
}
