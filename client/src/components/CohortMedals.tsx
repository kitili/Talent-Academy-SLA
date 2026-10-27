import { Check } from "lucide-react";
import type { Medal, MedalKind } from "@shared/cohortMedals";
import { Loading, SkeletonBar } from "@/components/Skeletons";

/** What earns each medal, shown on a medal not earned yet (an earned one shows its own `detail`). */
const HOW: Record<MedalKind, string> = {
  "first-step": "Start your first course",
  "keeping-time": "Attendance at 80% or more",
  questions: "Answer a quiz question",
  "quiz-pass": "Pass a quiz",
  "strong-progress": "Reach 60% progress or finish a course",
  "course-done": "Finish a course",
  "trainer-star": "Given by a trainer",
};

/**
 * One even grid of a cohort's medals, earned first. An earned medal has a green check and what earned it; one not yet
 * earned has a dashed circle and what earns it. Colour here means status only: green is earned.
 */
export function CohortMedals({ medals, showCount = true, loading = false }: { medals: Medal[]; showCount?: boolean; loading?: boolean }) {
  // `loading` is set by a page whose medals have not arrived: the grid in outline, not an empty one.
  if (loading) {
    return (
      <Loading label="Loading your medals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-start gap-3 rounded-lg border border-sl-line bg-sl-surface px-4 py-3">
            <SkeletonBar className="h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-4 w-2/3" />
              <SkeletonBar className="h-3 w-full" />
            </div>
          </div>
        ))}
      </Loading>
    );
  }
  if (!medals.length) return null;
  const earned = medals.filter((medal) => medal.earned);
  const ordered = [...earned, ...medals.filter((medal) => !medal.earned)];
  return (
    <div data-testid="cohort-medals">
      {showCount && <p className="mb-2 text-xs text-sl-muted">{earned.length} of {medals.length} medals</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map((medal) => (
          <li
            key={medal.kind}
            className="flex items-start gap-3 rounded-lg border border-sl-line bg-sl-surface px-4 py-3"
            title={medal.earned ? medal.detail : HOW[medal.kind]}
            data-testid={`medal-${medal.kind}`}
            data-earned={medal.earned ? "yes" : "no"}
          >
            {medal.earned ? (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sl-done text-sl-surface" aria-hidden="true">
                <Check className="h-4 w-4" />
              </span>
            ) : (
              <span className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-dashed border-sl-muted/60" aria-hidden="true" />
            )}
            <span className="min-w-0 text-sm leading-snug">
              <span className="block font-semibold text-sl-ink">{medal.title}</span>
              {medal.earned ? (
                <span className="block text-sl-muted">
                  <span className="font-semibold text-sl-done">Earned</span> · {medal.detail}
                </span>
              ) : (
                <span className="block text-sl-muted">{HOW[medal.kind]}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
