import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addColumnSql,
  createTableSql,
  expectedSchemaColumns,
  missingSchemaColumns,
  schemaTables,
} from "../server/schemaGuard.ts";

describe("schema guard", () => {
  it("lists every drizzle table and the columns that 500 when missing", () => {
    const tables = schemaTables();
    const columns = expectedSchemaColumns();
    assert.equal(tables.some((table) => table.name === "teacher_goals"), true);
    assert.equal(columns.some((column) => column.table === "teacher_goals" && column.column === "goal_text"), true);
    assert.equal(columns.some((column) => column.table === "quiz_cache" && column.column === "approved"), true);
    assert.equal(columns.some((column) => column.table === "teacher_quiz_attempts" && column.column === "open_ended_pending"), true);
    assert.equal(columns.some((column) => column.table === "teacher_quiz_attempts" && column.column === "final_passed"), true);
    assert.ok(tables.length >= 40);
    assert.ok(columns.length >= 300);
  });

  it("creates a missing table and adds a missing column without rewriting the rest of the row", () => {
    const goals = schemaTables().find((table) => table.name === "teacher_goals");
    assert.ok(goals);
    const create = createTableSql(goals);
    assert.match(create, /CREATE TABLE IF NOT EXISTS "teacher_goals"/);
    assert.match(create, /"goal_text" text NOT NULL/);
    const approved = expectedSchemaColumns().find((column) => column.table === "quiz_cache" && column.column === "approved");
    assert.ok(approved);
    const alter = addColumnSql(approved);
    assert.match(alter, /ADD COLUMN IF NOT EXISTS "approved" boolean DEFAULT false NOT NULL/);
    const missing = missingSchemaColumns(["quiz_cache.approved"], expectedSchemaColumns().filter((column) => column.table === "quiz_cache"));
    assert.deepEqual(missing.map((column) => column.column).sort(), ["approved_at", "created_at", "deck_file_id", "id", "questions", "week_id"]);
  });
});
