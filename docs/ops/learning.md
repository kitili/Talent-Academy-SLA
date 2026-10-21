# Learning

Curriculum, materials, progress, and assessments.

- `courses`, `training_weeks`, `content_items` — curriculum tree. Slide metadata is in `training_weeks.deck_files` JSON; files themselves are in Vercel Blob.
- `cohort_batch_courses` — which course sits on which batch inside a cohort.
- Progress: `user_content_progress`, `deck_file_progress`, `teacher_content_progress`, `teacher_course_completion`, `course_repetitions`.
- `trainer_stars` — a star a trainer gives by hand inside one cohort. The other medals are earned from progress, attendance, and quizzes.
- Quizzes: `quiz_cache`, `quiz_attempts`, `assigned_quizzes`, `teacher_quiz_attempts`, `teacher_content_quiz_attempts`, `teacher_quiz_regenerations`, `open_ended_reviews`.
