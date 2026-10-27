# A fallback to any connection in the organization can write to a customer

**Scope:** transferable
**Area:** every write to a customer's system chosen from a pool of credentials: `POST /api/netsuite/deploy`, the
Live Documentation reader install, the process-version revert, Enable Features, the SDF deploy queue and worker.
**Status:** designed out on 2026-10-14 (inventory I-65): every write resolves the project's own account first
(`src/utils/netsuite/projectAccount.server.ts`) and refuses otherwise; the queue and the worker check it again.
Two layers remain open and are a task: the deployment ledger's PL/pgSQL `prepare` and the approval card's account
label.

## The symptom

Nothing visible. With no Build-session binding the deploy route took "the first valid production connection by id
among the canvas's and the organization's connections", and returned `accountId` only after queueing. Enable Features
did the same with `inScope.find((c) => c.isValid)`. Every test passed, and every audited deploy (56 SDF jobs, 33
config-change requests on PROD, 2026-05 to 2026-10-14) landed on the requesting project's own account, so the defect
had never fired. It was found by reading the code, not by an incident.

## Why it was misleading

The selector did check a boundary: the connection had to belong to the project or to the project's organization, and
the code comments called that "the data boundary". An organization reads like one customer. Here it is not: Splotch's
own organization holds the connections of several customers it works with (Keeco, Workpods, test accounts), so "in
the organization" admitted another customer's production account, and "sorted by id" made which one a matter of
UUID order. Each connection was valid and production, so nothing downstream (the queue, the worker's scope re-check,
the ledger's `connection.organization_id = p_organization_id`) objected either: they all re-checked the same
organization rule.

## Why it happens

Authorization was modelled on who may act (canvas access, organization role) and on which credentials are visible to
that scope. The target, which account the write lands in, was never a separate question; it fell out of "first
credential I am allowed to use". A pool scoped by tenant answers "may I use this credential", not "is this the system
this project is about". The project's account was already recorded (its repository's newest config row names the
account it was read from), and the record writes built after 2026-10-08 used it, but the older paths predate them.

## What to do

- Resolve the target from the object's own binding first (here: the project's repository account), then filter the
  credential pool to that target. A credential for any other target is never a fallback, and no binding is a refusal,
  never "the first one".
- Refuse with a structured answer that names the bound target and how to bind a credential for it
  (`{ error, code, remediation }`; codes `project_account_unbound`, `connection_not_project_account`,
  `project_account_connection_unavailable`).
- A session or approval binding must name the same target; compare it with the project's account, not only with the
  credential list.
- Re-check at every layer that can act: route, queue, worker (a separately deployed service), and any SQL `prepare`
  that admits by tenant alone. Grep for the old predicate (`isNetSuiteConnectionInDeployScope`,
  `loadConnectionsByOrganization`) outside the file you fixed.
- Test it with two valid production credentials for different targets in one tenant, the wrong one sorting first.
  A pool with one credential cannot fail this test.

Related: `a-visible-account-is-not-deployment-authority.md` (the same trap between the approval card and the server),
`one-rule-many-layers.md`.
