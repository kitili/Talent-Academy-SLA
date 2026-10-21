import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AcademyShell } from "@/components/AcademyShell";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attendanceCounts, type AttendancePerson } from "@shared/attendanceDesk";

type Payload = {
  teachers: AttendancePerson[];
  trainers: AttendancePerson[];
  cohorts: { id: string; name: string }[];
};

const STATUSES = ["present", "absent", "late", "excused"] as const;

function PeopleList({ title, rows, testId }: { title: string; rows: AttendancePerson[]; testId: string }) {
  return (
    <Card className="border-[#102448]/10 bg-white text-[#17233c]" data-testid={testId}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription className="text-[#3a4a60]">{rows.length} on the list</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-[#3a4a60]">No one is on this list yet.</p>
        ) : rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#d7deea] px-3 py-2" data-testid={`attendance-row-${row.id}`}>
            <div>
              <p className="font-medium">{row.name}</p>
              <p className="text-sm text-[#3a4a60]">{row.detail}{row.batchName ? ` · ${row.batchName}` : ""}</p>
            </div>
            <span className="rounded-md bg-[#102448]/5 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[#17233c]">
              {row.status || "Not marked"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminAttendance() {
  const { user, logoutMutation } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [role, setRole] = useState<"teacher" | "trainer">("teacher");
  const [personId, setPersonId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("present");

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
        <p className="text-sm text-[#3a4a60]">Only an admin can open attendance.</p>
      </div>
    );
  }

  const rows = [...(data?.teachers || []), ...(data?.trainers || [])];
  const counts = attendanceCounts(rows);
  const people = role === "teacher" ? data?.teachers || [] : data?.trainers || [];

  return (
    <AcademyShell
      title="Attendance"
      subtitle="Teachers and trainers"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      scene="hall"
    >
      <div className="space-y-4" data-testid="admin-attendance">
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Teachers", counts.teachers],
            ["Trainers", counts.trainers],
            ["Marked present or late", counts.present],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-[#102448]/10 bg-white px-4 py-3 text-[#17233c]">
              <p className="text-xs uppercase tracking-wide text-[#3a4a60]">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>

        <Card className="border-[#102448]/10 bg-[#fffaf4] text-[#17233c]">
          <CardHeader>
            <CardTitle className="text-lg">Mark a day</CardTitle>
            <CardDescription className="text-[#3a4a60]">Choose the person, the cohort, and whether they were here.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <select className="rounded-md border border-[#d7deea] bg-white px-2 py-2 text-sm" value={role} onChange={(event) => { setRole(event.target.value as "teacher" | "trainer"); setPersonId(""); }} data-testid="select-attendance-role">
              <option value="teacher">Teacher</option>
              <option value="trainer">Trainer</option>
            </select>
            <select className="rounded-md border border-[#d7deea] bg-white px-2 py-2 text-sm" value={personId} onChange={(event) => setPersonId(event.target.value)} data-testid="select-attendance-person">
              <option value="">Person</option>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
            <select className="rounded-md border border-[#d7deea] bg-white px-2 py-2 text-sm" value={batchId} onChange={(event) => setBatchId(event.target.value)} data-testid="select-attendance-cohort">
              <option value="">Cohort</option>
              {(data?.cohorts || []).map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
            </select>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} data-testid="input-attendance-date" />
            <select className="rounded-md border border-[#d7deea] bg-white px-2 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])} data-testid="select-attendance-status">
              {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <Button
              disabled={!personId || !batchId || mark.isPending}
              onClick={() => mark.mutate()}
              data-testid="button-save-attendance"
            >
              {mark.isPending ? "Saving…" : "Save"}
            </Button>
          </CardContent>
        </Card>

        {isLoading && <p className="text-sm text-[#3a4a60]">Opening the lists…</p>}
        {error && <p className="text-sm text-[#9b3d55]">The attendance list needs the academy database.</p>}
        {mark.error && <p className="text-sm text-[#9b3d55]">{mark.error.message}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <PeopleList title="Teachers" rows={data?.teachers || []} testId="attendance-teachers" />
          <PeopleList title="Trainers" rows={data?.trainers || []} testId="attendance-trainers" />
        </div>
      </div>
    </AcademyShell>
  );
}
