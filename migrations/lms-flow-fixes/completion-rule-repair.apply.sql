-- completion-rule-repair.apply.sql
--
-- OPTIONAL. Written, not applied (plan: plans/lms-flow-fixes/plan.md, decision D10, recommended:
-- "leave them, and report them"). Run it only if the engineer decides to reopen rows.
--
-- What: marks the chosen teacher_course_completion rows 'in_progress' again and clears completed_at.
-- Only those two fields change; the stored module counts are left alone. The rows are the ones the
-- report marked 'completed' that fail the course completion rule (see the report's header for the rule).
--
-- What users notice: a Fellow whose course row is reopened sees that course as not complete again. The
-- next course in the cohort locks again for them unless the rule says the course is complete, and the
-- "Course done" medal goes until they finish it. Nothing else changes; no progress or quiz row is touched.
-- The table has no metadata column, so a reopened row cannot be marked as reopened; the report, rerun
-- afterwards, is the record (it no longer lists the reopened rows).
--
-- Run order:
--   1. Run completion-rule-report.preflight.sql. It must show preflight_passed = true.
--   2. Copy its `confirmation` cell, for example {"ids": ["1f0c...", "9a7e..."]}. To keep a row completed,
--      delete its id from the list.
--   3. Replace '{}' on the EDIT line below with that value, so it reads, for example:
--        confirmation constant jsonb := '{"ids": ["1f0c...", "9a7e..."]}';
--   4. Run this whole file in the Neon SQL editor. Target: the production database (there is no other).
--
-- Refuses (and changes nothing) when: the EDIT line is unedited or not {"ids": [...]}, the list is empty,
-- an id is listed twice, or any listed id is no longer a 'completed' row that fails the rule (the data
-- moved since the report; rerun the report). Checks the updated row count before it commits.
-- Safe to rerun: a second run refuses, because the reopened rows are no longer 'completed'.
--
-- Read-back: the last statement lists the reopened rows (kept in a temporary table for this session);
-- every row must show status = 'in_progress' and completed_at = NULL.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Session-only list of what this run reopened, for the read-back after COMMIT. Writes nothing shared.
CREATE TEMP TABLE IF NOT EXISTS completion_rule_reopened (id text PRIMARY KEY);

DO $repair$
DECLARE
    -- EDIT: paste the preflight's `confirmation` value between the quotes.
    confirmation constant jsonb := '{}';
    wanted text[];
    failing_now text[];
    changed integer;
BEGIN
    IF pg_catalog.jsonb_typeof(confirmation -> 'ids') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'refusing: the EDIT line is not {"ids": [...]}; paste the report''s confirmation value';
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(value ORDER BY value COLLATE "C"), ARRAY[]::text[])
    INTO wanted
    FROM pg_catalog.jsonb_array_elements_text(confirmation -> 'ids') AS ids(value);

    IF pg_catalog.cardinality(wanted) = 0 THEN
        RAISE EXCEPTION 'refusing: the confirmation lists no ids';
    END IF;
    IF (SELECT pg_catalog.count(DISTINCT u) FROM pg_catalog.unnest(wanted) AS u) <> pg_catalog.cardinality(wanted) THEN
        RAISE EXCEPTION 'refusing: an id is listed twice';
    END IF;

    -- Lock the listed rows so the rule is checked against what will be written.
    PERFORM 1 FROM public.teacher_course_completion AS c WHERE c.id = ANY (wanted) FOR UPDATE;

    -- The same rule as completion-rule-report.preflight.sql, over the listed rows only.
    WITH completed AS (
        SELECT c.id, c.teacher_id, c.course_id
        FROM public.teacher_course_completion AS c
        WHERE c.status = 'completed' AND c.id = ANY (wanted)
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
        SELECT m.completion_id, m.week_id, COALESCE(bool_and(fs.done), true) AS complete
        FROM modules AS m
        LEFT JOIN file_state AS fs ON fs.completion_id = m.completion_id AND fs.week_id = m.week_id
        GROUP BY m.completion_id, m.week_id
    ),
    rule AS (
        SELECT
            cr.id,
            COALESCE(pg_catalog.count(ms.week_id), 0) AS total_modules,
            COALESCE(pg_catalog.count(ms.week_id) FILTER (WHERE ms.complete), 0) AS done_modules
        FROM completed AS cr
        LEFT JOIN module_state AS ms ON ms.completion_id = cr.id
        GROUP BY cr.id
    )
    SELECT COALESCE(pg_catalog.array_agg(r.id ORDER BY r.id COLLATE "C"), ARRAY[]::text[])
    INTO failing_now
    FROM rule AS r
    WHERE NOT (r.total_modules > 0 AND r.done_modules = r.total_modules);

    IF failing_now IS DISTINCT FROM wanted THEN
        RAISE EXCEPTION 'refusing: % listed id(s), but % of them are still completed rows that fail the rule; rerun the report',
            pg_catalog.cardinality(wanted), pg_catalog.cardinality(failing_now);
    END IF;

    UPDATE public.teacher_course_completion AS c
    SET status = 'in_progress', completed_at = NULL
    WHERE c.id = ANY (wanted) AND c.status = 'completed';
    GET DIAGNOSTICS changed = ROW_COUNT;

    IF changed <> pg_catalog.cardinality(wanted) THEN
        RAISE EXCEPTION 'refusing: expected to reopen % row(s), updated %', pg_catalog.cardinality(wanted), changed;
    END IF;

    INSERT INTO pg_temp.completion_rule_reopened (id)
    SELECT u FROM pg_catalog.unnest(wanted) AS u
    ON CONFLICT (id) DO NOTHING;
END
$repair$;

COMMIT;

-- Read-back. A pass: one row per reopened id, each with status = 'in_progress' and completed_at = NULL.
SELECT c.id, c.teacher_id, c.course_id, c.batch_id, c.status, c.completed_at
FROM public.teacher_course_completion AS c
JOIN pg_temp.completion_rule_reopened AS r ON r.id = c.id
ORDER BY c.id COLLATE "C";
