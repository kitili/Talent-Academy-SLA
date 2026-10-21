import { LEARNING_STAGES, LESSON_STAGES } from "@shared/tanzaniaPath";

function chipClass(active: boolean) {
  return active ? "bg-[#102448] text-white" : "bg-[#f4eadc] text-[#102448]";
}

/** Playgroup to Standard 7 for primary trainers, Form I for secondary trainers. */
export function LearningPath({ activeStageIds = [] }: { activeStageIds?: string[] }) {
  const groups = [
    { track: "primary", label: "Primary trainers" },
    { track: "secondary", label: "Secondary trainers" },
  ] as const;

  return (
    <div className="space-y-2 rounded-2xl border bg-white p-3" data-testid="learning-path">
      {groups.map((group) => (
        <div key={group.track} className="flex flex-wrap items-center gap-1.5" data-testid={`path-${group.track}`}>
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </span>
          {LEARNING_STAGES.filter((stage) => stage.track === group.track).map((stage) => (
            <span
              key={stage.id}
              data-testid={`path-stage-${stage.id}`}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${chipClass(activeStageIds.includes(stage.id))}`}
            >
              {stage.label}
            </span>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Government lesson: {LESSON_STAGES.join(" · ")}. Playgroup uses Montessori.
      </p>
    </div>
  );
}

export function activeStagesFromNames(names: Array<string | null | undefined>) {
  const folded = names.filter(Boolean).map((name) => String(name).toLowerCase());
  return LEARNING_STAGES.filter((stage) =>
    folded.some((name) => name.includes(stage.label.toLowerCase()) || name === stage.course.toLowerCase()),
  ).map((stage) => stage.id);
}
