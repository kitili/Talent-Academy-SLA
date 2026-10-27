---
name: plan-skill
description: Use when an agent needs to create, revise, or review implementation plans in the repository's plans/ directory, especially when the user asks for a plan before implementation, asks to standardize planning, asks to incorporate reviewer feedback into a plan, or asks whether an existing plan follows repo methodology.
---

# Plan Skill

## Purpose

Use this skill to write plans that another engineer can execute with minimal ambiguity. Plans in this repo should be grounded in current code and docs, explicit about scope and risk, and clear about what will be implemented now versus deferred.

A plan here is also a record. The strongest plans in `plans/` carry their own status, the decisions taken and who took them, the probes that changed the design, and the deviations found while shipping. Someone reading one months later should be able to learn from it why the code is shaped the way it is.

## Workflow

1. Read the request and identify the feature/domain.
2. Read the instruction file for the harness you run in: `.claude/CLAUDE.md` for Claude Code or `.codex/AGENTS.md` for Codex. `rules/rules.md` is the same text; the three are kept identical, so a change to one goes to all three. There is no root `AGENTS.md`. Also read any scoped instructions, and cite the instruction file actually used rather than assuming its location. Then skim the index in `docs/_learnings/README.md` and open every entry that touches the area.
3. Establish the baseline before planning:
    - Read the relevant `docs/<feature>` folder.
    - Read related code paths, routes, components, workers, utilities, tests, migrations, schemas, and existing plans.
    - Separate shipped behavior from desired behavior, assumptions, and future ideas.
    - Compare representative plans in the same or adjacent domain for structure and established decisions. Verify their claims against current code; older plans are not evidence that a capability shipped.
    - For database work, read `docs/_global/database` and distinguish observed environment snapshots from desired migrations. Record relevant drift and any live verification still needed; do not edit snapshots to match a proposal.
    - Trace every layer that enforces a rule the plan touches: the route, the PL/pgSQL behind each `.rpc()` (open the migration), separately deployed workers, harness tools and middleware, the skill text the agent follows, and the UI that raises or hosts the action. See *One rule, many layers* below.
    - Check reachability, not just existence. A route with no caller, a flag whose live value is off, a setter no surface calls, or a column no code writes is not a capability or a signal. Find the callers and writers, and say how the path is reached today.
    - When the design depends on what data exists or on how a live system behaves, check it read-only and record the query and its date. If it cannot be checked while planning, make it Phase 0.
    - When a choice is justified by cost, latency, or tokens, measure it (for this repository's sources, see `references/this-repository.md`). Put the numbers beside the decision they drove.
    - Before writing "no source says X", look inside the tool that enforces X (`docs/_learnings/the-tool-that-validates-a-rule-already-states-it.md`).
4. Choose the plan location:
    - Prefer `plans/<feature>/<kebab-case-title>-plan.md` when a feature folder exists or should clearly exist.
    - Use `plans/<kebab-case-title>-plan.md` only for cross-cutting or one-off plans with no natural feature folder.
    - Use kebab-case filenames ending in `-plan.md`.
5. Design the simplest thing that meets the requirement before writing it up (see *Prefer the simplest design* below). Any new table, service, queue, flag, abstraction or dependency gets a one-line justification in the plan, or it is cut.
6. Write the plan. Do not implement unless the user explicitly asks to proceed. When a decision is visual, show the options as mockups built from the project's real data, and recommend one.
    - When planning is delegated (`skills/orchestration-skill/SKILL.md`), the worker writes and commits the plan on its own branch and stops. The orchestrator verifies the evidence, reconciles it with other plans, and presents the decisions with a link to the plan file. Implementation goes back to the same worker only after the user signs off.
7. When revising a plan from external feedback, verify each claim against code/docs before accepting it. Classify comments as must-fix, valid but future, non-issue, or already covered.
8. Validate the planning artifact: check existing-file references, distinguish proposed paths, reconcile scope with phases and acceptance criteria, and report what was actually verified. Keep planned implementation tests separate from tests run while authoring the plan; follow applicable repository verification requirements.
9. After implementation, update the plan rather than abandoning it:
    - Record in `Status` the commits per phase, the verification actually run, and every deviation and its reason.
    - Move current behavior into `docs/`.
    - Add a `docs/_learnings` entry for any trap that would catch someone competent again.

## Standard Plan Shape

Use only the sections that fit the work, but keep this order unless there is a strong reason to change it.

```markdown
# <Feature Or Problem> Plan

## Status

One bold line first, from the lifecycle below, with the date and the branch (and its base commit). Then the decisions taken, who took each and when. Once work ships, add commits per phase, whether they are merged and pushed, the verification actually run, and deviations with their reasons. Update this section at every step; it is the first thing a reader trusts.

Lifecycle (use these words):
- **Plan only. Not started.** Written, not yet put to the user.
- **Proposed** — awaiting decisions. Name what is waiting on whom.
- **Approved** — decisions taken (all as recommended, or list the amendments), by whom, when.
- **In progress** — which phases or tasks are built, on which branch.
- **Implemented** — all approved phases built and verified; say merged/pushed or not.
- **Deployed / accepted** — live on a named environment, with the acceptance evidence.
- **Parked**, **Superseded by `<plan>`**, or **Deferred** — with the reason, so it is never mistaken for live work.

A phase that writes production data (a backfill applied to an account) records the account, the run id and the counts; applying it to the next account is its own go-ahead.

## Objective

Explain why the plan exists, the user/business problem, and the intended outcome. When a transcript or incident prompted it, quote the symptom and name the source.

## Methodology

Name the applicable instruction file and summarize the baseline work performed: docs read, code paths traced, live data checked, scope boundaries, implementation expectations, and test/documentation expectations.

## Baseline Findings

Describe current shipped behavior, relevant architecture, data flows, schema/contracts, tests, docs, and known gaps. Cite `file:line` for claims that matter. Give live evidence with its query and date.

## Scope

List what is in scope and out of scope. Call out live integrations, compatibility promises, data boundaries, security boundaries, and non-goals.

## Desired Behavior

Define the target behavior in plain language. Use tables or small contracts when they reduce ambiguity.

## Design Decisions

Number them (D1, D2, ...). Each gives the decision, why, and the alternative rejected and why.

## Simplest Design And What Was Cut

Say why this is the smallest design that meets the requirement and what it reuses (storage, services, patterns, code paths). Give each new table, service, queue, flag, abstraction or dependency a one-line justification. When a plan is simplified, list what was cut and why cutting it is safe.

## Key Changes

Group proposed changes by subsystem: API, worker, database, UI, caching, docs, tests, migrations, deployment, or feature-specific modules.

## Implementation Plan

Break work into phases or ordered steps with dependencies, concrete deliverables, and verification gates. Include rollback/fallback behavior when relevant. A user-facing phase should reach its real entry points and consumers, not stop at an unwired helper. When the design rests on unverified live behavior, Phase 0 is a probe that ships no code. Record its results in the plan and say what they changed.

## Task Boundaries

For delegated or parallel work, a table of tasks: what each builds, the files it owns, the contracts it shares with other tasks (a list of names, a response shape, a constant mirrored in another language, fixed here before either starts), its tests, and the worker's model with a one-line reason (the rule is in `skills/orchestration-skill/SKILL.md`, *Choosing The Model*: Opus when the worker must decide, a mistake would be quiet, or other tasks build on it; Sonnet otherwise). Draw boundaries by file ownership: tasks that edit the same files, or build on each other's output, run in sequence.

## Public Interfaces

List new or changed APIs, types, constants, env vars, database columns, migrations, artifacts, routes, files, and user-visible behavior. Explicitly say "No database migration" or "No API response shape change" when true.

## Data Boundary And Security

Use for authz, PII, financial/customer data, service-role access, RLS, external APIs, or customer-facing trust claims. Name every access-control change explicitly, even one that grants the user nothing new.

## Test Plan

Specify unit, integration, browser, smoke, migration, and typecheck coverage by file name. Tests should exercise app-used functions and contracts, not unused helpers. See *Test Plan Conventions* below.

## Documentation Plan

List docs folders/files to update. Put unimplemented ideas in `future-improvements.md`, not current-behavior docs.

## Rollout Plan

Use for flags, staged release, backward compatibility, production migrations, retry/backfill, and operational monitoring. Name each separately deployed service the change touches and the deploy order.

## Risks And Guardrails

Call out failure modes, performance/cost risks, live-system regressions, access-control risks, and mitigations.

## Hazards From docs/_learnings

Cite each entry that applies and say what it means for this plan specifically.

## Acceptance Criteria

State how we know the work is done: a concrete journey on a named environment, including the negative cases, verified from the durable record rather than from what a screen says.

## Decisions

Number the open questions and put the recommended option first, with the alternatives and what each costs. When one is taken, strike it through and record who decided and when.

## Out Of Scope

List what this plan deliberately does not do, so a reviewer does not read an omission as an oversight.

## Future Improvements

Defer useful but non-essential work here.

## Assumptions

List assumptions that materially affect the plan. Separate recommended decisions from unresolved questions; state how material unknowns will be resolved and which implementation step depends on them.
```

## Repo Planning Conventions

- Start with a `Status` and an `Objective`; readers should know where the plan stands and why it matters without reading the thread. Use the status lifecycle words above, and keep the Status current at every step.
- Prefer the simplest design. Reuse before adding; justify anything new in one line or cut it; say what was cut and why that is safe.
- Include a methodology/baseline section for non-trivial work. Name the docs and code paths actually inspected.
- Prefer evidence over assertion. If a claim matters, ground it in current implementation, schema, tests, docs, logs, live rows, or reference data.
- Preserve live behavior by default. For live integrations, explicitly state compatibility, rollout, migration, and fallback behavior.
- Distinguish constants, env vars, migrations, and public API contracts. If a flag should be code-static instead of env-driven, say so.
- Do not overfit to a single incident. Capture the general failure mode and add tests or docs that prevent recurrence.
- Avoid vague implementation bullets such as "improve the service." Name the subsystem and the concrete behavior change.
- Keep plans current-tense about the proposal, not shipped behavior. After implementation, move reality into `docs/`.
- Mark current repository behavior, verified live behavior, and proposed behavior separately when deployment state matters. Include inspection dates and authoritative source links for external capability claims that determine the design.
- For external writes or durable jobs, explain partial success, uncertain outcomes, retry/idempotency limits, concurrent writers, cancellation, and post-write verification where relevant. Distinguish reverting application code from reversing external effects; do not promise atomicity or exactly-once execution without evidence.
- For changes to live state, identify affected readers, caches, and agent context, and explain how freshness and historical artifacts are preserved. Keep this proportional to the actual feature.
- For multiple UI/agent entry points, name the shared server enforcement boundary and preserve established authentication/authorization decisions. Do not rely on UI or prompt instructions as the only enforcement.
- If the plan touches data ingestion, metering, exports, auth, permissions, or financial/customer data, include a data-boundary/security section.
- Record decisions in the plan with the recommended option first. Once one is taken, keep the struck-through question with who decided and when, so the reasoning survives.
- If reviewer feedback is incorporated, add or update a short "Reviewer Corrections Incorporated" section only when it helps future readers understand why the plan changed.

## Patterns That Recur In This Repo

Each of these cost real time before it was written down. Check the plan against every one that applies. The examples, surfaces, services and runners that belong to this repository alone, and its own patterns (such as every backfill joining the account catch-up), are in `references/this-repository.md`.

### Prefer the simplest design

Maintainability depends on it, so simplicity is a condition of approval, not a style preference.

- Meet the requirement with the smallest design. Reuse existing storage (job state, existing artifacts, existing tables), services, patterns and code paths before adding new ones.
- Every new table, service, queue, flag, abstraction or dependency carries a one-line justification, or it is cut.
- When a plan is simplified, list what was cut and why that is safe (for the plan to model it on, see `references/this-repository.md`).
- Do not build for hypothetical needs. Narrowing or deleting code beats adding a layer.
- Prefer one shared list over a per-target allowlist that needs a code change for each new account; check the target against its own rows instead (for this repository's example, see `references/this-repository.md`).

### Model spend: estimate it, keep what was paid for

For any step that calls a model:
- Estimate the spend in the dry run, from the real prompts.
- Keep every valid paid result: isolate failures per call or group, save results as they arrive, and leave an unanswered item unwritten so a re-run retries only it. One unparseable answer must never discard its siblings.
- Retry only failures, bounded, and record each failure with its reason.
- Decide who pays (for this repository's rule, see `references/this-repository.md`).

### Quality checks log; safety and truth checks block

Heuristics about whether text is *good* (structure, purpose wording, specificity) misfire both ways, so they record their verdict and do not block; their logs are how the prompts improve. Checks for *safety and truth* (secrets, links and addresses, invented names, claims the evidence contradicts) block, and log what they blocked so a misfire is found fast. Block on the value, not the word: describing that a script handles a token is not a leak; copying one is.

### One rule, many layers

The same invariant is usually enforced in more than one language and service, over different sources of truth. For each rule the plan changes or relies on, list every enforcement point and say which one fires first. A job the route admits and the database later refuses fails minutes after the request, with a message the caller cannot act on.

For an example from this repository, see `references/this-repository.md`. (`docs/_learnings/one-rule-many-layers.md`, `clearing-one-layer-of-a-rule-is-not-clearing-the-rule.md`)

Skill text is a layer too. A skill that forbids what the code allows can make a capability unreachable. A skill that promises what the code refuses sends the agent into retries.

### Every surface that raises the action

For each gate, context field, or interrupt the plan adds or depends on, list which surfaces set or host it and which read it (this repository's surfaces: see `references/this-repository.md`).

- A gate only one surface can satisfy is a refusal on every other.
- An interrupt kind needs a host on every screen that owns a stream, pinned by a contract test that loops over those screens.
- (`a-gate-only-one-surface-can-satisfy-is-a-refusal-on-every-other.md`, `an-interrupt-needs-a-host-on-every-screen-that-owns-a-stream.md`, `a-documented-entry-point-can-be-unreachable.md`)

### Consent is a gate; checks flag

Keep the two apart in the plan.

- **Consent** is an approval the harness raises and waits on, never prose the model may skip.
- **Checks** surface a finding and carry on where the product says so (see `references/this-repository.md`).
- **Refusals** are added only when a production write would otherwise be misrouted, or to move an existing refusal earlier. New enforcement ships `off`, logging what it would deny, before it moves to `required`.
- **Every refusal** is structured (`{ error, code, remediation }`) and names a repair that exists on the surface showing it. (`a-check-on-the-agent-build-path-flags-it-never-refuses.md`)

### Server-owned authority: confirm, don't select

When a request carries scope (this repository's scopes: see `references/this-repository.md`), the server derives the authority from its own rows or from a token it minted. The caller may confirm that scope, never select it. A visible or plausible value is not authority; name the one chain that decides it. (`a-visible-account-is-not-deployment-authority.md`)

### Preview, consent, apply, bound to what was shown

For a write a user must approve:
1. Preview it read-only.
2. Show exactly that preview for consent.
3. Apply it with a fingerprint that proves the apply matches what was shown.

For the models to follow here, see `references/this-repository.md`.

### Keep secrets and opaque values away from the model

Credentials never enter tool results, the agent's virtual filesystem, checkpointed state, or logs. A signed URL is fetched without auth headers.

Never make the model retype an opaque value (a token, a fingerprint) between two tool calls. Keep it in harness state and pass a short handle, or do both steps in one tool call. (`an-opaque-string-the-model-must-retype-is-a-string-it-will-corrupt.md`)

### Judge outcomes from the durable record

A tool call is not a tool result, and a status is evidence only of what it attests. Name the row that proves success and make acceptance read it (this repository's example: see `references/this-repository.md`). (`a-tool-call-is-not-a-tool-result.md`, `a-successful-write-that-wrote-nothing.md`)

### Plan the after-state on every screen

Walk the journey through success and through each failure, and say what every screen shows afterwards. States clear as well as set:

- For this repository's example of a state that clears, see `references/this-repository.md`.
- A readiness flag derived from a consumed session can report a completed write as unsent. (`a-successful-deploy-that-reports-itself-as-unsent.md`)

### Services, environments, and deploy order

Name each separately deployed service the change touches (this repository's services: see `references/this-repository.md`).

- **Deploy order.** Routes ship before the tools that call them (this repository's other ordering rules: see `references/this-repository.md`).
- **Version skew.** Say what happens while two services run different versions.
- **Environments.** State which database each environment reads (this repository's: see `references/this-repository.md`) and where acceptance runs.

### Measure, then decide

When the argument is cost or speed, measure it. A number from the live system settles what intuition cannot, and it belongs in the plan next to the decision it drove.

## Test Plan Conventions

- **Where tests live.** Under `tests/unit`, `tests/integration` and `tests/browser-fixtures`, exercising code the app runs. Name the files.
- **This repository's layers and runners** (browser fixtures, separately tested services, worktrees): see `references/this-repository.md`.
- **Typecheck.** Plan `yarn typecheck` separately from the tests. The test runner strips types, so a green suite can still be a broken build. (`a-green-test-run-is-not-a-green-build.md`)
- **Which suite to run.** `yarn test` for any code change. `yarn test:needed` says whether the last green run still covers the tree. `yarn test:docs` is enough when only docs, skills or the rules files changed, and `yarn test:failed` when the last full run failed and only its failing test files changed. Contract tests read docs as text, so a docs-only change can still fail. (`a-docs-only-change-can-fail-the-suite.md`)
- **Database tests.** Keep tests that execute against a database out of `yarn test`. Run them by hand and note them in the feature's `test-suite.md`.
- **Tests that can pass for the wrong reason.** A test that pins a refusal must fail when the refusal is removed, not only when its wording changes. A contract that reads source as text cannot guard a move to another file. (`a-refusal-test-that-passes-when-the-refusal-is-gone.md`, `a-test-that-reads-source-as-text-cannot-guard-a-move.md`)

## Quality Bar

A good plan should answer:

- What problem are we solving and why now?
- Where does the plan stand (its Status), and who decides what next?
- What exists today?
- Is this the simplest design that works? What was cut, and why is that safe?
- What exactly changes?
- What stays unchanged?
- Which layers enforce each rule it touches, and does every surface that raises the action reach the change?
- What does each screen show after success and after failure?
- What was verified live, how, and when?
- What can regress?
- How do we test it?
- What docs change?
- How do we roll it out or back out, and in what order do the services deploy?
- Which ideas are intentionally deferred?

If those answers are not clear, keep studying before writing the plan.
