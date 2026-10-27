import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { SkeletonRows } from "@/components/Skeletons";
import { AcademyShell } from "@/components/AcademyShell";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttendanceBoard } from "@/components/AttendanceBoard";
import type { AttendancePerson } from "@shared/attendanceDesk";

type Payload = {
  teachers: AttendancePerson[];
  trainers: AttendancePerson[];
  cohorts: { id: string; name: string }[];
};

/** Present first, as on the board. Colours are by meaning: done, needs attention, at risk, out of the viewer's hands. */
const STATUSES = [
  { value: "present", label: "Present", chip: "bg-sl-done-soft text-sl-done" },
  { value: "late", label: "Late", chip: "bg-sl-attention-soft text-sl-attention" },
  { value: "absent", label: "Absent", chip: "bg-sl-risk-soft text-sl-risk" },
  { value: "excused", label: "Excused", chip: "bg-sl-neutral-soft text-sl-neutral" },
] as const;

type StatusValue = (typeof STATUSES)[number]["value"];

const FIELD = "min-h-11 w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-sl-ink">{label}</label>
      {children}
      {hint && <span id={`${id}-hint`} className="text-[13px] text-sl-muted">{hint}</span>}
    </div>
  );
}

function longDate(date: Date) {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function shortDate(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** The people no mark has reached, in one plain line per kind of person. */
function unmarkedNotes(fellows: AttendancePerson[], trainers: AttendancePerson[]) {
  const note = (rows: AttendancePerson[], one: string, many: string) => {
    const missing = rows.filter((row) => !row.status).length;
    if (rows.length === 0) return `No ${one} is on the list yet.`;
    if (missing === rows.length) return `No ${one} has been marked yet.`;
    if (missing > 0) return `${missing} ${missing === 1 ? one : many} ${missing === 1 ? "has" : "have"} no mark yet.`;
    return "";
  };
  return [note(fellows, "Fellow", "Fellows"), note(trainers, "Trainer", "Trainers")].filter(Boolean);
}

export default function AdminAttendance() {
  const { user, logoutMutation } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [role, setRole] = useState<"teacher" | "trainer">("teacher");
  const [personId, setPersonId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState<StatusValue>("present");

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["/api/admin/attendance"],
    queryFn: async () => {
      const res = await fetch("/api/admin/attendance", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load attendance");
      return res.json();
    },
  });

  const mark = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/attendance", { role, personId, batchId, date, status });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not save attendance");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/attendance"] });
    },
  });

  if (user && user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-sl-muted">Only an admin can open attendance.</p>
      </div>
    );
  }

  const fellows = data?.teachers || [];
  const trainers = data?.trainers || [];
  const people = role === "teacher" ? fellows : trainers;
  const recent = [...fellows, ...trainers]
    .filter((row) => row.status)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const notes = unmarkedNotes(fellows, trainers);

  return (
    <AcademyShell
      title="Attendance"
      subtitle="Fellows and Trainers"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      desk="admin"
      current="attendance"
      scene="hall"
    >
      <div className="flex max-w-[1040px] flex-col gap-6" data-testid="admin-attendance">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-sl-ink">Attendance</h1>
          <p className="text-sm text-sl-muted">Mark Fellows and Trainers for a day. Today is {longDate(new Date())}</p>
        </div>

        <section aria-labelledby="attendance-mark" className="flex flex-col gap-4 rounded-xl border border-sl-line bg-sl-surface p-5">
          <h2 id="attendance-mark" className="text-lg font-semibold text-sl-ink">Mark attendance</h2>
          <form
            aria-labelledby="attendance-mark"
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (personId && batchId && !mark.isPending) mark.mutate();
            }}
          >
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <Field id="att-who" label="Who">
                <select
                  id="att-who"
                  className={FIELD}
                  value={role}
                  onChange={(event) => { setRole(event.target.value as "teacher" | "trainer"); setPersonId(""); }}
                  data-testid="select-attendance-role"
                >
                  <option value="teacher">Fellow</option>
                  <option value="trainer">Trainer</option>
                </select>
              </Field>
              <Field id="att-person" label="Person">
                <select id="att-person" className={FIELD} value={personId} onChange={(event) => setPersonId(event.target.value)} data-testid="select-attendance-person">
                  <option value="">Choose a person</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </Field>
              <Field id="att-cohort" label="Cohort">
                <select id="att-cohort" className={FIELD} value={batchId} onChange={(event) => setBatchId(event.target.value)} data-testid="select-attendance-cohort">
                  <option value="">Choose a cohort</option>
                  {(data?.cohorts || []).map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
                </select>
              </Field>
              <Field id="att-date" label="Date" hint="Today is filled in.">
                <Input id="att-date" type="date" className="min-h-11 border-sl-control text-[15px]" value={date} onChange={(event) => setDate(event.target.value)} aria-describedby="att-date-hint" data-testid="input-attendance-date" />
              </Field>
            </div>

            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" data-testid="select-attendance-status">
              <legend className="mb-2 p-0 text-sm font-semibold text-sl-ink">Status</legend>
              <div className="flex flex-wrap gap-2.5">
                {STATUSES.map((item) => (
                  <label
                    key={item.value}
                    htmlFor={`st-${item.value}`}
                    className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-4 py-2.5 text-[15px] text-sl-ink ${
                      status === item.value ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"
                    }`}
                  >
                    <input
                      id={`st-${item.value}`}
                      type="radio"
                      name="att-status"
                      value={item.value}
                      checked={status === item.value}
                      onChange={() => setStatus(item.value)}
                      className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]"
                      data-testid={`radio-attendance-${item.value}`}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <Button
              type="submit"
              disabled={!personId || !batchId || mark.isPending}
              className="min-h-11 self-start bg-sl-accent-strong px-6 text-[15px] font-semibold text-white hover:bg-sl-accent-strong/90"
              data-testid="button-save-attendance"
            >
              {mark.isPending ? "Saving…" : "Save"}
            </Button>
          </form>
          {mark.error && <p className="text-sm text-sl-risk" role="alert">{mark.error.message}</p>}
        </section>

        {error && <p className="text-sm text-sl-risk" role="alert">The attendance list needs the academy database.</p>}

        <section aria-labelledby="attendance-recent" className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface">
          <h2 id="attendance-recent" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
            Recent marks
            {!isLoading && <span className="font-medium text-sl-muted"> · {recent.length}</span>}
          </h2>
          {isLoading ? (
            <SkeletonRows label="Loading recent marks" rows={4} />
          ) : recent.length === 0 ? (
            <p className="px-5 py-4 text-sm text-sl-muted">No one has been marked yet. Each mark you save appears here with its date, cohort and status.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Person</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Cohort</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => {
                    const chip = STATUSES.find((item) => item.value === row.status);
                    return (
                      <tr key={`${row.role}-${row.id}`} className="border-t border-sl-neutral-soft" data-testid={`attendance-row-${row.id}`}>
                        <td className="px-5 py-3 text-sl-muted">{shortDate(row.date)}</td>
                        <td className="px-3 py-3 text-sl-ink">
                          {row.name} <span className="text-sl-muted">· {row.role === "trainer" ? "Trainer" : "Fellow"}</span>
                        </td>
                        <td className="px-3 py-3 text-sl-ink">{row.batchName || "—"}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip?.chip ?? "bg-sl-neutral-soft text-sl-neutral"}`}>
                            {chip?.label ?? row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!isLoading && notes.map((note) => (
            <p key={note} className="border-t border-sl-neutral-soft px-5 py-3 text-[13px] text-sl-muted">{note}</p>
          ))}
        </section>

        <AttendanceBoard />
      </div>
    </AcademyShell>
  );
}
