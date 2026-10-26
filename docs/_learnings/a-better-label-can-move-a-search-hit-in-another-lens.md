# A better label can move a search hit in another lens

**Scope:** transferable
**Where:** the Schema's "Find in Map" (`NetSuiteSchemaGraphPreview` to `SystemGraphMapPane`),
`resolveMapSearchMatch` in `src/utils/process-graph/mapSearchMatch.ts`; found 2026-09-23, the day
after the Schema's custom records got the account's names back.

## What happened

"-DE P2P Global Vendor Payment" in the Schema, Find in Map, used to open the "Custom Record Type -
-DE P2P Global Vendor Payment" object on the Map. After the record identity fix it opened a record
node with the same name and a saved search under it. Nothing on the Map had changed in code.

The Map's record catalog is built from the same schema inventory, and a custom record is drawn twice
on the Map: a record node, and the object that defines it. Find in Map sends only a name, and the Map
resolves names record first, on purpose. The record node used to carry the id-built label
"Customrecord De P2p Glo Vendor Payment", which the name did not match, so the resolver fell through
to the definition. Fixing the label made the record node match first. The old, "correct" behaviour
had been an accident of a wrong label.

## Why it is a trap

- A label is data to one lens and a search key to another. Improving it in the Schema re-ranked the
  Map's search without touching the Map.
- The regression looks like the new change broke navigation, when it actually exposed that the jump
  never said which node it meant.
- Record-first is the right rule for a typed name, so "fixing" the ranking globally would break the
  search bar and the agent's `open_panel(focus=…)`.

## The rule

A cross-lens jump carries the identity it already knows, not only a name. The Schema now passes the
record's id beside its name, and the Map lands a custom record or custom transaction on the object
whose own id IS that record id (`resolveMapFindInMapTarget`), falling back to the name. When one lens
feeds another's labels, check the other lens's name-based lookups after changing them.

## How to check for it

- For every jump or deep link that sends a name, ask what node it means and whether a label change
  elsewhere could make a different node match first.
- `tests/unit/process-graph/mapSearchMatch.test.ts` pins the regression shape: by name alone the
  record node wins; with the id, the definition does.
