# lms-flow-fixes

SQL for `plans/lms-flow-fixes/plan.md`. The approved decisions need no schema change; this bucket holds the D10
completion-rule report and its optional repair. **Written, not applied.** The steering engineer runs these by hand
in the Neon SQL editor; the target is the production database (there is no other).

| File | What it does | Writes? |
| --- | --- | --- |
| `completion-rule-report.preflight.sql` | Lists `teacher_course_completion` rows marked `completed` that fail the course completion rule (C3), one JSON object per row, and a `confirmation` value with their ids. | never |
| `completion-rule-repair.apply.sql` | Optional. Marks the ids pasted from the report `in_progress` again and clears `completed_at`. Refuses unless every listed id still fails the rule. | yes |

## Run order

1. Run the report. `preflight_passed` must be `true`. Read `failing`; under D10 (recommended) the rows stay as they
   are, and the engineer decides per row.
2. Only to reopen rows: copy the report's `confirmation` cell (for example `{"ids": ["1f0c...", "9a7e..."]}`),
   delete any id to keep, paste it on the EDIT line of the apply so it reads
   `confirmation constant jsonb := '{"ids": ["1f0c...", "9a7e..."]}';`, and run the whole apply. Its last result
   lists the reopened rows; each must show `status = 'in_progress'` and `completed_at = NULL`.
3. Run the report again: the reopened rows are no longer listed.

The rule in both files mirrors `server/completion.ts` (`computeCourseCompletion`) and `server/progressLogic.ts`
(`fileIsDone`). Change them together.

Checked with `node scripts/database/check-sql-catalog-qualification.mjs migrations/lms-flow-fixes` (0 hits).

## Applied

Nothing yet. Record each run here: date, who, which file, and the result row (counts, ids).
