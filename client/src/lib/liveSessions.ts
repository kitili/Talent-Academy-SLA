import { sessionPhase } from "@shared/academyPeople";

type TimedSession = { eventType?: string | null; startDate: string | Date; endDate?: string | Date | null };

/**
 * The timetable rows that are live sessions, split by where they are now. Live and Coming up run soonest first;
 * Past runs newest first. Assessments, deadlines and holidays are not live sessions and stay on the Calendar.
 */
export function splitLiveSessions<T extends TimedSession>(sessions: T[], now: Date = new Date()) {
  const rows = sessions.filter((session) => (session.eventType ?? "session") === "session");
  const byStart = (a: T, b: T) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  const phase = (wanted: "live" | "upcoming" | "ended") => rows.filter((session) => sessionPhase(session, now) === wanted);
  return {
    live: phase("live").sort(byStart),
    upcoming: phase("upcoming").sort(byStart),
    past: phase("ended").sort((a, b) => byStart(b, a)),
  };
}
