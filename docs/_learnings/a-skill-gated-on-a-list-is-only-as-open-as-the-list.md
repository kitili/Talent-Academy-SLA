# A skill gated on a list is only as open as the list

**Scope:** transferable
**Area:** agent skills that offer a change only when a capabilities tool lists it (`netsuite_config_capabilities`);
found 2026-10-09 by TAX-BUILD after record writes were switched on for the demo.

## The symptom

Record writes were switched on for the demo, and the account, term and tax entries were admitted there. The financial
skill and its references say to offer a record change "only when `netsuite_config_capabilities` lists its setting key".
That tool's route listed Enable Features settings only and never a `record.*` key, so the agent would have offered none
of them, on any account, however the flags were set.

## Why it is misleading

Every test was green. The server-side admission tests proved the demo admits the keys; the skill tests proved the skill
names the keys and the gating sentence. No test joined the two: nothing checked that the list the skill reads can ever
contain what the skill waits for. Each half was correct, and the feature was unreachable.

## The check

When a skill (or any consumer) waits for a key to appear in a list, find the producer of that list and confirm the key
can appear in it, with a test on the producer that lists such a key in the shipped state. Switching a flag on is the
moment to check this, because while the feature was off "never listed" looked the same as "correctly refused".

## Evidence

`src/app/api/netsuite/config-changes/capabilities/route.ts` before `recordChanges`; the fix is
`admittedStructuralRecordSettingKeys` (`src/utils/netsuite/configChanges/recordAdmission.ts`), tested in
`tests/unit/netsuite-configuration-write/recordAdmission.test.ts` and
`workers/agent-harness/tests/unit/test_config_capabilities_record_keys.py`.
