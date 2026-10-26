---
name: bootstrapping-a-project
description: Use when starting a new repository, or bringing an existing one onto the shared working architecture — the rules files, docs (feature folders, _global, _learnings, database snapshots), plans, references, src, skills, tests, scripts, and the gitignored working folders. Gives the folder skeleton, what each folder is for, the conventions that make it work, the kit that copies the portable parts (scripts/bootstrap-project.mjs), and what not to copy.
---

# Bootstrapping A Project

## Purpose

Give every new project the same working architecture as the repository the kit came from (its origin), so an agent or engineer who knows one repository can work in the next on day one. The architecture is less about code layout than about where knowledge lives: what the system does today (`docs/`), what is about to change (`plans/`), what was learned the hard way (`docs/_learnings/`), the evidence behind decisions (`references/`), how work is done (the rules files and `skills/`), and how it is proven (`tests/`, `scripts/`).

Keep it simple (the first rule of the rules files): create only the folders the project uses today, and add the rest when the first thing that belongs there appears.

## The Skeleton

```
.claude/CLAUDE.md          # methodology for Claude Code   ┐
.codex/AGENTS.md           # same text, for Codex           │
.cursor/.cursorrules       # same text, for Cursor          ├ kept identical
rules/rules.md             # same text, for other harnesses ┘
docs/
  _global/README.md        # index of feature folders and topics; the cross-feature map grows here
  _global/<topic>/         # repo-wide topics (practices every feature follows)
  _learnings/README.md     # index of traps found the hard way
  _global/database/        # environment snapshots of the live schema (if there is a database)
  <feature>/               # one folder per feature or bounded area
plans/
  <feature>/<title>-plan.md
tasks/
  README.md                # the index: prioritised in order, unprioritised by family
  prioritised/             # one file per task, ranked by the steering engineer
  unprioritised/           # one file per task: deferrals and follow-ups
handoff/                   # one file per orchestrator handoff (handoff-skill)
references/                # gitignored: local evidence, exports, customer documents
src/                       # the application
skills/<name>/SKILL.md     # packaged workflows (plan, test, docs, security, ...)
tests/
  unit/<feature>/  integration/<feature>/  fixtures/
  browser-fixtures/        # if there is a UI
  e2e/  performance/       # when the first journey or budget needs them
scripts/                   # test runners and operator scripts
migrations/<feature>/      # if there is a database; one folder per feature, nothing at the root
workers/<service>/         # separately deployed services, if any
tmp/  designs/  .test-runs/   # gitignored working folders
```

## Folder By Folder

### Rules files: `.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.cursor/.cursorrules`, `rules/rules.md`

The methodology every agent follows, in four identical copies so each harness finds it. The kit copies them from its origin repository as they are; then adapt the project-specific lines its manifest lists (*Run the kit*). A change to one goes to all four in the same commit.

They hold:

- the flow: study first, confirm scope, plan the work, delegate and orchestrate, implement real behaviour, test, document, close the loop;
- the standard working paradigms after it, starting with _prefer simplicity_, then commit authorship, and keeping unfinished work in `tasks/`;
- a pointer from each step to the skill that carries its detail: `learnings-skill` and, for database work, `migrations-skill` (study first), `plan-skill` (plan the work), `orchestration-skill` (delegate and orchestrate), `test-skill` (test), `documentation-skill` and `learnings-skill` (document).

Keep them short; detail belongs in skills.

### `docs/`: what the system does today

- **`docs/<feature>/`**, one folder per feature, using these files (create only the ones you need):

    | File                     | Holds                                                                                 |
    | ------------------------ | ------------------------------------------------------------------------------------- |
    | `README.md`              | what the feature is, its status table (shipped / not shipped), the vocabulary         |
    | `architecture.md`        | how it works: data flow, contracts, the rules and where each is enforced              |
    | `operations.md`          | how to run, backfill, repair, roll back and verify it                                 |
    | `relevant-files.md`      | the honest file map: only files that matter, with boundaries to neighbouring features |
    | `test-suite.md`          | what is tested where, at which layer, and the accepted gaps                           |
    | `future-improvements.md` | ideas not built, clearly labelled, never mixed into current behaviour                 |

    Extra topic files are fine when a feature is large (for example `data-boundary.md`).

- **`docs/_learnings/`** (method in `skills/learnings-skill`): one file per trap, named as a sentence describing the trap (`a-green-test-run-is-not-a-green-build.md`), with the symptom as it appeared, why it happened, and what to do. Each entry carries a `**Scope:**` line (`transferable` or `this repository`), and `README.md` indexes every entry in one line, in the table matching its scope. When a trap is designed out, say so in the entry instead of deleting it.
- **`docs/_global/database/`** (if there is a database): snapshots of each environment's live schema as observed (`prod-schema.sql`, `staging-...`), an export script, and `drift.md` for known differences. Snapshots are evidence, not desired state: update them only from a fresh export, and change the schema only through migrations.
- **`docs/_global/`**: `README.md` indexes the feature folders and topics (there is no `docs/README.md`), then the cross-feature map (how features depend on each other, which cluster together, and the blast radius of changing one; one line per relationship, linking to the feature folders) and repo-wide topics in `docs/_global/<topic>/`. A repo-wide topic is a practice or policy every feature follows with no code of its own (testing, environments and deploys, the security model); anything with behaviour and code of its own, shared infrastructure included, is a feature. See `skills/documentation-skill`.
- **No catch-all folder.** Every note gets a feature folder, a repo-wide topic in `docs/_global/`, a learning, or a plan. A "general" folder for notes with no home turns into a pile of stale implementation summaries; the kit's origin retired its own `docs/_general/` for that reason.

Rule: docs describe shipped behaviour. Plans describe proposals. Never let one masquerade as the other.

### `plans/`: what is about to change

- `plans/<feature>/<kebab-case-title>-plan.md`, or `plans/<title>-plan.md` for cross-cutting work.
- Follow `skills/plan-skill`. Every plan opens with a Status from the lifecycle (Plan only. Not started → Proposed → Approved → In progress → Implemented → Deployed / accepted; or Parked, Superseded, Deferred). It has an Objective, baseline evidence with `file:line`, _Simplest Design And What Was Cut_, task boundaries, a test plan, rollout, and numbered decisions with the recommended option first.
- A plan is also a record: after shipping, its Status keeps the commits, the verification run and the deviations, and current behaviour moves into `docs/`.

### `tasks/`: what is decided but not started

The backlog: work someone has decided to do, or deferred, but which has no plan yet. It's built the way `docs/_learnings/` is:
- **One file per task,** named as the action in kebab case (`require-a-sign-in-on-post-api-functional-classification.md`).
- **Two folders that say its priority:**
  - `prioritised/` holds what the steering engineer has ranked;
  - `unprioritised/` holds everything else.
- **A `README.md` that is the only index:**
  - a **Prioritised** table in working order;
  - **Unprioritised** tables grouped by family (security and data boundary, the product's own domains, tooling and tests, UI…).

  The family list lives in the README. Families are index sections, not folders, so recategorising never moves a file.

Each file holds:
- the title;
- one metadata line (`**Family:** · **Added:** · **Source:** · **Blocked on:**`);
- a brief that a new session can act on without the conversation that produced it: context, what was observed (with `file:line` and counts), and what to do, with the approvals it needs.

The lifecycle, which the rules files' "keep track of unfinished work" paradigm points to:
1. **Defer.** A deferred task or decision gets a file in `unprioritised/` and an index row.
2. **Prioritise.** `git mv` the file into `prioritised/` and move its row.
3. **Start.** It gets a plan in `plans/`.
4. **Finish.** Delete the file and its row, with a commit message `tasks: done "<title>" (merged <commit>; plan <path>)` or `tasks: dropped "<title>" (<reason>)`. Then `git log --oneline -- tasks/` is the record of closed tasks.

The folder never holds finished tasks, plan status or session state. Those belong to git, `plans/` and `handoff/`.

### `handoff/`: where one orchestrator leaves off

One dated file per handoff (`orchestrator-handoff-<date>.md`, or a report such as `overnight-report-<date>.md`), written with `skills/handoff-skill`. A handoff points to plans, tasks and learnings rather than copying them. When a newer handoff supersedes an older one, the older one says so in its first lines.

### `references/`: evidence, kept out of git

Local copies of what decisions rest on: account exports, customer documents, vendor PDFs, measurement outputs, design files. Gitignore the whole folder (`/references` in `.gitignore`), since it often holds customer data. Tests that need a reference fixture must say clearly when it is missing; a reusable, non-sensitive fixture is copied into `tests/fixtures/` instead.

### `src/`: the application

Organise by role, then by domain. For a Next.js app, as here:

| Folder                                       | Holds                                                        |
| -------------------------------------------- | ------------------------------------------------------------ |
| `src/app/`                                   | routes and pages; API routes under `src/app/api/<area>/`     |
| `src/components/<area>/`                     | UI components                                                |
| `src/services/<domain>/`                     | server-side domain services the routes call                  |
| `src/utils/<domain>/`                        | domain logic and pure helpers, the bulk of the testable code |
| `src/lib/<integration>/`                     | wrappers around external providers and SDKs                  |
| `src/constants/constants.ts`                 | named constants, including feature switches                  |
| `src/hooks/`, `src/types/`, `src/providers/` | as the framework expects                                     |

Conventions that make it testable and safe:

- **Route logic in an injectable function.** The handler takes its clients as arguments (`revokeInvitation(req, deps)`), so tests drive the real code with fakes.
- **Feature switches are code constants,** not environment variables. Turning one off is a code change and a deploy, reviewed like any other. Secrets and per-environment values stay in env vars.
- **Server-owned authority.** A request may confirm its scope (project, account); the server derives it from its own rows and never trusts the caller to select it. Every route that writes, or spends money, authenticates.
- **Middleware lives where the framework builds it.** In a Next.js `src/` layout that is `src/middleware.ts`; a root `middleware.ts` is silently ignored.

### `skills/`: packaged workflows

- `skills/<name>/SKILL.md`, with front matter `name` and `description`. The description says _when to use it_, because that is how an agent decides to load it. Optionally add `skills/<name>/agents/openai.yaml` (display name, short description, default prompt) for Codex.
- The kit copies these cores as they are (the list is `skills` in its manifest), and leaves a stub `references/this-repository.md` for each skill that has one here; write the project's own version from it:
    - `plan-skill`: how to plan (copy the core, write `references/this-repository.md`);
    - `test-skill`: how to test (copy `SKILL.md`, the generic core; write the project's own `references/this-repository.md`);
    - `documentation-skill`: where docs live and what each file holds (same split: copy the core, write `references/this-repository.md`);
    - `security`;
    - `learnings-skill`: how traps are recorded in `docs/_learnings` and read before work;
    - `orchestration-skill`: how the orchestrator delegates to workers in worktrees and integrates their results (copy the core and the brief template, write `references/this-repository.md`);
    - `handoff-skill`: how an orchestrator hands its work to the next one (`handoff/` at the root);
    - `migrations-skill`: how migrations, backfills and operator SQL are written, handed off and applied (copy the core, write `references/this-repository.md`; delete it if there is no database);
    - this skill.
- The kit does not copy `crystallize-on-success` (its checklist points at this repository's canvas docs, a debug skill that stays here, a personal path and Linear), nor this repository's domain skills; the manifest's `excludedSkills` gives the reason for each.
- A skill carries detail so the rules files stay short. The rules files point to it.

### `tests/`: proof

Follow `skills/test-skill`. The layout:

- `tests/unit/<feature>/*.test.ts` and `tests/integration/<feature>/*.test.ts`: one fast runner (here Node's built-in `node:test` through `tsx`), and this is `yarn test`;
- `tests/fixtures/`: shared fakes and realistic data, for example an in-memory database client that records reads and writes, a two-organization permission fixture, and a database fake that scrambles ties;
- `tests/browser-fixtures/` (Playwright): fixture pages live only in `tests/browser-fixtures/implementation/`, and the runner copies them into the app for the run and removes them, so no test page ever ships;
- `tests/e2e/` and `tests/performance/`: added when the first full journey or performance budget needs them;
- typecheck runs separately, because a green test run is not a green build.

### `scripts/`: runners and operator tools

- **Test runners:**
    - `run-node-tests.mjs` (expands globs itself, so Windows command lines stay short);
    - `test-needed.mjs` (says whether the last green run, recorded in `.test-runs/last-green.json`, still covers the tree);
    - `run-doc-tests.mjs` (a change confined to docs, skills and the rules files runs only the tests that name the changed files);
    - `run-failed-tests.mjs` (after a failed full run, re-runs only the failing test files when nothing else changed);
    - `run-node-tests-config.mjs`: the project's settings (suites, preloads, `COVERED_PATHS`, `DOC_PATHS`), so the runners above hold none and copy between projects as they are;
    - `run-browser-fixtures.ts`.
- **Operator scripts** (backfill, repair, audit, probe, measure). Every one:
    - is a dry run by default and writes only with `--apply`;
    - takes an explicit `--environment` and never infers it;
    - names its target and checks it against the target's own rows (for example `--account` against the version's config) instead of keeping an allowlist;
    - writes conditionally (only if the row is unchanged since it was read) with a before-image, so it can be rolled back;
    - pages wide rows at about 200, ordered by a unique key;
    - prints what it would change before it changes it.
- When a project has a per-account catch-up, every new backfill registers there in the same change.

### Supporting folders

- **`migrations/<feature>/`:** every schema change, in a folder named like its `docs/<feature>/` folder, never loose at the `migrations/` root; operator data actions in `migrations/actions/`. Follow `skills/migrations-skill`: preflight, one-transaction up with guards first and a read-back last, a down that refuses when data depends on the change, applied by a person before the code that needs it ships. The schema snapshots in `docs/_global/database/` are refreshed after it is applied.
- **`workers/<service>/`:** separately deployed services, each with its own tests. Plans name the deploy order across services.
- **Gitignored working folders:**
    - `tmp/`: scratch scripts and measurements;
    - `designs/`: local design files;
    - `.test-runs/`: test-run records;
    - `references/`.

## Run The Kit

`scripts/bootstrap-project.mjs` in the kit's origin repository does the copying; what it copies and writes is one manifest, `skills/bootstrapping-a-project/references/kit-manifest.json`, so adding or removing a skill or a script is one edit there. There are two flows, and they write the same files (one collection decides what is copied for both; a test pins that they produce identical trees):

- **From a checkout, into a folder next to it** (steps 1 to 4 below): run the script from a checkout of the origin repository against a target folder. It never edits `package.json`; it prints the lines to add.
- **Export a kit, install it elsewhere:** for a machine, or a person, without a checkout of the origin repository. `node scripts/bootstrap-project.mjs --export <folder>` writes a self-contained `<folder>/splotch-bootstrap/` (`payload/` with the files at the paths they will take, `kit.json`, a standalone `install.mjs` that needs only Node, a `README.md`, and `bootstrapping-readme.md`: a step-by-step guide for the model in the new project, from the template `references/export/bootstrapping-readme.md`, with the kit's absolute path filled in where the template says `{{KIT_DIR}}`). The kit can stay in one central folder: hand that guide to the model in the new project and it runs the install from there with `--target`, then does step 3 below. It runs the same refusals as a normal run (the marker scan over everything it writes, rules files identical, self-contained imports), refuses to overwrite an existing `splotch-bootstrap/`, and writes nothing outside `<folder>`. Copy that folder into the root of a **Next.js** project and run `node splotch-bootstrap/install.mjs` (dry run), then `--apply`; `--target <dir>` installs somewhere other than the current folder. The install refuses a folder with no `package.json` or no `next` dependency, and a target inside the kit folder. It never overwrites a file and never deletes anything, the kit folder included, so delete `splotch-bootstrap/` afterwards. Both flows write `.bootstrap-kit/installed.json` in the project, the record of each file the kit created (path and hash), which the project commits. Later, `install.mjs --sync` brings the project in line with a refreshed kit: it creates the kit's new files and overwrites a verbatim copy only when the record lists it and the project has not changed it since; the project's own file at a kit path and a kit file the project changed are left and reported, to merge by hand. With no record (a project installed before the kit kept one) it overwrites nothing, and `install.mjs --record` records the kit files identical to the kit's copy, writing nothing else. **Unlike the script, install edits `package.json`**, and only with `--apply`: it adds the missing `test`, `test:unit`, `test:integration`, `test:needed`, `test:docs` and `test:failed` lines (an existing line with the same name is left alone and reported as a conflict) and `tsx` as a dev dependency at this checkout's version range, keeps the file's key order, indentation and trailing newline, and prints the install command for the lockfile it finds (`yarn install`, `npm install` or `pnpm install`; `npm install` when there is none) without running it. Then do step 3 by hand: the stubs still need Claude in the new project.

From a checkout:

1. **Dry run:** `node scripts/bootstrap-project.mjs <target-dir>` prints every file it would create, the conflicts it would skip, the gitignore lines it would add, the learnings it copies and why it leaves the others, the rules lines to adapt, the files that are only for some projects (`when`, such as a Postgres database), and the `package.json` scripts to add. It writes nothing, and refuses a target inside its own repository.
2. **Write:** add `--apply`. It never overwrites a file that exists (it lists it as a conflict and skips it), and adds only the gitignore entries that are missing, so a second run changes nothing. It records what it created in `.bootstrap-kit/installed.json`, the same record the export's install writes.
3. **Adapt, in the new project:** fill each stub `references/this-repository.md` (its headings come from the origin's file, with a TODO under each), and rewrite the rules lines the run lists (`adaptAfterBootstrap`: the database snapshot folder, the browser-fixture layout, the `yarn typecheck` and `yarn test:needed` / `test:docs` / `test:failed` commands). Do both by inspecting the new repository: its package manager, test runner, database and paths. Change all four rules files the same way, so they stay identical. Add the printed `test`, `test:unit`, `test:integration`, `test:needed`, `test:docs` and `test:failed` lines to `package.json` yourself (the script never edits it; an export's install does that for you), install `tsx` as a dev dependency (the config template preloads it), and adapt `scripts/run-node-tests-config.mjs`: the suites, and every path a test imports or reads in `COVERED_PATHS` (the template's default fits a Next.js project, and a listed path the project lacks is harmless). Delete what the run listed as only for projects where a `when` does not hold. Adapt the task families in `tasks/README.md` to the project's domains.
4. **Later, check for drift:** `node scripts/bootstrap-project.mjs --check <target-dir>` compares the project's copies of the rules files, skill cores, scripts, their tests and the transferable learnings with the origin, file by file: `same`, `adapted` (a rules file whose only changes are the lines marked for adapting), `differs` or `missing`. It exits non-zero on drift and never writes.

What it copies, as they are: the four rules files (it refuses if they are not identical), each skill's `SKILL.md` and `agents/openai.yaml` (plus the orchestration brief template), the test runners (`run-node-tests.mjs`, `test-run-record.mjs`, `test-needed.mjs`, `run-doc-tests.mjs`, `run-failed-tests.mjs`) with their generic tests, the git helpers `scripts/git/switch.ps1` and `restore-head.ps1`, the SQL catalog check `scripts/database/check-sql-catalog-qualification.mjs` (for a Postgres database), and the transferable learnings. It refuses a copied script that imports a file it does not copy. A learning is copied only when it is in the Transferable table, its own `**Scope:**` line says `transferable` (it refuses the others), and it names none of the manifest's `markers` (customers, accounts, ids, project refs, people). Naming the origin's product or its paths does not keep an entry out: its Scope line decides. What it writes from templates: `scripts/run-node-tests-config.mjs` with generic settings (`tests/unit` and `tests/integration`, tsx, a Next.js-ready default `COVERED_PATHS`), `tasks/README.md` with no rows, `docs/_global/README.md`, `docs/_global/worker-performance/README.md` (the field meanings and the current brief checklist, no history) with an empty `log.jsonl`, the learnings index listing exactly the copied entries, and `.gitkeep` files for `tasks/prioritised/`, `tasks/unprioritised/`, `handoff/` and `plans/`. It refuses the whole run if any file it would write names one of the manifest's `markers` (customer and account names and ids, project refs, people).

## Bootstrapping Steps

1. Run the kit (*Run The Kit*): the dry run, then `--apply`, or the export and its install in a Next.js project. It creates the rules files, the skill cores, the test runners and their config, the transferable learnings, the `tasks/`, `docs/_global/`, `docs/_learnings/`, `handoff/` and `plans/` skeletons, and the gitignore entries (`/references`, `/tmp/`, `/designs`, `/.test-runs/`, `**/.claude/worktrees/`).
2. Adapt the rules lines the run lists, in all four files. Check that they are identical.
3. Write each skill's `references/this-repository.md` from its stub, and delete the skills the project does not need (`migrations-skill` without a database).
4. Create the first `docs/<feature>/` folder with `README.md`, and index it in `docs/_global/README.md`. Create the other skeleton folders only when something belongs there.
5. Add the generated browser-fixture tree to the gitignore if there is one.
6. Add the `package.json` scripts the kit printed (an export's install adds them) and a `typecheck`, install `tsx` (the export's install adds it to `package.json`; run the install command it prints), and record the first green run with the full suite.
7. Adapt the families in `tasks/README.md` to the project's domains; keep the index tables, the task-file template and the lifecycle.
8. Write the first plan in `plans/` with a Status, before building the first feature.

## What Not To Copy

The kit enforces each of these; copy nothing else by hand.

- Domain content: `docs/<feature>` folders, plans, tasks, handoffs, learnings and fixtures belong to their project. Of the learnings, only the entries in the Transferable table of `docs/_learnings/README.md` whose `**Scope:**` line says `transferable` and that name no customer, account, id, project ref or person; the new index says where they came from.
- Repo-specific sections of skills: every `references/this-repository.md` is replaced by a stub; write the paths, runners and examples for the new project.
- Secrets, `.env*` files, and anything in `references/`.

## Final Checklist

- Are the four rules files present and identical, each step pointing to its skill (`learnings-skill`, `plan-skill`, `orchestration-skill`, `test-skill`, `documentation-skill`), with the lines the kit listed adapted?
- Is every stub `references/this-repository.md` filled in, with no TODO left?
- Does every feature that ships have a `docs/<feature>/` folder, and every change in flight a plan with a Status?
- Is there a `tasks/README.md` index with `prioritised/` and `unprioritised/` folders, so deferred work has a home from day one?
- Is `references/` (and every other working folder) gitignored?
- Do `yarn test`, `yarn typecheck` and `test:needed` run, with the first green run recorded?
- Do operator scripts default to a dry run, with an explicit environment?
- Does `--check` report no drift?
