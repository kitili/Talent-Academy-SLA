# Tidy the notices and wording left from the SLA fixes

**Family:** Product UI · **Added:** 2026-11-06 · **Source:** tranche reports of `plans/sla-feedback-fixes/sla-feedback-fixes-plan.md`

Read `.claude/CLAUDE.md` and `docs/_learnings` first. The local `.env` is the live database: never load it in tests.

## What was observed

- Times inside notices ("Deadline updated") use `toLocaleString()` on the server, so a Fellow in Tanzania sees UTC on Vercel. Three copies, one in `server/deadlineRoutes.ts`.
- Five quiz routes, and the assignment, event and marking routes, send their notice without waiting for it. A Vercel function can stop after answering, so a notice may be lost.
- `POST /api/notifications` has no screen and lets any Trainer notify anyone. Remove it if nothing calls it.
- A Trainer's announcement list includes every notice with a `batchId`, including one Fellow's mark and comment. Narrow it.
- Server errors still say "teacher" on screen ("Choose teachers who are in this cohort", "Teacher not found").
- Trainer-supplied links in stored rows from before 2026-11-06 are not validated; the Fellow page refuses script addresses when drawing them.
- A file with a Fellow's name in the shell: `/teacher/certificates` showed a login handle where other pages show the name.

## Do

Fix each with a test. None needs a schema change.
