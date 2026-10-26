/**
 * Code-controlled numbers and refusals that the server, the client and the guides share.
 * Change a value here, and every reader follows; the guides quote these numbers.
 */

/** A module (lesson file) quiz passes at this share of graded questions right (D3). */
export const MODULE_QUIZ_PASS_PERCENT = 80;

/** A trainer exam (assigned quiz) passes at its own `passMark`; this is the mark when none is set. */
export const ASSIGNED_QUIZ_DEFAULT_PASS_PERCENT = 80;

/** Attempts a teacher gets at one quiz before a trainer resets it. */
export const QUIZ_ATTEMPTS = 3;

/** A course is complete when this share of its modules is complete (D4). Modules lock in order. */
export const COURSE_COMPLETE_PERCENT = 100;

/** Refusals a route sends as `{ error, code }`. The sentence is what the user sees. */
export const REFUSALS = {
  NOT_ENROLLED: "You are not in an open cohort for this course.",
  MODULE_LOCKED: "Finish the module before this one first.",
  COURSE_INCOMPLETE: "Finish every module in this course before you mark it complete.",
  NOT_YOUR_COURSE: "This course is not on a cohort you run.",
  QUIZ_NOT_APPROVED: "This quiz is waiting for a trainer to approve it.",
  ADMIN_ONLY: "Only an admin can do this.",
} as const;

export type RefusalCode = keyof typeof REFUSALS;

export function refusal(code: RefusalCode): { error: string; code: RefusalCode } {
  return { error: REFUSALS[code], code };
}
