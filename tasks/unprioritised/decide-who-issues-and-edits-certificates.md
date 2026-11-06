# Decide who issues and edits certificates

**Family:** Certificates and records · **Added:** 2026-11-06 · **Source:** the SLA brief (09:05) and task T2-N of `plans/sla-feedback-fixes/sla-feedback-fixes-plan.md` · **Blocked on:** the steering engineer

Read `.claude/CLAUDE.md`, `docs/_learnings` and `server/certificateEligibility.ts` first.

## What was observed

- The brief says "if the admin or the trainer has issued their certificate". Issuing is Admin only (`POST /api/admin/certificates/issue`, `isStrictAdmin`). A Trainer can only save a cohort template, which issues nothing.
- `PATCH /api/certificates/:certId` is Admin only, but `canEdit` is hard-coded false on `teacher-certificate-view.tsx`, so nobody can edit on screen. With free-text wording, a typo means reissuing, and that adds a second row because the unique index does not catch empty course and cohort values.
- Issuing sends the Fellow no notice.
- `academy_settings.cohorts_required` defaults to 1, and the brief says five cohorts. Its live value has not been read. Whether "five" survives depends on `tasks/prioritised/replace-steps-with-reusable-curriculums.md`.

## Decide (recommended first)

1. Who issues: Admin only, with a Trainer able to propose. Or a Trainer of that cohort as well.
2. Editing after issue: turn on the Admin's edit, using the existing route and the wording rule.
3. Notify the Fellow when a certificate is issued: yes.
