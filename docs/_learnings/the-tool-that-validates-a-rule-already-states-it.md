# The tool that validates a rule already states it

**Scope:** transferable

"No first-party source says which objects need a NetSuite feature" was written into
a plan and believed for a week. The SuiteCloud SDK the deploy runner calls had been
stating it all along, for 41 object types, 204 object settings and 145 standard
records.

## The symptom

The Map's "Requires feature" filter could answer for 6 of the demo account's 106
enabled features. Its derivation was a hand-curated table of eleven rows, each
citing a deploy-runner rule or the Enable Features page, and the plan behind it
listed "more gates, each with a citation" as future work: workbooks ("the
SuiteAnalytics Workbook feature id is unverified"), custom field applies-to flags,
standard record types. Each looked like research nobody had a source for.

## Why it was misleading

Every citation the table had pointed *around* the SDK: at our own deploy runner's
rules (`deriveManifestDependencies`) and at the page. The SDK was treated as the
thing that executes a deploy, not as a source of facts — even though
`project:validate` refuses exactly these cases with `MissingRecordFeature` and
`MissingFieldFeature`, which means it has to know them.

It does, as data, in the jar the CLI installs
(`~/.suitecloud-sdk/cli/cli-<version>.jar`):

- `sdf_metadata/sdf_metadata.xml`: a `<feature>` on each gated object type
  (workflow → `WORKFLOW`, workbook and dataset → `USR`, emailtemplate → `CRM`,
  customrecordtype → `CUSTOMRECORDS`), and `feature="…"` with the field's `type` and
  `default` on each gated setting (`crmcustomfield.appliestosolution` →
  `KNOWLEDGEBASE`, `transactionbodycustomfield.bodyexpensereport` → `EXPREPORTS`,
  `scriptdeployment.auddepartment` → `DEPARTMENTS`);
- `sdf_metadata/list/*.xml`: standard record types per feature (Solution →
  Knowledge Base, Support Case → Customer Support) and 307 List/Record field
  sources.

The feature catalogue's generator had been reading `list/configurable_features.xml`
from the same jar for weeks.

## The check

Before recording "no source exists" for a rule, ask which tool *enforces* it, and
look inside that tool's distribution for the table it enforces from. A validator
that names the rule in its error messages holds the rule somewhere.

Here: `unzip -l ~/.suitecloud-sdk/cli/cli-2025.2.1.jar | grep sdf_metadata`, then
`scripts/generate-netsuite-sdf-feature-gates.ts`, which now turns it into
`src/utils/netsuite/sdfFeatureGates.generated.ts` with the jar named in its
provenance. The same demo answered for 37 of 106 enabled features after the SDK's
gates joined the table (2026-09-28).

A validation rule is not automatically a runtime one, though — see
[an-sdf-feature-gate-is-a-deploy-gate-not-a-runtime-one.md](an-sdf-feature-gate-is-a-deploy-gate-not-a-runtime-one.md).
