# A cancel is undone by the next progress write

**Scope:** transferable
**Area:** any multi-step job whose steps report progress to the same row a cancel writes. Here:
`src/app/api/background-ingestion/resume/route.ts` (`updateJobStatus`, `updateJob`, the hand-off after
each step) and `src/utils/background-ingestion/jobStatusWrites.ts`.
**Status:** fixed for background ingestion on 2026-10-04 (`b033d2643`).

## The symptom

A user pressed Stop, the job read `cancelled`, and then it read `processing` again and ran to the end,
paying for every remaining wave. One PROD row ended as `completed` with `error_message`
`Job cancelled by user`.

## Why it was misleading

The cancel route worked: it wrote `cancelled`, and every reader treated `cancelled` as terminal,
including the check at the start of each step. So the job looked protected. But the step that was
already running when the cancel landed was not interrupted, and nothing it did afterwards looked at
the status.

## Why it happens

A cancel is a write to one row. The running step writes the same row several more times, and each
write was unconditional (`.update({...}).eq('id', jobId)`, 14 of them with `status: 'processing'`):

- its next progress write set the status back to `processing`, so the start-of-step check of the next
  delivery saw a live job;
- its phase write stored its in-memory `job_state` over the one the cancel had just written, and
  silently dropped what the cancel put there (the billing stamp, the children marked cancelled);
- it then queued the next step without looking.

The status check at the start of a step guards the step, not the row. Every write after it races the
cancel, and the last writer wins.

## What to do

Give every kind of write its own rule, enforced in the update itself (a `WHERE status IN (...)`), not by
reading first:

- a progress write lands only on a row that is still live (`pending`, `processing`);
- a state write never lands on a terminal row;
- before any hand-off (enqueue, delayed wakeup, child job), re-read the status, and stop unless it is
  live;
- decide on purpose what the final completion and a failure do to a cancel. Here the completion wins,
  because the work is saved, and replaces the cancel message; a failure leaves the cancel and records
  itself beside it.

To find the writes, grep for `update(` on the table across the worker, not just for `status:`. A state
write that carries no status can still undo a cancel.
