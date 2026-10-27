---
name: documentation-skill
description: Use when an agent needs to create, update, review or reorganise a project's docs/ folder — choosing the home for a piece of documentation, writing a feature folder's standard files, keeping docs to shipped behaviour while plans hold proposals, recording dated changes, maintaining environment schema snapshots, and keeping docs honest when tests read them as contracts. The core method is portable; references/this-repository.md says how docs/ is laid out in this repository.
---

# Documentation Skill

## Purpose

Docs say what the system does **today**, so that anyone can work on it without reading the thread that built it. Plans say what is about to change (`skills/plan-skill`); learnings say what bit us (`skills/learnings-skill`). Keep the three apart and each stays trustworthy.

**This file is the portable core.** For how `docs/` is laid out in this repository (its homes, examples and the tests that read docs), read `references/this-repository.md`. A new project copies this file and writes its own reference file.

## Layout

```text
docs/
  <feature>/                 # one folder per feature, subsystem, integration or bounded area
    README.md  architecture.md  operations.md  relevant-files.md  test-suite.md  future-improvements.md
    <topic>.md  <topic>/      # extra topic files or a subfolder when the feature is large
  _global/                   # the cross-feature map, and repo-wide topics (practices every feature follows)
    <topic>/
  _learnings/                # traps found the hard way (skills/learnings-skill)
  database/                  # environment snapshots of the live schema, if there is a database
```

Create a file only when it carries real information. A small feature may start with `README.md` alone.

## Feature Or Repo-Wide Topic?

The test is whether it has behaviour of its own, backed by code that implements it.

- **A feature** does something: a product capability or subsystem whose behaviour a user or another part of the system can observe, implemented by code it owns (routes, components, services, tables, workers, jobs). Shared infrastructure is a feature too: authentication, metering, background jobs and an agent harness each get `docs/<feature>/`, however widely they are used.
- **A repo-wide topic** is a practice, convention or policy that every feature follows, with no behaviour of its own and no code path it owns: testing practice, environments and deploy topology, the security and authorization model every route must follow, data-boundary and privacy policy, observability and logging conventions, coding conventions. It lives in `docs/_global/<topic>/`.

Tie-breakers:
1. If it ships code a user or system can call or observe, it is a feature.
2. If it is a rule about how features are built, tested, deployed or secured, it is a topic.
3. A topic states the rule and links to the features that implement it; it never restates a feature's behaviour. (The security topic says "every write route authorizes the caller through the resolver"; the authentication feature documents how the resolver works.)
4. Still unsure: ask the owner before creating the folder.

## `docs/_global/`: The Cross-Feature Map And Repo-Wide Topics

`docs/_global/` holds what no single feature folder can: repo-wide topics (above, one folder each) and the cross-feature map. Feature folders explain each feature on its own; the map explains **how the features relate**:

- **Dependencies:** for each feature, what it relies on in other features (shared tables, routes, services, workers, constants, skills) and what relies on it, with the direction of the dependency.
- **Dependency clusters:** groups of features that change together because they share data, a pipeline or a contract (for example ingestion → classification → the Map → the agent).
- **Blast radius:** what else to check, test or redeploy when a feature changes; the shared contracts whose change ripples (a name list mirrored in several services, a table several features write).
- **Cross-feature flows:** journeys that cross feature boundaries, step by step, each step linking to the feature folder that owns it.

Keep it a map, not a copy: one line per relationship, linking to the feature folders for the detail. Update it whenever a feature gains or loses a dependency on another, in the same change.

## The Standard Files

| File | Holds | Does not hold |
| --- | --- | --- |
| `README.md` | What the feature is and does today: purpose, main flows, user-visible behaviour, boundaries with neighbouring features. A vocabulary table when the words on screen differ from the names in code (term → code identifier → meaning). Environment limits stated plainly (for example "production only"). | Proposals, how-to steps, file lists |
| `architecture.md` | How it works: modules, data flow, contracts, state and caches, permissions, failure modes, trade-offs, and **each rule with every place it is enforced** (route, database function, worker, skill text, UI). | Operational commands |
| `operations.md` | How to run, configure, backfill, repair, roll back and verify it, with the exact commands, their flags (dry run, apply, environment) and what to check after. | Design rationale |
| `relevant-files.md` | An honest file map: only the files that matter, one line each on their role, and the boundaries with adjacent features. Remove stale paths. | Every file that mentions the feature |
| `test-suite.md` | Behaviour → test file → layer → covered today or not, the accepted gaps with reasons, and tests run by hand (for example against a database). | Planned tests listed as coverage |
| `future-improvements.md` | Ideas and known gaps that are not built, each clearly labelled. | Anything shipped |

Large features add topic files (`data-boundary.md`, `performance/`, an agent-facing map) rather than bloating one file.

## Conventions

- **Shipped behaviour only.** If it is not running, it belongs in `future-improvements.md` or a plan. Mark anything gated by an off flag as such.
- **Date and source every significant change.** Add a dated note in the section it changes ("(2026-10-03, `plans/<feature>/<plan>.md`)") so a reader knows how current it is and where the reasoning lives. Link the plan; do not copy it.
- **Plans move into docs when they ship.** After implementation, current behaviour moves from the plan into the feature's docs, and the plan keeps the history.
- **Link, don't duplicate.** One feature explains its own behaviour; others link to it. Shared infrastructure gets its own home.
- **Name rules where they are enforced.** A rule documented in one place but enforced in three is a trap. List every enforcement point.
- **Environment boundaries are explicit.** Say which database each deployment reads, what runs only in production, and which flags gate what.
- **Docs can be test contracts.** If tests read docs as text, a docs-only change can fail the suite; run the tests that read the changed docs.

## Choosing A Home

- One feature owns it → `docs/<feature>/`.
- How features relate (a dependency, a shared contract, a cluster, a blast radius) → the cross-feature map in `docs/_global/`.
- A practice or policy every feature follows, with no code of its own → `docs/_global/<topic>/` (see *Feature Or Repo-Wide Topic?*).
- Several features share infrastructure or a rule → its own feature folder, with the relationships recorded in `docs/_global/`.
- It is a trap someone would fall into again → `docs/_learnings/` (`skills/learnings-skill`).
- It is a proposal → `plans/`.
- It is evidence (an export, a customer document, a measurement) → `references/`, outside git.
- **No obvious home for a new feature → ask the owner before creating a folder**: "This looks like a new feature not yet covered in our documentation. I propose a new folder `docs/<name>`. Do you agree?"

## Database Snapshots

If the project has a database, `docs/_global/database/` keeps a snapshot of each environment's live schema as it was observed (production, staging), the export script that produced it, and a `drift.md` of known differences. Snapshots are evidence, not desired state:
- never edit a snapshot to match code, another environment or a migration;
- change the schema only through migrations;
- refresh a snapshot only from a new export of the live database;
- surface differences between environments as drift rather than "fixing" them in the docs.

## Maintenance Rules

When code changes, update the same feature folder in the same change:

| Change | Update |
| --- | --- |
| Behaviour | `README.md` |
| Architecture, state flow, permissions, enforcement points | `architecture.md` |
| Commands, backfills, repairs, deployment, rollback | `operations.md` |
| Files added, moved, renamed or deleted | `relevant-files.md` |
| Tests added, removed or changed | `test-suite.md` |
| Work deferred or a gap found | `future-improvements.md` |
| A dependency on another feature gained, removed or changed | `docs/_global/` |
| A trap found the hard way | `docs/_learnings/` |

## Final Checklist

- Does every statement describe shipped behaviour, with anything unbuilt or flag-gated labelled?
- Are significant changes dated and linked to their plan?
- Does `architecture.md` name every place each rule is enforced?
- Is `relevant-files.md` honest, with no stale paths?
- If a cross-feature dependency changed, is `docs/_global/` updated?
- Is `test-suite.md` updated, with gaps in their own section?
- If tests read these docs, did the doc tests pass?
- Was a new docs home confirmed with the owner?
