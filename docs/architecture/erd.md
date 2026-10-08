# ERD — Talent Academy database

One Postgres. App tables are `public.*`. Ops labels live in `ops.areas` / `ops.table_map`.

```mermaid
erDiagram
  users ||--o{ batches : creates
  users ||--o{ user_profiles : has
  users ||--o{ batch_courses : assigns
  users ||--o{ assigned_quizzes : assigns

  teachers ||--o| teacher_profiles : has
  teachers ||--o| teacher_report_cards : has
  teachers ||--o{ batch_teachers : enrolls
  teachers ||--o{ teacher_content_progress : views
  teachers ||--o{ teacher_quiz_attempts : sits
  teachers ||--o{ teacher_course_completion : finishes
  teachers ||--o{ attendance_records : marked
  teachers ||--o{ teacher_certificates : earns

  batches ||--o{ batch_teachers : contains
  batches ||--o{ batch_courses : studies
  batches ||--o{ assigned_quizzes : given
  batches ||--o{ scheduled_events : calendar
  batches ||--o{ written_assignments : work
  batches ||--o{ attendance_records : register

  courses ||--o{ training_weeks : modules
  courses ||--o{ batch_courses : assigned
  courses ||--o{ teacher_course_completion : tracked

  training_weeks ||--o{ content_items : materials
  training_weeks ||--o{ quiz_cache : bank
  training_weeks ||--o{ quiz_attempts : taken
  training_weeks ||--o{ teacher_content_progress : lock_state

  assigned_quizzes ||--o{ teacher_quiz_attempts : attempts
  teacher_quiz_attempts ||--o{ open_ended_reviews : marked

  written_assignments ||--o{ assignment_submissions : answers
  batch_certificate_templates ||--o{ teacher_certificates : issued

  users {
    varchar id PK
    varchar username
    varchar role
    varchar approval_status
  }
  teachers {
    varchar id PK
    int teacher_id
    varchar name
    varchar email
    varchar approval_status
  }
  batches {
    varchar id PK
    varchar name
    varchar created_by FK
  }
  courses {
    varchar id PK
    varchar name
    text objectives
    varchar publish_status
  }
  training_weeks {
    varchar id PK
    varchar course_id FK
    int week_number
    jsonb deck_files
  }
  teacher_content_progress {
    varchar id PK
    varchar teacher_id FK
    varchar week_id FK
    varchar status
  }
  teacher_course_completion {
    varchar id PK
    varchar teacher_id FK
    varchar course_id FK
    varchar batch_id FK
    int completed_weeks
    int total_weeks
    varchar status
  }
```

## How it looks in Supabase

| Schema | What you open |
|---|---|
| `public` | Live LMS tables the app reads |
| `ops` | Catalog: area → table → `docs/ops/*.md` |

Areas: **identity → onboarding → learning → classroom → communications → marketing → security**.
