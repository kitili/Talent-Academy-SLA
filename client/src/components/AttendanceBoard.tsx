import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

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

function rateLabel(rate: number | null, marked: number) {
  if (!marked || rate == null) return "No marks yet";
  return `${rate}%`;
}

function rateClass(rate: number | null, marked: number) {
  if (!marked || rate == null) return "bg-[#f4eadc] text-[#102448]";
  if (rate >= 80) return "bg-[#3d6b2f] text-white";
  if (rate >= 50) return "bg-[#c47b2b] text-white";
  return "bg-[#9b3d55] text-white";
}

function PersonList({
  title,
  tone,
  empty,
  children,
}: {
  title: string;
  tone: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#102448]/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#162033]">
      <div className={`px-4 py-3 text-white ${tone}`}>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-[#102448]/10 dark:divide-white/10">
        {children ?? <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>}
      </div>
    </section>
  );
}

export function AttendanceBoard() {
  const { data, isLoading, isError } = useQuery<{ teachers: TeacherRow[]; trainers: TrainerRow[] }>({
    queryKey: ["/api/admin/attendance"],
  });

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-2xl bg-[#102448]/10" data-testid="admin-attendance" />;
  }

  const teachers = data?.teachers || [];
  const trainers = data?.trainers || [];

  return (
    <div className="space-y-3" data-testid="admin-attendance">
      <div>
        <h2 className="text-lg font-semibold text-[#17233c] dark:text-[#f6f1e8]">Attendance</h2>
        <p className="text-sm text-muted-foreground">
          Approved teachers and the cohorts each trainer leads. Present and late marks count toward the rate.
        </p>
      </div>
      {isError && <p className="text-sm text-[#9b3d55]">Attendance could not be loaded.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <PersonList title="Teachers" tone="bg-[#0f7a6c]" empty="No approved teachers yet.">
          {teachers.length === 0 ? null : teachers.map((teacher) => (
            <article key={teacher.id} className="px-4 py-3" data-testid={`attendance-teacher-${teacher.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#17233c] dark:text-[#f6f1e8]">{teacher.name}</p>
                  <p className="text-xs text-muted-foreground">{teacher.email || teacher.username}</p>
                  <p className="mt-1 text-xs text-[#1d4e89]">{teacher.cohorts || "No cohort yet"}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${rateClass(teacher.rate, teacher.marked)}`}>
                  {rateLabel(teacher.rate, teacher.marked)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {teacher.present} present · {teacher.late} late · {teacher.absent} absent · {teacher.excused} excused
              </p>
            </article>
          ))}
        </PersonList>
        <PersonList title="Trainers" tone="bg-[#1d4e89]" empty="No approved trainers yet.">
          {trainers.length === 0 ? null : trainers.map((trainer) => (
            <article key={trainer.id} className="px-4 py-3" data-testid={`attendance-trainer-${trainer.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#17233c] dark:text-[#f6f1e8]">{trainer.name}</p>
                  <p className="text-xs text-muted-foreground">{trainer.email || trainer.username}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${rateClass(trainer.rate, trainer.marked)}`}>
                  {rateLabel(trainer.rate, trainer.marked)}
                </span>
              </div>
              {trainer.cohorts.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No cohort yet</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {trainer.cohorts.map((cohort) => (
                    <li key={cohort.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#17233c] dark:text-[#f6f1e8]">
                        {cohort.name} · {cohort.teachers} teachers
                      </span>
                      <span className="text-muted-foreground">{rateLabel(cohort.rate, cohort.marked)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </PersonList>
      </div>
    </div>
  );
}
