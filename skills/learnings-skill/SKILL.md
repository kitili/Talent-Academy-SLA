---
name: learnings-skill
description: Use when work turned up a trap that would catch someone competent again — a fix that needed more than one wrong theory, a test that was green for the wrong reason, a tool or platform surprise, a rule found in a second place — and it should be recorded in docs/_learnings; also when reviewing, updating or indexing learnings, or reading them before starting work. Gives the bar, the naming, the scope (transferable or this repository), the entry shape, the one-line index rule, how to update instead of duplicating, and the trap families worth watching.
---

# Learnings Skill

## Purpose

`docs/_learnings/` is where a project keeps the traps it found the hard way, so the next person does not pay for them again. It is not a changelog, a postmortem archive or a design record. Every entry exists because something cost real time or shipped broken, and the same trap is likely to catch someone else.

A learning is only worth writing if it changes what someone does next. So this skill covers both halves: writing entries well, and making sure they are read.

## When To Write One

The bar: **would someone competent have fallen for this too?** If yes, write it. If it was simply a slip with no general lesson, do not.

Common triggers:
- a fix that needed more than one wrong theory before the real cause;
- a test, check or status that was green, or "ok", for the wrong reason;
- a tool, framework or platform behaving differently from what its docs, names or types suggest;
- a rule found enforced in a second place (another language, service or layer);
- a number that looked plausible and was wrong (an empty result that was really an error, a count capped silently);
- a decision that was right for one case and wrong for the general one.

Write it when the work closes, in the same change as the fix, while the evidence is at hand.

## How To Name It

Name the file as a sentence that states the trap, in kebab case: `a-green-test-run-is-not-a-green-build.md`, `a-page-size-that-worked-on-small-versions-times-out-on-large-ones.md`. The folder listing then reads as a list of warnings, and a reader can recognise their situation from the name alone. Avoid names that describe the incident (`fix-for-ticket-123.md`) or the feature (`ingestion-notes.md`).

## Scope: Transferable Or This Repository

Every entry is one of two scopes:
- **transferable**: the rule would still hold in another project or stack;
- **this repository**: understanding or applying the rule needs this project's own tables, products, scripts, deployments or vendor-platform behaviour.

Classify by the rule the entry teaches, not by the incident that surfaced it. `a-bounded-read-is-not-an-ordered-one.md` came from one project's paging bug, but it holds for any paged database read, so it is transferable. `a-config-row-is-found-by-its-code-version.md` only makes sense with that project's tables, so it is this repository. Vendor-platform traps count as this repository unless the rule holds off the platform too. When in doubt, decide; do not leave the line out.

A new project starts with the transferable entries: the bootstrap kit (`skills/bootstrapping-a-project`) copies every entry whose own Scope line says transferable, with its index row, and leaves out only one that names a customer, an account, an id, a project ref or a person. The Scope line decides, so write a transferable entry's rule so it reads without this project's context, and keep customer and account names out of it.

## What An Entry Contains

```markdown
# <The trap, as a sentence>

**Scope:** transferable | this repository
**Area:** where it bites (files, services, layers).
**Status:** open | fixed for <X> on <date> (<commit>) | designed out on <date> by <change>

## The symptom
What actually appeared, quoted exactly (error text, log line, wrong number), so the entry is found by
searching for it.

## Why it was misleading
What a reasonable person would have concluded, and why that was wrong.

## Why it happens
The mechanism, briefly, with evidence: counts, file:line, commits, the query and its date.

## What to do
The concrete check that would have caught it, specific enough to run, and the rule to follow.
```

- Evidence, not assertion: counts, paths, commit refs, measured numbers.
- Write for someone who has never seen the bug. The value is the trap, not the trip: leave out who did what and the order things were tried in.
- Keep it short. One trap per entry; a second trap gets its own file.
- Mark inferences as inferences ("not reproduced") so a reader knows what was proven.

## The Index

`docs/_learnings/README.md` keeps two tables, **Transferable** first and **This repository** second, with **one line per entry**: the link, then a single sentence or two with the concrete symptom and the rule. A new row goes into the table that matches the entry's Scope, and every entry is in exactly one table. For example:

| Entry | One line |
| --- | --- |
| `a-green-test-run-is-not-a-green-build.md` | The test runner strips types, so a green suite can still be a broken build; run the typecheck separately. |

Hold the line at one line. When an index row grows into a paragraph, the detail belongs in the entry; trim the row back to the symptom and the rule.

## Update, Don't Duplicate

- Before writing, search the index and the folder for the symptom and the mechanism. If the trap is already there in another shape, extend that entry with the new case and its date, and adjust its index line.
- When a trap is designed out, keep the entry and change its Status ("designed out on <date> by <change>"). Knowing something used to bite is how a reviewer spots it coming back.
- When an entry turns out to be wrong, correct it and say what changed. Do not quietly delete it.

## Making Sure They Are Read

A learning nobody reads changes nothing. Wire it into the places work starts:

- **The rules files** (step 1, *Study first*): read `docs/_learnings` and open every entry touching the area.
- **Plans** (`skills/plan-skill`): the *Hazards From docs/_learnings* section cites each entry that applies and says what it means for this plan.
- **Tests** (`skills/test-skill`): the test traps point to their entries.
- **Review**: when reviewing a plan or diff, check it against the index for the areas it touches.
- **Code comments**: where a fix guards against a recorded trap, a short comment naming the entry stops the next refactor from undoing it.

## Trap Families Worth Watching

These recur across projects. When work touches one, check the index and consider whether a new entry is due. This list travels to every new project with the skill, so a transferable trap that keeps recurring is promoted to a line here.

- **One rule, many layers.** The same rule enforced in SQL, the server and the UI, or in a separately deployed worker; clearing one layer is not clearing the rule.
- **The check reads the wrong path.** A test or audit reads a file or route the live system never reaches, and stays green.
- **A swallowed error reads as an empty result.** "0 found" that was really a failed query; best-effort code must still say it failed.
- **A gate only one surface can satisfy.** A requirement one screen meets is a refusal on every other.
- **Silent caps and unordered pages.** A read capped at 1,000 rows, or paged without a unique order, that drops or repeats rows without an error.
- **Defaults that were never wired.** A flag whose comment promises an environment override nothing reads; a constant read from a server env var in browser code.
- **Merged is not deployed.** Code on a branch is not code on the running deployment; verify against the deployment, not the commit.
- **Tooling that ignores a file.** A middleware, config or test file in a place the build or runner never picks up.
- **Plausible numbers.** A metric that records zero for a field (input tokens), or a price of $0, that looks fine until someone bills on it.
- **A status that outlives the fix.** A warning, flag or "pending" state nothing clears.

## Final Checklist

- Does it pass the bar (someone competent would fall for it too)?
- Is the file named as a sentence stating the trap?
- Does it quote the symptom exactly, explain why it misled, give the evidence and the concrete check?
- Does it carry a Status line?
- Does it carry a Scope line, and is its index row in the matching table?
- Is it one line in the index, with the symptom and the rule?
- Did you extend an existing entry instead, if the trap was already recorded?
