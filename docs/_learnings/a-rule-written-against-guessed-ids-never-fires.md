# A rule written against guessed ids never fires

**Scope:** transferable
**Area:** System Health segregation-of-duties checks (`src/utils/netsuite/enrichment/roleAccessMatrix.ts`)
**Status:** fixed 2026-10-05

## The symptom

On the demo account, 17 roles hold both Bills and Vendor Bill Approval (A/P Clerk, CFO, Controller
among them), yet the Role Access Matrix raised no create-and-approve conflict for vendor bills. Nothing
errored, and the matrix still found other conflicts, so it looked as if the account was simply clean.

## Why it was misleading

The rules were reasonable and the conflict list was not empty. A check that matches nothing reads the
same as a check that found nothing.

## Why it happens

The rules named the permission ids someone expected (`TRAN_VENDORBILL`, `TRAN_VENDORPYMT`) and spotted
approvals by the substring "APPROV". NetSuite reports `TRAN_VENDBILL`, `TRAN_VENDPYMT` and spells every
approval `…APPRV` (`TRAN_VENDBILLAPPRV`, `TRAN_CUSTINVCAPPRV`). So bill permissions were never
categorised, and an approval permission fell through to the generic branch and was filed as a *create*,
the opposite of what it grants. No test used a real permission id, so nothing caught it.

## What to do

- Take ids from the system's own output (a stored export, a fixture captured from a real account), never
  from memory. This repository's fixtures already held the real ids.
- Test a rule with the real ids, and include one case where the rule must fire.
- Keep a guessed spelling only as an alias beside the real one.

## The same trap from the other side (2026-10-06)

The fix above made the rules match, and the page still said "No significant SoD concerns detected": it read the
RESTlet's role block, which holds no permissions on most accounts, while only the assessment read the snapshot that
the test had used. A rule fixed against one source does not reach a reader of another; check what each reader is fed
(`docs/netsuite-access-security/architecture.md`).

And a substring match is a guessed id that over-matches. "User administration" was any `ADMI_` id containing ROLE,
USER, ACCESS or PERMISSION, so `ADMI_MOBILE_ACCESS` (Mobile Device Access) gave 76 of 92 roles user administration;
"script access" was any id containing SCRIPT, so `LIST_SUBSCRIPTION` gave it to 17. Void and report permissions
ignored the level, so a NONE or VIEW grant counted. Match the exact ids at the stated level, and test that an
unrelated id near the name does **not** fire.
