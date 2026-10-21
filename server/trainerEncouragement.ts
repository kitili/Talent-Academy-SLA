import { sql } from "drizzle-orm";
import { encouragementCandidate, hallDay } from "@shared/encouragement";
import { db, hasDatabaseUrl } from "./db";

async function ensureEncouragementTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS trainer_encouragements (
      trainer_id varchar NOT NULL,
      day date NOT NULL,
      message text NOT NULL,
      PRIMARY KEY (trainer_id, day)
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_trainer_encouragement_message
    ON trainer_encouragements (message)
  `);
}

function savedMessage(result: { rows?: Array<{ message?: string }> }) {
  const message = result.rows?.[0]?.message;
  return message ? String(message) : "";
}

/**
 * One encouragement for this trainer for this local day.
 * The same person sees the same words until midnight in Dar es Salaam.
 * The words are stored so they are not given to anyone else, or to this trainer on another day.
 */
export async function encouragementFor(trainerId: string, now = new Date()) {
  const day = hallDay(now);
  if (!hasDatabaseUrl()) {
    return encouragementCandidate({ trainerId, day, used: [] }, 0);
  }

  await ensureEncouragementTable();
  const existing = await db.execute(sql`
    SELECT message FROM trainer_encouragements
    WHERE trainer_id = ${trainerId} AND day = ${day}
  `);
  const already = savedMessage(existing);
  if (already) return already;

  const history = await db.execute(sql`SELECT message FROM trainer_encouragements`);
  const used = (history.rows as Array<{ message?: string }>)
    .map((row) => String(row.message || ""))
    .filter(Boolean);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const message = encouragementCandidate({ trainerId, day, used }, attempt);
    try {
      await db.execute(sql`
        INSERT INTO trainer_encouragements (trainer_id, day, message)
        VALUES (${trainerId}, ${day}, ${message})
      `);
      return message;
    } catch (error) {
      const won = savedMessage(await db.execute(sql`
        SELECT message FROM trainer_encouragements
        WHERE trainer_id = ${trainerId} AND day = ${day}
      `));
      if (won) return won;
      used.push(message);
      console.error("Encouragement line was already taken:", (error as Error).message);
    }
  }

  return encouragementCandidate({ trainerId, day, used }, 24);
}
