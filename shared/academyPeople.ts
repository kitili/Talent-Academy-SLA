/**
 * The kinds of Fellow and Trainer, and the calendar rules both desks share.
 * Pure functions: the server, the pages and the tests all read the same words.
 */

/** In-house Fellows learn at Talent Academy. Pre-service Fellows come for a short stretch of assessments. */
export const FELLOW_TYPES = ["in_house", "pre_service"] as const;
export type FellowType = (typeof FELLOW_TYPES)[number];

/** In-house Trainers work as before. Instructional Trainers visit to teach and may run online sessions. */
export const TRAINER_TYPES = ["in_house", "instructional"] as const;
export type TrainerType = (typeof TRAINER_TYPES)[number];

export const FELLOW_TYPE_LABELS: Record<FellowType, string> = {
  in_house: "In-house",
  pre_service: "Pre-service",
};

export const TRAINER_TYPE_LABELS: Record<TrainerType, string> = {
  in_house: "In-house",
  instructional: "Instructional",
};

export const FELLOW_TYPE_HINTS: Record<FellowType, string> = {
  in_house: "Learns at Talent Academy.",
  pre_service: "Comes for two or three weeks of assessments.",
};

export const TRAINER_TYPE_HINTS: Record<TrainerType, string> = {
  in_house: "Trains at the academy.",
  instructional: "Visits to teach, and may run online sessions.",
};

export function fellowTypeOf(value: unknown): FellowType {
  return value === "pre_service" ? "pre_service" : "in_house";
}

export function trainerTypeOf(value: unknown): TrainerType {
  return value === "instructional" ? "instructional" : "in_house";
}

/** A choice made on a form: only the two known words count, anything else is a mistake to report. */
export function parseFellowType(value: unknown): FellowType | null {
  if (value === undefined || value === null || value === "") return "in_house";
  return (FELLOW_TYPES as readonly string[]).includes(String(value)) ? (String(value) as FellowType) : null;
}

export function parseTrainerType(value: unknown): TrainerType | null {
  if (value === undefined || value === null || value === "") return "in_house";
  return (TRAINER_TYPES as readonly string[]).includes(String(value)) ? (String(value) as TrainerType) : null;
}

/** Only an instructional Trainer (or an Admin) may attach a meeting link, a video or materials to a session. */
export function canRunOnlineSessions(actor: { role?: string | null; trainerType?: string | null } | null | undefined) {
  if (!actor) return false;
  if (actor.role === "admin") return true;
  return actor.role === "trainer" && trainerTypeOf(actor.trainerType) === "instructional";
}

/** Both kinds of Fellow see every lesson, quiz and assessment. The type labels a person; it never narrows access. */
export function fellowSeesAllLearning(_type: unknown) {
  return true;
}

// ── Sessions and the annual calendar ───────────────────────────────────────

export const SESSION_KINDS = ["session", "assessment", "deadline", "holiday", "other"] as const;

export const CALENDAR_KINDS = ["term", "holiday", "training", "assessment", "event", "deadline"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

export const CALENDAR_KIND_LABELS: Record<CalendarKind, string> = {
  term: "Term",
  holiday: "Holiday",
  training: "Training",
  assessment: "Assessment",
  event: "Event",
  deadline: "Deadline",
};

export type CalendarEntryInput = {
  title: string;
  description: string | null;
  kind: CalendarKind;
  startDate: Date;
  endDate: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** One line on the annual calendar, checked. The end date is optional and may not come before the start. */
export function parseCalendarEntry(body: unknown): CalendarEntryInput | { error: string } {
  const value = (body || {}) as Record<string, unknown>;
  const title = String(value.title ?? "").trim().replace(/\s+/g, " ");
  if (title.length < 2) return { error: "Add a title" };
  if (title.length > 160) return { error: "Keep the title under 160 letters" };
  const kind = String(value.kind ?? "event").trim().toLowerCase();
  if (!(CALENDAR_KINDS as readonly string[]).includes(kind)) return { error: "Choose a kind from the list" };
  const startDate = toDate(value.startDate);
  if (!startDate) return { error: "Add a start date" };
  const endRaw = value.endDate;
  const endDate = toDate(endRaw);
  if (endRaw !== undefined && endRaw !== null && endRaw !== "" && !endDate) return { error: "The end date is not a date" };
  if (endDate && endDate.getTime() < startDate.getTime()) return { error: "The end date comes before the start" };
  const description = String(value.description ?? "").trim();
  return {
    title,
    description: description ? description.slice(0, 2000) : null,
    kind: kind as CalendarKind,
    startDate,
    endDate,
  };
}

/** A link a person may open: http or https only, so a session can never carry a script address. */
export function safeLink(value: unknown): string | null | "invalid" {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "invalid";
  } catch {
    return "invalid";
  }
}

export type OnlineSessionFields = { meetingUrl: string | null; videoUrl: string | null; materialsUrl: string | null };

/** The online parts of a session. Anyone else's links are refused, not dropped, so the Trainer sees why. */
export function parseOnlineFields(
  body: unknown,
  actor: { role?: string | null; trainerType?: string | null } | null | undefined,
): OnlineSessionFields | { error: string } {
  const value = (body || {}) as Record<string, unknown>;
  const meetingUrl = safeLink(value.meetingUrl);
  const videoUrl = safeLink(value.videoUrl);
  const materialsUrl = safeLink(value.materialsUrl);
  if (meetingUrl === "invalid" || videoUrl === "invalid" || materialsUrl === "invalid") {
    return { error: "Links must start with https://" };
  }
  const any = meetingUrl || videoUrl || materialsUrl;
  if (any && !canRunOnlineSessions(actor)) {
    return { error: "Only instructional Trainers can add an online meeting, video or materials" };
  }
  return { meetingUrl, videoUrl, materialsUrl };
}

export type DatedRow = { startDate: string | Date; endDate?: string | Date | null };

/** `2026-03` for grouping a list of dated rows under month headings. */
export function monthKey(date: string | Date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthTitle(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Rows in date order, grouped by month, with months in order. Rows with no usable date are left out. */
export function groupByMonth<T extends DatedRow>(rows: T[]): Array<{ key: string; rows: T[] }> {
  const dated = rows
    .filter((row) => !Number.isNaN(new Date(row.startDate).getTime()))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const groups = new Map<string, T[]>();
  for (const row of dated) {
    const key = monthKey(row.startDate);
    groups.set(key, (groups.get(key) || []).concat(row));
  }
  return Array.from(groups.entries()).map(([key, items]) => ({ key, rows: items }));
}

/** A calendar entry that runs across months shows under the month it starts; this says if it still covers a day. */
export function coversDay(row: DatedRow, day: Date) {
  const start = new Date(row.startDate).getTime();
  const end = new Date(row.endDate || row.startDate).getTime();
  const from = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
  return start < from + 86_400_000 && end >= from;
}

export type AudienceMember = { teacherId: string; name: string };

/** The named Fellows a piece of work is given to, in the order saved. An empty list means the whole cohort. */
export function audienceWithNames(teacherIds: string[], names: Record<string, string>): AudienceMember[] {
  return teacherIds.map((teacherId) => ({ teacherId, name: names[teacherId] || "Fellow no longer on file" }));
}

/** "Amina, Baraka" or "Whole cohort", for the line that says who sits a piece of work. */
export function audienceLabel(audience: AudienceMember[] | undefined) {
  return audience && audience.length > 0 ? audience.map((member) => member.name).join(", ") : "Whole cohort";
}

/**
 * One marking row per Fellow who sits the work: their submission, or none yet. Submitted rows come first (newest
 * first), then those still to submit by name. Anyone who submitted but has left the audience is kept.
 */
export function assignmentRoster(sitters: Array<{ id: string; name: string }>, submissions: any[]) {
  const byTeacher = new Map(submissions.map((row) => [row.teacher_id, row]));
  const submitted = submissions.map((row) => ({ ...row, submitted: true }));
  const waiting = sitters
    .filter((sitter) => !byTeacher.has(sitter.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sitter) => ({ id: `waiting-${sitter.id}`, teacher_id: sitter.id, teacher_name: sitter.name, response: null, submitted: false }));
  return [...submitted, ...waiting];
}

/** A session opens to join this long before it starts. */
export const JOIN_OPENS_MINUTES = 15;
/** A session with no end time is treated as this long. */
export const SESSION_DEFAULT_MINUTES = 120;

export type SessionPhase = "upcoming" | "live" | "ended";

/** Upcoming until the join window opens, live until it ends, then ended (when a recording may be watched). */
export function sessionPhase(session: { startDate: string | Date; endDate?: string | Date | null }, now: Date = new Date()): SessionPhase {
  const start = new Date(session.startDate).getTime();
  const end = session.endDate ? new Date(session.endDate).getTime() : start + SESSION_DEFAULT_MINUTES * 60_000;
  const t = now.getTime();
  if (t < start - JOIN_OPENS_MINUTES * 60_000) return "upcoming";
  if (t <= end) return "live";
  return "ended";
}

/** How many of each kind, with every kind present (a kind nobody has counts 0). */
export function countKinds<K extends string>(kinds: K[], all: readonly K[]): Record<K, number> {
  const counts = Object.fromEntries(all.map((kind) => [kind, 0])) as Record<K, number>;
  for (const kind of kinds) if (kind in counts) counts[kind] += 1;
  return counts;
}
