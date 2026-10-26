# A hand-copied access rule is a second resolver

**Scope:** transferable
**Area:** read access to a project's data; found while tracing the role matrix, 2026-09-29. **Status:** open, not fixed. Findings marked *trace* were reported by a code read and not re-read line by line.

## The symptom

None. Every copy passes its own tests. They disagree only for the same person on the same project, and no test asks two routes the same question.

For one project, "can this user read it?" has at least four answers in the code:

| Rule | Where | Org invitee with no project row | Org owner/admin, someone else's personal-space project |
| --- | --- | --- | --- |
| Resolver (`getCanvasPermissions`) | `src/utils/permissions-server.ts` | No | Yes (implicit editor) |
| Membership only | `resolveCanvasScope`, `agent-chats/org-scope`, `canvases/[id]/overview` | Yes | Yes |
| Hand copy A | `live-docs/canvasAccess.ts`, `functional-clustering` | Yes | Yes |
| Hand copy B | `netsuite/codeAccess.ts`, `processes/processAccess.ts`, `save-code-processes` (GET) | Company space only | **No** unless an explicit row exists |

So an org admin can edit a member's personal-space splotch by link and still get a 403 reading that project's NetSuite configs; an external collaborator cannot open a company project through the resolver but can read its Map, Live Docs and description packets, and every MCP read tool lists it.

## Why it was misleading

- Each copy was written when its route was, next to code that needed "some kind of access", and each reads plausibly beside the helper it did not call.
- The write side is centralised (`canEditSplotches`, `canIngestCode`), so the role docs looked complete; the read side never was.
- `codeAccess.ts` reads `canvas_permissions`, `organization_membership` and `spaces` directly, which looks like the resolver but drops its owner/admin branch and its invitee rule.
- A route that passes read access and then writes (see `netsuite/configs` POST and DELETE, gated on `assertCodeAccess`) turns the difference into a write hole rather than a wrong count.

**Update 2026-10-05.** The four MCP project tools and `create_workstream` now call the resolver (`resolveMcpProjectAccess`: membership, then `getCanvasPermissions` + `canViewProject`), so an invitee or a member on another member's personal-space project gets 404 there. `list_projects` and the MCP graph tools still use membership only; `plans/mcp/mcp-graph-tools-access-plan.md` is the follow-up.

**Update 2026-10-06.** MCP is designed out: the graph tools go through `resolveMcpGraphScope` (the project tools' gate, then the repository), and `list_projects` filters through `listViewableCanvasIds`, the batch form of `getCanvasPermissions` + `canViewProject`. The batch reads the same rows and calls the same `resolveCanvasUserPermissions`; it is held equal to the per-project resolver for every user and canvas of the two-organization fixture (`tests/unit/mcp/mcpGraphToolGate.test.ts`), and the listing equal to the gate. One trap found doing it: `getCanvasPermissions` reads `canvas_permissions` with `maybeSingle`, which answers "no row" when there are two, so a batch that simply took a row would list a project the gate then refuses; the batch gives the same answer. The browser routes that share `resolveCanvasScope` still use membership only.

**Update 2026-10-11 (systems, T3 and T3b).** The two hand-copied read shapes now live once, named, in `src/services/systems/systemAccess.ts` (`canReachCanvas` with `'code-access'` or `'canvas-member'`), behind `resolveRepositoryAccess`; each caller kept its shape, so the disagreement with the resolver is still open. Converting the readers for systems (a project linked to a system reads a repository whose `code.canvas_id` is another project) found the same rule in a form the grep below misses: **an equality**. `authorizedCanvasId !== access.canvasId` (Build admission), `splotch.canvas_id !== processCanvasId` (Build-session Splotch scope, critical source overlay), `processAccess.canvasId !== canvas_id` (Splotch creation), `code.canvas_id === canvasId` (document generation, Config Repair status), and `connection.canvasId === canvasId` (the deploy connection boundary) each answer "does this project own this repository", and each refused a linked project after the read path had been fixed. They now ask `projectReadsProcessRepository` / `isProjectRepository`, and the deploy boundary takes the project's system (`docs/systems/access.md`).

## The check

When a route needs "can this user see this project", call `getCanvasPermissions` and `canViewProject`. If a route cannot (it has a code id, not a canvas id), resolve the canvas first and then call it; do not re-query `organization_membership`. When touching a route that already has a copy, compare it to the resolver on three inputs: an org invitee with no row, an org admin on a personal-space project, and an org member on a personal-space project.

A grep to find the remaining copies: `organization_membership` in a file that does not import `getCanvasPermissions` or `resolveCanvasUserPermissions`. A second grep for the ownership form, which the first misses: `canvasId !==`, `canvas_id !==` and `canvas_id ===` next to an access result or a `code` row (`git grep -nE "(ccess|Access)\.canvasId|canvas_id (!==|===) "`). When a repository can be reached through more than one project, each hit is either a data lookup or a refusal of the other projects; decide which.

## Evidence

The matrix in `docs/roles-and-permissions/enforcement-trace.md` (Known Gaps 8 and 9) lists each site. A related trap on the write side: `a-signed-in-check-is-not-a-write-gate.md`.
