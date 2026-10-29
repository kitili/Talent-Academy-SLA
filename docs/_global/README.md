# Global Documentation

This folder is for repo-wide documentation that does not belong to a single feature (`skills/documentation-skill`).
There is no `docs/README.md`: this file is the index.

## Features

One line per `docs/<feature>/` folder, linking to its `README.md`.

- [Academy desk](../academy-desk/README.md): Fellow and Trainer kinds, Trainers registering Fellows, the timetable, the
  academy year, assessment sharing, and sign-in after an approved request

## Cross-feature map

How features depend on each other, which cluster together, and the blast radius of changing one; one line per
relationship, linking to the feature folders. None yet.

## Topics

Repo-wide practices every feature follows, each in `docs/_global/<topic>/`.

- [Worker performance](./worker-performance/README.md): how each delegated worker did, by model, and the brief
  checklist that comes out of it

## Docs from before the kit

These were here before the working architecture was installed. They stay where they are; some mix shipped behaviour
with plans, so check them against the code.

### `docs/architecture/`

- [STATUS.md](../architecture/STATUS.md): where the live site, repository and database stand, and what is still a
  human step.
- [workflow.md](../architecture/workflow.md): the intended course → week → quiz → cohort flow and the screen for each
  step.
- [use-case.md](../architecture/use-case.md): the admin, trainer and teacher use cases as a diagram.
- [dfd.md](../architecture/dfd.md): data-flow diagrams of how data moves through the system.
- [erd.md](../architecture/erd.md): the database tables and their relationships.
- [lms-gap-requirements.md](../architecture/lms-gap-requirements.md): this LMS compared with open LMS products, and the
  requirements borrowed from them.
- [supabase-workflow.md](../architecture/supabase-workflow.md): the planned move of the database from Neon to
  Supabase (not done yet).
- [lms-system.canvas.tsx](../architecture/lms-system.canvas.tsx): a React page summarising where the system stands.

### `docs/guides/`

- [README.md](../guides/README.md): index of the handover guides.
- [admin.md](../guides/admin.md): the admin desk, step by step.
- [trainer.md](../guides/trainer.md): the trainer desk, step by step.
- [learner.md](../guides/learner.md): the teacher (learner) desk.
- [talking.md](../guides/talking.md): how trainers and teachers message each other, and where the admin speaks.

### `docs/ops/`

- [README.md](../ops/README.md): the ops catalog, mapping each area to its tables.
- [classroom.md](../ops/classroom.md): attendance, schedule and written-work tables.
- [communications.md](../ops/communications.md): notifications and alert rules.
- [identity.md](../ops/identity.md): staff logins and sessions.
- [learning.md](../ops/learning.md): curriculum, materials, progress and assessment tables.
- [marketing.md](../ops/marketing.md): satisfaction scores and trainer comments.
- [onboarding.md](../ops/onboarding.md): teacher sign-up, batches and course assignment.
- [security.md](../ops/security.md): quiz integrity events, row-level security and server-only secrets.

### Repository root

- `README.md`: setup, environment variables and the Vercel deploy.
- `DEPLOYMENT.md` and `replit.md`: the older Replit setup; stale.
- `design_guidelines.md`: visual design guidelines.
