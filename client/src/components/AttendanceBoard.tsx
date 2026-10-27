import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { SkeletonBar, SkeletonFigures, SkeletonRows } from "@/components/Skeletons";

type TeacherRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  cohorts: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  rate: number | null;
};

type TrainerRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  marked: number;
  rate: number | null;
  cohorts: Array<{ id: string; name: string; teachers: number; marked: number; rate: number | null }>;
};

/** Status colours by meaning: present is done, late needs attention, absent is a risk, excused is out of the viewer's hands. */
const STATUSES = [
  { key: "present", label: "Present", bar: "bg-sl-done" },
  { key: "late", label: "Late", bar: "bg-sl-attention" },
  { key: "absent", label: "Absent", bar: "bg-sl-risk" },
  { key: "excused", label: "Excused", bar: "bg-sl-neutral" },
] as const;

type StatusKey = (typeof STATUSES)[number]["key"];

function rateLabel(rate: number | null, marked: number) {
  if (!marked || rate == null) return "—";
  return `${rate}%`;
}

function totalsFor(teachers: TeacherRow[]) {
  const totals: Record<StatusKey, number> = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const teacher of teachers) {
    for (const status of STATUSES) totals[status.key] += teacher[status.key] || 0;
  }
  const marked = totals.present + totals.late + totals.absent + totals.excused;
  const rate = marked ? Math.round(((totals.present + totals.late) / marked) * 100) : null;
  return { totals, marked, rate };
}

/** One white line of figures: the rate, then each status. */
function SummaryLine({ totals, marked, rate }: { totals: Record<StatusKey, number>; marked: number; rate: number | null }) {
  const figures: Array<[string, string | number]> = [
    ["Attendance rate", rateLabel(rate, marked)],
    ...STATUSES.map((status): [string, number] => [status.label, totals[status.key]]),
  ];
  return (
    <div className="space-y-3 rounded-xl border border-sl-line bg-sl-surface px-5 py-3.5" data-testid="attendance-split">
      <p className="flex flex-wrap gap-x-7 gap-y-2 text-[15px] text-sl-ink">
        {figures.map(([label, value]) => (
          <span key={label}>
            <span className="text-sl-muted">{label}</span> <span className="font-semibold">{value}</span>
          </span>
        ))}
      </p>
      {marked > 0 && (
        <div className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-sl-neutral-soft" role="img" aria-label="Attendance split by status">
          {STATUSES.filter((status) => totals[status.key] > 0).map((status) => (
            <span
              key={status.key}
              title={`${status.label}: ${totals[status.key]}`}
              className={status.bar}
              style={{ width: `${(totals[status.key] / marked) * 100}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Cohorts with marks, each with its rate; the cohorts with none are named together on the last line. */
function CohortRates({ trainers, allCohorts, loading }: { trainers: TrainerRow[]; allCohorts: Array<{ id: string; name: string }>; loading: boolean }) {
  const seen = new Map<string, { id: string; name: string; rate: number; marked: number }>();
  for (const trainer of trainers) {
    for (const cohort of trainer.cohorts) {
      if (seen.has(cohort.id) || !cohort.marked || cohort.rate == null) continue;
      seen.set(cohort.id, { id: cohort.id, name: cohort.name, rate: cohort.rate, marked: cohort.marked });
    }
  }
  const marked = Array.from(seen.values()).sort((a, b) => b.rate - a.rate);
  // A cohort the attendance lists know of but no trainer's rollup has marks for.
  const unmarked = allCohorts.filter((cohort) => !seen.has(cohort.id));
  return (
    <section className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface" aria-labelledby="attendance-by-cohort" data-testid="attendance-cohort-chart">
      <h2 id="attendance-by-cohort" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">By cohort</h2>
      {loading ? (
        <SkeletonRows label="Loading cohorts" rows={3} />
      ) : (
      <ul>
        {marked.map((cohort) => (
          <li key={cohort.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-neutral-soft px-5 py-3.5">
            <Link href={`/cohorts/${cohort.id}`} className="text-[15px] font-semibold text-sl-accent hover:underline">{cohort.name}</Link>
            <span className="text-sm text-sl-ink">
              <strong className="font-semibold">{cohort.rate}%</strong>{" "}
              <span className="text-sl-muted">· {cohort.marked} mark{cohort.marked === 1 ? "" : "s"}</span>
            </span>
          </li>
        ))}
        {unmarked.length > 0 && (
          <li className="flex flex-col gap-1.5 px-5 py-3.5">
            <span className="text-[15px] font-semibold text-sl-ink">
              {unmarked.length} cohort{unmarked.length === 1 ? "" : "s"} · no marks yet
            </span>
            <span className="text-sm leading-relaxed text-sl-muted">{unmarked.map((cohort) => cohort.name).join(" · ")}</span>
          </li>
        )}
        {marked.length === 0 && unmarked.length === 0 && (
          <li className="px-5 py-4 text-sm text-sl-muted">No cohort has attendance marks yet.</li>
        )}
      </ul>
      )}
    </section>
  );
}

function PeopleTable({ title, head, rows, empty, testId }: { title: string; head: string[]; rows: Array<{ id: string; cells: (string | number)[] }>; empty: string; testId: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface" data-testid={testId}>
      <h3 className="border-b border-sl-line px-5 py-3.5 text-base font-semibold text-sl-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-5 py-5 text-sm text-sl-muted">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-sl-muted">
                {head.map((cell, index) => (
                  <th key={cell} scope="col" className={`py-2.5 font-medium ${index === 0 ? "px-5" : "px-3 text-right"}`}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-sl-neutral-soft" data-testid={`attendance-row-${row.id}`}>
                  {row.cells.map((cell, index) => (
                    <td key={index} className={`py-3 ${index === 0 ? "px-5 font-medium text-sl-ink" : "px-3 text-right tabular-nums text-sl-ink"}`}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AttendanceBoard({ variant = "full", heading = "All marks so far" }: { variant?: "compact" | "full"; heading?: string }) {
  const { data, isLoading, isError } = useQuery<{ teachers: TeacherRow[]; trainers: TrainerRow[] }>({
    queryKey: ["/api/admin/attendance-summary"],
  });
  // Every cohort by name, so the ones with no marks can be listed. The attendance page loads the same list.
  const { data: lists, isLoading: listsLoading } = useQuery<{ cohorts: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/admin/attendance"],
    enabled: variant === "full",
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="admin-attendance">
        <div className="space-y-2">
          <SkeletonBar className="h-5 w-44" />
          <SkeletonBar className="h-4 w-64 max-w-full" />
        </div>
        <SkeletonFigures label="Loading attendance" line count={5} />
        {variant === "full" && (
          <>
            <section className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface">
              <h2 className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">By cohort</h2>
              <SkeletonRows label="Loading cohorts" rows={3} />
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
              <SkeletonRows label="Loading Fellows" rows={4} className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface" />
              <SkeletonRows label="Loading Trainers" rows={4} className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface" />
            </div>
          </>
        )}
      </div>
    );
  }

  const teachers = data?.teachers || [];
  const trainers = data?.trainers || [];
  const { totals, marked, rate } = totalsFor(teachers);

  return (
    <div className="space-y-4" data-testid="admin-attendance">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-sl-ink">{heading}</h2>
          <p className="text-sm text-sl-muted">
            {marked ? `${marked} marks across ${teachers.length} approved Fellows.` : "No attendance marked yet."}
          </p>
        </div>
        {variant === "compact" && (
          <Link href="/admin/attendance" className="inline-flex min-h-11 items-center text-sm font-semibold text-sl-accent hover:underline" data-testid="link-open-attendance">
            Open attendance
          </Link>
        )}
      </div>
      {isError && <p className="text-sm text-sl-risk" role="alert">Attendance could not be loaded.</p>}
      <SummaryLine totals={totals} marked={marked} rate={rate} />
      {variant === "full" && (
        <>
          <CohortRates trainers={trainers} allCohorts={lists?.cohorts ?? []} loading={listsLoading} />
          <div className="grid gap-4 lg:grid-cols-2">
            <PeopleTable
              title="Fellows"
              head={["Fellow", "Present", "Late", "Absent", "Excused", "Rate"]}
              empty="No approved Fellows yet."
              testId="attendance-teachers"
              rows={teachers.map((teacher) => ({
                id: teacher.id,
                cells: [teacher.name, teacher.present, teacher.late, teacher.absent, teacher.excused, rateLabel(teacher.rate, teacher.marked)],
              }))}
            />
            <PeopleTable
              title="Trainers"
              head={["Trainer", "Cohorts", "Marks", "Rate"]}
              empty="No approved Trainers yet."
              testId="attendance-trainers"
              rows={trainers.map((trainer) => ({
                id: trainer.id,
                cells: [trainer.name, trainer.cohorts.length, trainer.marked, rateLabel(trainer.rate, trainer.marked)],
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
