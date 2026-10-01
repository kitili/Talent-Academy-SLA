export type OpsAreaId =
  | "identity"
  | "onboarding"
  | "learning"
  | "classroom"
  | "communications"
  | "marketing"
  | "security";

export const OPS_AREAS: { id: OpsAreaId; title: string; description: string }[] = [
  { id: "identity", title: "Identity", description: "Staff accounts, sessions, and approval history" },
  { id: "onboarding", title: "Onboarding", description: "Fellow accounts, batches, and enrollments" },
  { id: "learning", title: "Learning", description: "Curriculum, progress, and assessments" },
  { id: "classroom", title: "Classroom", description: "Attendance, events, assignments, certificates" },
  { id: "communications", title: "Communications", description: "Notifications and alert rules" },
  { id: "marketing", title: "Marketing", description: "Satisfaction, comments, goals, reflections" },
  { id: "security", title: "Security", description: "Integrity events and access notes" },
];

export const OPS_TABLES: { table: string; area: OpsAreaId; label: string }[] = [
  { table: "sessions", area: "identity", label: "Login sessions" },
  { table: "users", area: "identity", label: "Admin and trainer accounts" },
  { table: "user_profiles", area: "identity", label: "Staff extra details" },
  { table: "approval_history", area: "identity", label: "Who approved whom" },
  { table: "teachers", area: "onboarding", label: "Fellow accounts" },
  { table: "teacher_profiles", area: "onboarding", label: "Fellow extra details" },
  { table: "batches", area: "onboarding", label: "Cohorts" },
  { table: "batch_teachers", area: "onboarding", label: "Who is in which cohort" },
  { table: "batch_courses", area: "onboarding", label: "Courses assigned to a cohort" },
  { table: "courses", area: "learning", label: "Courses" },
  { table: "training_weeks", area: "learning", label: "Modules inside a course" },
  { table: "content_items", area: "learning", label: "Videos and files" },
  { table: "user_content_progress", area: "learning", label: "Staff material progress" },
  { table: "deck_file_progress", area: "learning", label: "Slide progress" },
  { table: "quiz_attempts", area: "learning", label: "Quiz attempts" },
  { table: "quiz_cache", area: "learning", label: "Generated quiz bank" },
  { table: "assigned_quizzes", area: "learning", label: "Quizzes assigned to a cohort" },
  { table: "teacher_quiz_attempts", area: "learning", label: "Fellow assigned-quiz attempts" },
  { table: "teacher_content_progress", area: "learning", label: "Fellow module progress" },
  { table: "teacher_content_quiz_attempts", area: "learning", label: "Fellow module quizzes" },
  { table: "teacher_quiz_regenerations", area: "learning", label: "Quiz retakes" },
  { table: "open_ended_reviews", area: "learning", label: "Written-answer reviews" },
  { table: "teacher_course_completion", area: "learning", label: "Course finished records" },
  { table: "course_repetitions", area: "learning", label: "Repeated courses" },
  { table: "attendance_records", area: "classroom", label: "Attendance" },
  { table: "scheduled_events", area: "classroom", label: "Calendar events" },
  { table: "written_assignments", area: "classroom", label: "Written assignments" },
  { table: "assignment_submissions", area: "classroom", label: "Assignment answers" },
  { table: "batch_certificate_templates", area: "classroom", label: "Certificate templates" },
  { table: "teacher_certificates", area: "classroom", label: "Issued certificates" },
  { table: "teacher_report_cards", area: "classroom", label: "Fellow report cards" },
  { table: "notifications", area: "communications", label: "In-app notices" },
  { table: "alert_rules", area: "communications", label: "Alert thresholds" },
  { table: "satisfaction_scores", area: "marketing", label: "Ratings" },
  { table: "trainer_comments", area: "marketing", label: "Trainer comments" },
  { table: "teacher_goals", area: "marketing", label: "Fellow goals" },
  { table: "fellow_reflections", area: "marketing", label: "Reflections" },
  { table: "fellow_disqualifications", area: "marketing", label: "Disqualifications" },
  { table: "security_violations", area: "security", label: "Integrity events" },
];

export const OPS_DOCUMENTS = [
  { area: "identity", path: "docs/ops/identity.md", title: "Identity" },
  { area: "onboarding", path: "docs/ops/onboarding.md", title: "Onboarding" },
  { area: "learning", path: "docs/ops/learning.md", title: "Learning" },
  { area: "classroom", path: "docs/ops/classroom.md", title: "Classroom" },
  { area: "communications", path: "docs/ops/communications.md", title: "Communications" },
  { area: "marketing", path: "docs/ops/marketing.md", title: "Marketing" },
  { area: "security", path: "docs/ops/security.md", title: "Security" },
  { area: "identity", path: "docs/ops/README.md", title: "Catalog overview" },
];
