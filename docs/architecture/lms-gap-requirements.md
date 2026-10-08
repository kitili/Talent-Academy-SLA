# LMS comparison and requirements

Compared **Talent Academy** (this fellowship LMS) to public open LMS products in 2026:

| Open LMS | What we borrow |
|---|---|
| **Moodle** / **Open LMS** | Course overview, quizzes, competency, plugins as optional later |
| **Canvas LMS** (open core) | Short To do list, gradebook CSV, SpeedGrader-style comments |
| **Open edX** | Discussion on a module, certificates, self-paced unlock |
| **Chamilo / ILIAS / Sakai** | Keep lightweight; do not copy SIS, proctoring, or 2,000 plugins |

Also compared earlier to TalentLMS for cohort L&D.

Compared **Talent Academy** (this fellowship LMS) to:

| Peer | Why this one |
|---|---|
| **Canvas LMS** | Best academic / teacher-training match (unlock, gradebook, rubrics) |
| **TalentLMS** | Best simple cohort L&D (paths, certificates, automation) |
| **Moodle** | Best open-source campus LMS (plugins, ownership) |

We are not trying to become Canvas. We keep the Taleemabad path and fill gaps those systems already treat as normal.

## What we already have (keep)

- Admin / trainer / teacher roles and approval
- Batches, courses of any length, week lock after quiz (PDF 5)
- Slide upload, auto + manual quiz (PDF 2)
- Named completion, not fake At Risk (PDF 1, 4)
- Quiz sync on both dashboards (PDF 3)
- Attendance, calendar, written work, certificates
- In-app notifications, report cards, progress list

## Gaps

| ID | Priority | Requirement | Acceptance |
|---|---|---|---|
| R1 | P0 | PDF 1–5 stay green on `npm run pdf:accept` | All 5 groups DONE |
| R2 | P0 | Durable files (Vercel Blob **or** Supabase Storage) | Upload survives redeploy |
| R3 | P0 | Owned Postgres (Supabase) + restore from Neon | `/api/health` host is supabase.co; 11 teachers still there |
| R4 | P1 | Rubric / comment on open-ended and written work | Trainer saves score + comment; teacher sees it |
| R5 | P1 | Email (optional SMS) for deadline, unlock, fail streak | Fellow gets mail when week unlocks or quiz fails twice |
| R6 | P1 | Gradebook: quiz %, modules done, attendance %; CSV | Admin exports batch CSV |
| R7 | P1 | Batch announcements + simple inbox | Trainer posts; all fellows in batch see it |
| R8 | P1 | Quiz bank works with no live AI key | Manual questions always assignable |
| R9 | P2 | Google / Microsoft SSO | Teacher can sign in with school email |
| R10 | P2 | PWA + last module offline | Open last deck without network |
| R11 | P2 | Week discussion thread | Teacher posts; trainer replies |
| R12 | P2 | SCORM later | Out of scope until a partner sends a package |
| R13 | P2 | Skills map from `competency_focus` | Dashboard shows competency coverage |

## Out of scope (do not copy)

University catalog storefront, parent/observer apps, 1,000 generic library courses, full enterprise HRIS until asked.

## Suggested order

1. R2 + R3 (data does not vanish)  
2. R6 + R4 + R7 + R5 (trainers can run a cohort like Canvas)  
3. R8 harden quizzes  
4. R9–R13 when the programme scales  
