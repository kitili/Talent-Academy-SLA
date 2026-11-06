import { FELLOW_TYPE_LABELS, TRAINER_TYPE_LABELS, fellowTypeOf, trainerTypeOf } from "./academyPeople";

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

/** The date of a mark, on the attendance page and in its CSV. Marks are UTC midnight, so they are read in UTC. */
export function markDateLabel(iso?: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export type AttendanceExportMark = {
  person: string;
  role: "teacher" | "trainer";
  /** `fellow_type` or `trainer_type`. */
  type?: string | null;
  cohort: string;
  /** YYYY-MM-DD. */
  date: string;
  status: string;
};

const STATUS_LABELS: Record<AttendanceStatus, string> = { present: "Present", absent: "Absent", late: "Late", excused: "Excused" };

/**
 * One CSV cell. A spreadsheet runs a cell that starts with = + - or @, quoted or not and even after spaces, and a
 * leading tab or carriage return can hide one, so those get an apostrophe in front and open as text.
 */
export function csvCell(value: string) {
  const safe = /^\s*[=+\-@]|^[\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function kindOf(mark: AttendanceExportMark) {
  return mark.role === "trainer"
    ? `${TRAINER_TYPE_LABELS[trainerTypeOf(mark.type)]} Trainer`
    : `${FELLOW_TYPE_LABELS[fellowTypeOf(mark.type)]} Fellow`;
}

/** The attendance CSV, newest mark first. The byte order mark makes Excel read a name such as Wanjirũ as UTF-8. */
export function attendanceCsv(marks: AttendanceExportMark[]) {
  const rows = [...marks]
    .sort((a, b) => b.date.localeCompare(a.date) || a.cohort.localeCompare(b.cohort) || a.person.localeCompare(b.person))
    .map((mark) => [
      mark.person,
      kindOf(mark),
      mark.cohort,
      markDateLabel(mark.date),
      isAttendanceStatus(mark.status) ? STATUS_LABELS[mark.status] : mark.status,
    ]);
  const lines = [["person", "kind", "cohort", "date", "status"], ...rows].map((row) => row.map(csvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}
