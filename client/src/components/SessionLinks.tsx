import { sessionPhase } from "@shared/academyPeople";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 ${FOCUS}`;

type Linkable = {
  startDate: string | Date;
  endDate?: string | Date | null;
  meetingUrl?: string | null;
  videoUrl?: string | null;
  materialsUrl?: string | null;
};

/** Join while a session is on, the recording once it has ended. Nothing before the join window opens. */
export function SessionLinks({ session, now = new Date() }: { session: Linkable; now?: Date }) {
  const phase = sessionPhase(session, now);
  if (!session.meetingUrl && !session.videoUrl && !session.materialsUrl) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm font-semibold">
      {session.meetingUrl && phase === "live" && (
        <a className={`${BTN_PRIMARY} gap-2`} href={session.meetingUrl} target="_blank" rel="noopener noreferrer" data-testid="link-join-live">
          <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" /> Live now · Join
        </a>
      )}
      {session.meetingUrl && phase === "upcoming" && (
        <a className="text-sl-accent underline" href={session.meetingUrl} target="_blank" rel="noopener noreferrer">Meeting link</a>
      )}
      {session.videoUrl && (
        <a className="text-sl-accent underline" href={session.videoUrl} target="_blank" rel="noopener noreferrer">{phase === "ended" ? "Watch the recording" : "Watch the video"}</a>
      )}
      {session.materialsUrl && <a className="text-sl-accent underline" href={session.materialsUrl} target="_blank" rel="noopener noreferrer">Materials</a>}
    </p>
  );
}

