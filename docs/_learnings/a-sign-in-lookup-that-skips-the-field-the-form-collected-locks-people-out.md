# A sign-in lookup that skips a field the sign-up form collected locks people out

**Scope:** this repository
**Area:** `server/auth.ts` (`findApprovedAccount`), `server/accessRequests.ts`, the request form in `client/src/pages/unified-auth.tsx`
**Status:** fixed on 2026-10-29 by `staffCandidates` / `teacherCandidates` and the pure pickers `pickApprovedStaff` / `pickApprovedTeacher`

## The symptom

An Admin approved a request. The person created a password ("Password saved. Sign in with it.") and then could not
sign in with the login they had just made: `Invalid username or password`.

## Why it was misleading

Every step reported success. The request, the approval and the password step all found the desk by its username, so
the desk plainly existed and held the new password. The password check itself was correct.

## Why it happens

The request form collects a name, an email **and a username**, and the password step finds the desk by either. Sign-in
looked a Fellow up by email or numeric Fellow ID only, so a Fellow who typed the username they chose got no desk at
all. Three smaller gaps sat beside it:

- staff lookups were exact-case (`eq(users.username, …)`) while the request lookups were `LOWER(...)`;
- the password step stored the password as typed, while sign-in trims it, so a trailing space locked the person out;
- a name that matched two desks (an Admin and a Trainer on one email) tried only the first.

## The check

When a form collects several identifiers, grep every place that looks the person up and compare the fields:

```bash
grep -n "getTeacherByEmail\|getTeacherByUsername\|getUserByUsername\|LOWER(" server/auth.ts server/accessRequests.ts
```

Sign-in, the status check and the password step must resolve a name through the same function. They now do
(`staffCandidates`, `teacherCandidates`), and `tests/unit/auth/approved-request-login.test.ts` drives the deciding
functions with real scrypt hashes.
