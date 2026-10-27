# Tasks

Open work with no plan in progress: things we have decided to do, or to look at, but have not started. Each task is
one file, named as the action (`require-a-sign-in-on-the-export-route.md`), in one of two folders:

```
tasks/
  README.md          # this index
  prioritised/       # tasks the steering engineer has ranked; the order is the Prioritised table below
  unprioritised/     # everything else, flat; grouped by family in the Unprioritised tables below
```

This README is the index. The folder says whether a task is prioritised, and this README says in what order and under
which family. Families are index sections, not folders, so recategorising a task never moves its file.

The rules files (`.claude/CLAUDE.md`, paradigm 3) rely on this folder:
- an item listed here needn't be repeated in an update's "Waiting on you" section;
- a deferred task or decision must be added here.

## Prioritised

Work in this order. The steering engineer reorders freely.

| # | Task | Family | Added | Blocked on |
|---|---|---|---|---|

## Unprioritised

Not ranked.

### Security and data boundary

| Task | Added | Blocked on |
|---|---|---|

### Learning path and quizzes

| Task | Added | Blocked on |
|---|---|---|

### Academy setup and roles

| Task | Added | Blocked on |
|---|---|---|

### Certificates and records

| Task | Added | Blocked on |
|---|---|---|

### Database and start-up

| Task | Added | Blocked on |
|---|---|---|

### Tooling and tests

| Task | Added | Blocked on |
|---|---|---|

### Product UI

| Task | Added | Blocked on |
|---|---|---|

## Families

The unprioritised index is grouped under these families. Add one per domain of the product as the first task in it
appears, add a new one only when no existing family fits, and add its heading above.

| Family | Covers |
|---|---|
| Security and data boundary | Sign-in and sessions, role checks (admin, trainer, teacher), secrets, and what teacher data the academy stores or sends. |
| Learning path and quizzes | What a teacher sees and unlocks: modules, lesson files, quiz scoring and pass marks, course completion. |
| Academy setup and roles | Cohorts, batches, courses and their placement; who may create, assign or delete each; trainer and teacher enrolment. |
| Certificates and records | Certificates, attendance, progress figures, analytics and exports. |
| Database and start-up | The schema, migrations, the start-up schema guard and account clean-up, and the one shared Neon database. |
| Tooling and tests | The test suite, scripts, the Vercel build, developer tooling. |
| Product UI | Screens and copy that belong to none of the above. |

## A task file

Name the file as the task, an imperative sentence in kebab case, and put it in `unprioritised/` unless the steering
engineer has ranked it. Write it so a new session can act on it without the conversation that produced it:

```markdown
# <Do the thing, as an imperative>

**Family:** <one of the families> · **Added:** <date> · **Source:** <plan, handoff or finding> · **Blocked on:** <who or what, or omit>

<Context: the repository, which docs to read first.>

<What was observed: evidence with file:line, counts, dates.>

<Do: the steps, the decisions to raise, the approvals needed (production writes, calls to external systems).>
```

The file never says whether it is prioritised. Its folder does, and its row in this README gives the order.

## The lifecycle

1. **Add.** Whenever a task or decision is deferred, by the steering engineer or because it was out of scope, write
   its file in `unprioritised/` and add a row under its family in **Unprioritised**. Follow-ups found while working
   are added the same way.
2. **Prioritise.** When the steering engineer ranks a task, `git mv` its file into `prioritised/` and move its row
   into **Prioritised**, at the position they want. The file's text doesn't change. Deprioritising is the reverse.
3. **Start.** When the work begins it gets a plan under `plans/<feature>/`. Point the file at the plan and branch,
   or delete the file and its row once the plan holds everything.
4. **Finish.** Delete the file and its row. The commit message says why and where it went:
   - `tasks: done "<task title>" (merged <commit>; plan <path>)`
   - `tasks: dropped "<task title>" (<reason>)`

   Then `git log --oneline -- tasks/` lists every closed task with its pointer. This folder never keeps finished
   tasks or status snapshots.

## What does not belong here

- The status of a plan in flight: it goes in that plan's Status section.
- Session state: it goes in `handoff/`.
- Pitfalls: they go in `docs/_learnings/`.
- A feature's own "later" ideas that nobody has committed to: they go in `docs/<feature>/future-improvements.md`.
