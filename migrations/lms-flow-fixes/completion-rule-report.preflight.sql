-- completion-rule-report.preflight.sql
--
-- What: a read-only report of teacher_course_completion rows marked 'completed' that fail the course
-- completion rule (plan: plans/lms-flow-fixes/plan.md, decision D10; finding 1, the course skip).
-- It writes nothing. Under D10 the rows stay as they are; the engineer reads this report and decides
-- per row. The optional completion-rule-repair.apply.sql reopens the rows the engineer chooses.
--
-- The rule (C3, server/completion.ts computeCourseCompletion; C2, server/progressLogic.ts):
--   * A course is complete when it has at least one module and every module is complete (100%, D4).
--     A course with no modules is never complete.
--   * A module with no lesson file is complete (D6). Otherwise every lesson file must be done.
--   * A lesson file is done when the Fellow's progress row is 'completed' or has completed_at set; or
--     the Fellow has a passing attempt at its quiz (quiz_attempts or teacher_content_quiz_attempts);
--     or the file has no approved quiz (quiz_cache.approved) and the Fellow marked it read
--     (status 'viewed' or viewed_at set).
-- Keep this file in step with server/completion.ts if the rule changes.
--
-- Run: paste the whole file into the Neon SQL editor and run it. Safe to rerun; read-only.
-- Target: the production database (there is no other).
--
-- What a pass looks like (one row):
--   read_only               = 'on'     (the transaction could not write)
--   wrote_nothing           = true     (no transaction id was assigned)
--   completed_rows          = every row marked 'completed' today
--   failing_rows            = how many of those fail the rule (0 means nothing to decide)
--   preflight_passed        = true when read_only and wrote_nothing hold
--   blockers                = empty array when preflight_passed
--   confirmation            = {"ids": [...]}: the failing rows' ids, sorted; NULL while anything blocks.
--                             Paste it into completion-rule-repair.apply.sql only if the engineer decides
--                             to reopen rows. Remove an id from the list to keep that row completed.
--   failing                 = one JSON object per failing row: who, which course and cohort, when it was
--                             marked, the stored counts and the counts the rule computes.

BEGIN READ ONLY;

WITH completed AS (
    SELECT c.id, c.teacher_id, c.course_id, c.batch_id, c.completed_at, c.total_weeks, c.completed_weeks
    FROM public.teacher_course_completion AS c
    WHERE c.status = 'completed'
),
modules AS (
    SELECT cr.id AS completion_id, w.id AS week_id, COALESCE(w.deck_files, '[]'::jsonb) AS deck_files
    FROM completed AS cr
    JOIN public.training_weeks AS w ON w.course_id = cr.course_id
),
files AS (
    SELECT m.completion_id, m.week_id, f.file ->> 'id' AS file_id
    FROM modules AS m
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
        CASE WHEN pg_catalog.jsonb_typeof(m.deck_files) = 'array' THEN m.deck_files ELSE '[]'::jsonb END
    ) AS f(file)
),
file_state AS (
    SELECT
        fi.completion_id,
        fi.week_id,
        fi.file_id,
        (
            EXISTS (
                SELECT 1 FROM public.teacher_content_progress AS p
                WHERE p.teacher_id = cr.teacher_id AND p.week_id = fi.week_id AND p.deck_file_id = fi.file_id
                  AND (p.status = 'completed' OR p.completed_at IS NOT NULL)
            )
            OR EXISTS (
                SELECT 1 FROM public.quiz_attempts AS qa
                WHERE qa.week_id = fi.week_id AND qa.deck_file_id = fi.file_id AND qa.passed = 'yes'
                  AND (qa.teacher_id = cr.teacher_id OR qa.user_id = cr.teacher_id)
            )
            OR EXISTS (
                SELECT 1 FROM public.teacher_content_quiz_attempts AS ca
                WHERE ca.teacher_id = cr.teacher_id AND ca.week_id = fi.week_id AND ca.deck_file_id = fi.file_id
                  AND ca.passed = 'yes'
            )
            OR (
                NOT EXISTS (
                    SELECT 1 FROM public.quiz_cache AS q
                    WHERE q.week_id = fi.week_id AND q.deck_file_id = fi.file_id AND q.approved
                )
                AND EXISTS (
                    SELECT 1 FROM public.teacher_content_progress AS p
                    WHERE p.teacher_id = cr.teacher_id AND p.week_id = fi.week_id AND p.deck_file_id = fi.file_id
                      AND (p.status = 'viewed' OR p.viewed_at IS NOT NULL)
                )
            )
        ) AS done
    FROM files AS fi
    JOIN completed AS cr ON cr.id = fi.completion_id
),
module_state AS (
    SELECT
        m.completion_id,
        m.week_id,
        COALESCE(bool_and(fs.done), true) AS complete
    FROM modules AS m
    LEFT JOIN file_state AS fs ON fs.completion_id = m.completion_id AND fs.week_id = m.week_id
    GROUP BY m.completion_id, m.week_id
),
rule AS (
    SELECT
        cr.id,
        cr.teacher_id,
        cr.course_id,
        cr.batch_id,
        cr.completed_at,
        cr.total_weeks,
        cr.completed_weeks,
        COALESCE(pg_catalog.count(ms.week_id), 0)::int AS total_modules,
        COALESCE(pg_catalog.count(ms.week_id) FILTER (WHERE ms.complete), 0)::int AS done_modules
    FROM completed AS cr
    LEFT JOIN module_state AS ms ON ms.completion_id = cr.id
    GROUP BY cr.id, cr.teacher_id, cr.course_id, cr.batch_id, cr.completed_at, cr.total_weeks, cr.completed_weeks
),
failing AS (
    SELECT r.*
    FROM rule AS r
    WHERE NOT (r.total_modules > 0 AND r.done_modules = r.total_modules)
),
checks AS (
    SELECT
        pg_catalog.current_setting('transaction_read_only') AS read_only,
        (pg_catalog.txid_current_if_assigned() IS NULL) AS wrote_nothing
)
SELECT
    ch.read_only,
    ch.wrote_nothing,
    (SELECT pg_catalog.count(*) FROM completed)::int AS completed_rows,
    (SELECT pg_catalog.count(*) FROM failing)::int AS failing_rows,
    (ch.read_only = 'on' AND ch.wrote_nothing) AS preflight_passed,
    (
        CASE WHEN ch.read_only = 'on' THEN '[]'::jsonb ELSE '["transaction is not read-only"]'::jsonb END
        || CASE WHEN ch.wrote_nothing THEN '[]'::jsonb ELSE '["a transaction id was assigned"]'::jsonb END
    ) AS blockers,
    CASE WHEN ch.read_only = 'on' AND ch.wrote_nothing THEN
        pg_catalog.jsonb_build_object(
            'ids',
            COALESCE((SELECT pg_catalog.jsonb_agg(fa.id ORDER BY fa.id COLLATE "C") FROM failing AS fa), '[]'::jsonb)
        )
    END AS confirmation,
    COALESCE((
        SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', fa.id,
                'teacher_id', fa.teacher_id,
                'teacher_name', t.name,
                'course_id', fa.course_id,
                'course_name', co.name,
                'cohort_id', fa.batch_id,
                'cohort_name', b.name,
                'completed_at', fa.completed_at,
                'stored_completed_weeks', fa.completed_weeks,
                'stored_total_weeks', fa.total_weeks,
                'rule_done_modules', fa.done_modules,
                'rule_total_modules', fa.total_modules
            )
            ORDER BY fa.id COLLATE "C"
        )
        FROM failing AS fa
        LEFT JOIN public.teachers AS t ON t.id = fa.teacher_id
        LEFT JOIN public.courses AS co ON co.id = fa.course_id
        LEFT JOIN public.batches AS b ON b.id = fa.batch_id
    ), '[]'::jsonb) AS failing
FROM checks AS ch;

ROLLBACK;
