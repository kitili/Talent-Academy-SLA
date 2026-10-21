export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendancePerson = {
  id: string;
  name: string;
  role: "teacher" | "trainer";
  detail?: string | null;
  batchName?: string | null;
  status?: string | null;
  date?: string | null;
};

export function attendanceCounts(rows: AttendancePerson[]) {
  const teachers = rows.filter((row) => row.role === "teacher");
  const trainers = rows.filter((row) => row.role === "trainer");
  const marked = rows.filter((row) => row.status);
  return {
    teachers: teachers.length,
    trainers: trainers.length,
    marked: marked.length,
    present: marked.filter((row) => row.status === "present" || row.status === "late").length,
  };
}

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return ATTENDANCE_STATUSES.includes(value as AttendanceStatus);
}
