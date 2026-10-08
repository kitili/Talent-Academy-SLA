# Workflow — previous LMS + Taleemabad PDF

Same roles as before: **Admin**, **Trainer**, **Teacher (fellow)**. Same objects: **course → week/module → slides → quiz → cohort**.

```
Admin / trainer sign in
        │
        ▼
Create course (1-day or multi-day)     ← PDF 4: not forced to 5 weeks
        │
        ▼
Add weeks + upload PowerPoint          ← PDF 2
        │
        ▼
Generate quiz from slides
   or type questions by hand           ← PDF 2
        │
        ▼
Approve quiz + assign course to batch
        │
        ▼
Enroll teachers (7100+ IDs)
        │
        ▼
Teacher signs in → My learning
        │
        ▼
Week 1 open; week 2 locked
        │
        ▼
View slides → sit quiz → pass
        │
        ▼
Week 2 unlocks; later weeks same       ← PDF 5
        │
        ▼
Finish last week → course complete
        │
        ▼
Admin/trainer see named teacher,
% complete, not At Risk                ← PDF 1 + 3 + 4
```

**Where to click in the current app**

| Step | Screen |
|---|---|
| Sign in | `/auth` |
| Admin desk | `/admin` |
| All teachers + progress | `/admin/teachers` |
| Cohorts | `/admin/batches` then a batch room |
| Analytics / engagement | `/admin/analytics` |
| Trainer cohort ops | `/trainer/batches` |
| Teacher path | `/teacher/dashboard` → week content |
| Data catalog / ERD labels | `/admin/data-catalog` |

**Passwords (test):** admin `admin123` · trainer1 `trainer123` · teacher@test.com `teacher123`.
