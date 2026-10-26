# A server-written reason that quotes a label leaks through a public projection

**Scope:** transferable
**Area:** any payload projected for an outside reader field by field; here the action plan summary on a shared link (`src/utils/live-report/publicReportPayload.ts`, written by `actionSummaryResolution.ts`).
**Status:** fixed on 2026-10-23 (`6d177dd12`, merged in `60eddbe3d`; the risk-driver half in the T4b merge `7c4097776`). Both are pinned through the payload by tests.

## The symptom

Found in review, before the board shipped; no error, no failing test. The projection for an external reader copied the summary field by field and blanked every component outside the share's figures, so the review treated it as an allow list that could not leak a name. Two string fields it copied did:

- the "Not counted" reason of a "What we read" group, which the write path builds from the element whose read failed: `The impact read for "<label>" failed, so what it reads was not counted.`;
- a risk driver's `evidence`, which the agent may write as a target's identity (a script id such as `customscript_…`).

An outside reader of a shared board would have been shown the name of a component the projection had just blanked on the same page ("a component outside the shared map").

## Why it was misleading

"The field is copied by the projection" read as "the field is safe", because the unsafe fields are the ones that hold a name. A reason is typed as a string and reads as prose, not as data about an element. The blanking is decided per element against the share's scope, and a sentence the server composed earlier, from the unblanked element, is outside that decision. The failing element could lie outside the share, which is exactly where the blanking applies.

## Why it happens

The write path (`actionSummaryResolution.ts`) is internal and may name anything. It stores free text that interpolates `label` or `identity`, and the projection later copies the string without knowing a name is in it. Free text is the one field type a field-by-field projection cannot check.

## What to do

- For any string the server composes and an outside reader receives, either send a **fixed sentence or an enum**, or **re-derive it from a table** at projection time. `PUBLIC_NOT_COUNTED_REASONS` replaces each group's reason; `projectSeverity` lets a not-rated reason through only when it is one of the fixed sentences (`ACTION_SUMMARY_NOT_RATED_REASONS`); `projectEstimate` re-reads the not-sized reason from the bucket table; `riskDrivers` crosses as the driver alone.
- When adding a stored string that interpolates a label, grep the template literals in the write path for `${…label}` and `${…identity}`, and ask what its projection does with it.
- Test it through the real write and the real projection with a **label outside the share**, and assert the output text does not contain it. Testing only the projection with hand-written fixtures proves nothing when the fixture never contained a name.

Related: [one-rule-many-layers.md](one-rule-many-layers.md)
