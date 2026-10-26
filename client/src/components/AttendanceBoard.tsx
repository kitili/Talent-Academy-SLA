import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

const STATUSES = [
  { key: "present", label: "Present", color: "#0ca30c" },
  { key: "late", label: "Late", color: "#fab219" },
  { key: "absent", label: "Absent", color: "#d03b3b" },
  { key: "excused", label: "Excused", color: "#9aa3ad" },
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

function Figure({ label, value, note, swatch }: { label: string; value: string | number; note?: string; swatch?: string }) {
  return (
    <div className="rounded-2xl border border-[#102448]/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#162033]">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {swatch && <span className="h-2.5 w-2.5 rounded-full" style={{ background: swatch }} aria-hidden />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-[#17233c] dark:text-[#f6f1e8]">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function StatusSplit({ totals, marked }: { totals: Record<StatusKey, number>; marked: number }) {
  if (!marked) {
    return <p className="text-sm text-muted-foreground">No attendance marked yet. The split appears after the first marks.</p>;
  }
  return (
    <div className="space-y-2" data-testid="attendance-split">
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Attendance split by status">
        {STATUSES.filter((status) => totals[status.key] > 0).map((status) => (
          <span
            key={status.key}
            title={`${status.label}: ${totals[status.key]}`}
            style={{ width: `${(totals[status.key] / marked) * 100}%`, background: status.color }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STATUSES.map((status) => (
          <span key={status.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: status.color }} aria-hidden />
            {status.label} {totals[status.key]} ({Math.round((totals[status.key] / marked) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

function CohortRates({ trainers }: { trainers: TrainerRow[] }) {
  const seen = new Map<string, { name: string; rate: number; marked: number; teachers: number }>();
  let unmarked = 0;
  for (const trainer of trainers) {
    for (const cohort of trainer.cohorts) {
      if (seen.has(cohort.id)) continue;
      if (!cohort.marked || cohort.rate == null) {
        unmarked += 1;
        continue;
      }
      seen.set(cohort.id, { name: cohort.name, rate: cohort.rate, marked: cohort.marked, teachers: cohort.teachers });
    }
  }
  const data = Array.from(seen.values()).sort((a, b) => b.rate - a.rate);
  return (
    <section className="rounded-2xl border border-[#102448]/10 bg-white p-4 dark:border-white/10 dark:bg-[#162033]" data-testid="attendance-cohort-chart">
      <h3 className="font-semibold text-[#17233c] dark:text-[#f6f1e8]">Attendance rate by cohort</h3>
      <p className="text-xs text-muted-foreground">
        Present and late out of all marks.{unmarked > 0 ? ` ${unmarked} cohort${unmarked === 1 ? " has" : "s have"} no marks yet.` : ""}
      </p>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No cohort has attendance marks yet.</p>
      ) : (
        <div style={{ height: Math.max(140, data.length * 40 + 40) }} className="mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke="#102448" strokeOpacity={0.08} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 12 }} stroke="#8a94a6" />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} stroke="#8a94a6" />
              <Tooltip
                cursor={{ fill: "#102448", fillOpacity: 0.05 }}
                formatter={(value: number) => [`${value}%`, "Attendance"]}
                labelFormatter={(label, payload) => {
                  const row = payload?.[0]?.payload;
                  return row ? `${label} · ${row.marked} marks · ${row.teachers} Fellows` : label;
                }}
              />
              <Bar dataKey="rate" fill="#1d4e89" radius={[0, 4, 4, 0]} barSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function PeopleTable({ title, head, rows, empty }: { title: string; head: string[]; rows: Array<{ id: string; cells: (string | number)[] }>; empty: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#102448]/10 bg-white dark:border-white/10 dark:bg-[#162033]">
      <h3 className="border-b border-[#102448]/10 px-4 py-3 font-semibold text-[#17233c] dark:border-white/10 dark:text-[#f6f1e8]">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                {head.map((cell, index) => (
                  <th key={cell} className={`px-4 py-2 font-medium ${index > 0 ? "text-right" : ""}`}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#102448]/5 dark:border-white/5" data-testid={`attendance-row-${row.id}`}>
                  {row.cells.map((cell, index) => (
                    <td key={index} className={`px-4 py-2 ${index > 0 ? "text-right tabular-nums" : "font-medium text-[#17233c] dark:text-[#f6f1e8]"}`}>{cell}</td>
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

export function AttendanceBoard({ variant = "full" }: { variant?: "compact" | "full" }) {
  const { data, isLoading, isError } = useQuery<{ teachers: TeacherRow[]; trainers: TrainerRow[] }>({
    queryKey: ["/api/admin/attendance-summary"],
  });

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-[#102448]/10" data-testid="admin-attendance" />;
  }

  const teachers = data?.teachers || [];
  const trainers = data?.trainers || [];
  const { totals, marked, rate } = totalsFor(teachers);

  return (
    <div className="space-y-3" data-testid="admin-attendance">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-[#17233c] dark:text-[#f6f1e8]">Attendance</h2>
          <p className="text-sm text-muted-foreground">
            {marked ? `${marked} marks across ${teachers.length} approved Fellows.` : "No attendance marked yet."}
          </p>
        </div>
        {variant === "compact" && (
          <Link href="/admin/attendance" className="text-sm font-medium text-[#1d4e89] hover:underline" data-testid="link-open-attendance">
            Open attendance
          </Link>
        )}
      </div>
      {isError && <p className="text-sm text-[#9b3d55]">Attendance could not be loaded.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Figure label="Attendance rate" value={rateLabel(rate, marked)} note="Present + late" />
        {STATUSES.map((status) => (
          <Figure key={status.key} label={status.label} value={totals[status.key]} swatch={status.color} />
        ))}
      </div>
      <StatusSplit totals={totals} marked={marked} />
      {variant === "full" && (
        <>
          <CohortRates trainers={trainers} />
          <div className="grid gap-4 lg:grid-cols-2">
            <PeopleTable
              title="Fellows"
              head={["Fellow", "Present", "Late", "Absent", "Excused", "Rate"]}
              empty="No approved Fellows yet."
              rows={teachers.map((teacher) => ({
                id: teacher.id,
                cells: [teacher.name, teacher.present, teacher.late, teacher.absent, teacher.excused, rateLabel(teacher.rate, teacher.marked)],
              }))}
            />
            <PeopleTable
              title="Trainers"
              head={["Trainer", "Cohorts", "Marks", "Rate"]}
              empty="No approved trainers yet."
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
