import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";

export type SchemaColumn = {
  table: string;
  column: string;
  sqlType: string;
  notNull: boolean;
  primary: boolean;
  defaultSql: string | null;
};

export type SchemaTable = {
  name: string;
  columns: SchemaColumn[];
  primaryKey: string[];
};

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function defaultSql(col: { name: string; getSQLType: () => string; hasDefault?: boolean; default?: unknown; primary?: boolean }) {
  if (!col.hasDefault) return null;
  const def = col.default;
  if (typeof def === "string") return `'${def.replace(/'/g, "''")}'`;
  if (typeof def === "number" || typeof def === "boolean") return String(def);
  const sqlType = col.getSQLType();
  if (sqlType === "timestamp") return "now()";
  if (sqlType === "jsonb") return `'[]'::jsonb`;
  if (sqlType === "varchar" && col.primary) return "gen_random_uuid()::text";
  return null;
}

export function schemaTables(): SchemaTable[] {
  const tables: SchemaTable[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const cfg = getTableConfig(value);
    const columns = Object.values(cfg.columns).map((col) => ({
      table: cfg.name,
      column: col.name,
      sqlType: col.getSQLType(),
      notNull: Boolean(col.notNull),
      primary: Boolean(col.primary),
      defaultSql: defaultSql(col),
    }));
    const composite = cfg.primaryKeys?.[0]?.columns?.map((column) => column.name) || [];
    const primaryKey = composite.length ? composite : columns.filter((column) => column.primary).map((column) => column.column);
    tables.push({ name: cfg.name, columns, primaryKey });
  }
  return tables.sort((a, b) => a.name.localeCompare(b.name));
}

export function expectedSchemaColumns(): SchemaColumn[] {
  return schemaTables().flatMap((table) => table.columns);
}

export function createTableSql(table: SchemaTable) {
  const lines = table.columns.map((column) => {
    const parts = [quoteIdent(column.column), column.sqlType];
    if (column.notNull) parts.push("NOT NULL");
    if (column.defaultSql) parts.push(`DEFAULT ${column.defaultSql}`);
    return parts.join(" ");
  });
  if (table.primaryKey.length) {
    lines.push(`PRIMARY KEY (${table.primaryKey.map(quoteIdent).join(", ")})`);
  }
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n  ${lines.join(",\n  ")}\n)`;
}

export function addColumnSql(column: SchemaColumn) {
  const parts = [
    `ALTER TABLE ${quoteIdent(column.table)}`,
    `ADD COLUMN IF NOT EXISTS ${quoteIdent(column.column)} ${column.sqlType}`,
  ];
  if (column.defaultSql) {
    parts.push(`DEFAULT ${column.defaultSql}`);
    if (column.notNull) parts.push("NOT NULL");
  }
  return parts.join(" ");
}

export function missingSchemaColumns(
  liveColumns: Iterable<string>,
  required = expectedSchemaColumns(),
) {
  const live = liveColumns instanceof Set ? liveColumns : new Set(liveColumns);
  return required.filter((column) => !live.has(`${column.table}.${column.column}`));
}

export async function ensureSchemaColumns(query: (sql: string) => Promise<unknown>) {
  const tables = schemaTables();
  const existingTables = new Set(
    ((await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)) as { rows?: Array<{ table_name: string }> }).rows?.map((row) => row.table_name) || [],
  );
  for (const table of tables) {
    if (!existingTables.has(table.name)) {
      await query(createTableSql(table));
    }
  }
  const existingColumns = new Set(
    ((await query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `)) as { rows?: Array<{ table_name: string; column_name: string }> }).rows
      ?.map((row) => `${row.table_name}.${row.column_name}`) || [],
  );
  for (const column of missingSchemaColumns(existingColumns, expectedSchemaColumns())) {
    await query(addColumnSql(column));
  }
}
