-- Labels so Table Editor shows which ops area each table belongs to.
-- After running 0001, run this. Then in Supabase: Table Editor → click a table →
-- the description starts with [onboarding], [learning], etc.

CREATE OR REPLACE VIEW ops.catalog AS
SELECT
  a.id AS area_id,
  a.title AS area_title,
  a.description AS area_description,
  m.table_name,
  d.path AS document_path,
  d.title AS document_title
FROM ops.areas a
JOIN ops.table_map m ON m.area_id = a.id
LEFT JOIN ops.documents d ON d.area_id = a.id;

COMMENT ON VIEW ops.catalog IS 'One place: area, table, and document path';

COMMENT ON TABLE public.sessions IS '[identity] Login sessions';
COMMENT ON TABLE public.users IS '[identity] Admin and trainer accounts';
COMMENT ON TABLE public.user_profiles IS '[identity] Staff extra details';
COMMENT ON TABLE public.approval_history IS '[identity] Who approved whom';
COMMENT ON TABLE public.teachers IS '[onboarding] Fellow accounts';
COMMENT ON TABLE public.teacher_profiles IS '[onboarding] Fellow extra details';
COMMENT ON TABLE public.batches IS '[onboarding] Cohorts';
COMMENT ON TABLE public.batch_teachers IS '[onboarding] Who is in which cohort';
COMMENT ON TABLE public.batch_courses IS '[onboarding] Courses assigned to a cohort';
COMMENT ON TABLE public.courses IS '[learning] Courses';
COMMENT ON TABLE public.training_weeks IS '[learning] Modules inside a course';
COMMENT ON TABLE public.content_items IS '[learning] Videos and files';
COMMENT ON TABLE public.user_content_progress IS '[learning] Staff material progress';
COMMENT ON TABLE public.deck_file_progress IS '[learning] Slide progress';
COMMENT ON TABLE public.quiz_attempts IS '[learning] Quiz attempts';
COMMENT ON TABLE public.quiz_cache IS '[learning] Generated quiz bank';
COMMENT ON TABLE public.assigned_quizzes IS '[learning] Quizzes assigned to a cohort';
COMMENT ON TABLE public.teacher_quiz_attempts IS '[learning] Fellow assigned-quiz attempts';
COMMENT ON TABLE public.teacher_content_progress IS '[learning] Fellow module progress';
COMMENT ON TABLE public.teacher_content_quiz_attempts IS '[learning] Fellow module quizzes';
COMMENT ON TABLE public.teacher_quiz_regenerations IS '[learning] Quiz retakes';
COMMENT ON TABLE public.open_ended_reviews IS '[learning] Written-answer reviews';
COMMENT ON TABLE public.teacher_course_completion IS '[learning] Course finished records';
COMMENT ON TABLE public.course_repetitions IS '[learning] Repeated courses';
COMMENT ON TABLE public.attendance_records IS '[classroom] Attendance';
COMMENT ON TABLE public.scheduled_events IS '[classroom] Calendar events';
COMMENT ON TABLE public.written_assignments IS '[classroom] Written assignments';
COMMENT ON TABLE public.assignment_submissions IS '[classroom] Assignment answers';
COMMENT ON TABLE public.batch_certificate_templates IS '[classroom] Certificate templates';
COMMENT ON TABLE public.teacher_certificates IS '[classroom] Issued certificates';
COMMENT ON TABLE public.teacher_report_cards IS '[classroom] Fellow report cards';
COMMENT ON TABLE public.notifications IS '[communications] In-app notices';
COMMENT ON TABLE public.alert_rules IS '[communications] Alert thresholds';
COMMENT ON TABLE public.satisfaction_scores IS '[marketing] Ratings';
COMMENT ON TABLE public.trainer_comments IS '[marketing] Trainer comments';
COMMENT ON TABLE public.teacher_goals IS '[marketing] Fellow goals';
COMMENT ON TABLE public.fellow_reflections IS '[marketing] Reflections';
COMMENT ON TABLE public.fellow_disqualifications IS '[marketing] Disqualifications';
COMMENT ON TABLE public.security_violations IS '[security] Integrity events';
