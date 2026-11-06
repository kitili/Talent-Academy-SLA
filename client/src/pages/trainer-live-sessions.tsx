import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AcademyShell } from "@/components/AcademyShell";
import { SessionDialog, type SessionRow } from "@/components/SessionDialog";
import { SessionLinks } from "@/components/SessionLinks";
import { SkeletonCard } from "@/components/Skeletons";
import { useAuth } from "@/hooks/use-auth";
import { splitLiveSessions } from "@/lib/liveSessions";
import { canRunOnlineSessions } from "@shared/academyPeople";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";

type Session = SessionRow & { cohortName?: string | null };

function when(session: Session) {
  const start = new Date(session.startDate);
  const date = start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = (value: Date) => value.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time(start)}${session.endDate ? ` – ${time(new Date(session.endDate))}` : ""}`;
}

function Block({ id, title, empty, rows }: { id: string; title: string; empty: string; rows: Session[] }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-lg font-semibold text-sl-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className={`${PANEL} px-5 py-5 text-sm text-sl-muted`}>{empty}</p>
      ) : rows.map((session) => (
        <article key={session.id} className={`${PANEL} space-y-1.5 px-5 py-4`} data-testid={`live-session-${session.id}`}>
          <h3 className="text-base font-semibold text-sl-ink">{session.title}</h3>
          <p className="text-sm text-sl-muted">{when(session)}{session.cohortName ? ` · ${session.cohortName}` : ""}</p>
          {session.description && <p className="text-sm text-sl-ink">{session.description}</p>}
          <SessionLinks session={session} />
        </article>
      ))}
    </section>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <AcademyShell title="Live sessions" desk="trainer" current="live-sessions">
      {children}
    </AcademyShell>
  );
}

/** An instructional Trainer's live sessions: what is on, what is next, and the links for each. */
export default function TrainerLiveSessions() {
  const { user } = useAuth();
  // The server refuses links from an in-house Trainer (canRunOnlineSessions); this only tells them so.
  const allowed = canRunOnlineSessions(user as any);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The same reads the Calendar makes: /api/timetable gives a Trainer the cohorts they teach, /api/batches the same cohorts.
  const { data = [], isLoading, isError } = useQuery<Session[]>({ queryKey: ["/api/timetable"], enabled: allowed });
  const { data: cohorts = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/batches"], enabled: allowed });
  const groups = useMemo(() => splitLiveSessions(data), [data]);

  if (!allowed) {
    return (
      <Page>
        <h1 className="text-[28px] font-semibold text-sl-ink">Live sessions</h1>
        <p className={`${PANEL} mt-4 px-5 py-5 text-[15px] text-sl-ink`} data-testid="live-sessions-not-for-you">
          This page is for instructional Trainers.
        </p>
      </Page>
    );
  }

  return (
    <Page>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold text-sl-ink">Live sessions</h1>
        <button type="button" className={BTN_PRIMARY} disabled={cohorts.length === 0} onClick={() => setDialogOpen(true)} data-testid="button-schedule-live-session">
          Schedule a live session
        </button>
      </div>
      <SessionDialog open={dialogOpen} onOpenChange={setDialogOpen} cohorts={cohorts} session={null} canAddLinks />
      <div className="mt-5 space-y-6">
        {isLoading ? (
          <>
            <SkeletonCard label="Loading live sessions" lines={2} />
            <SkeletonCard label="Loading live sessions" lines={2} />
          </>
        ) : isError ? (
          <p className={`${PANEL} px-5 py-5 text-sm text-sl-muted`}>Your live sessions could not be loaded. Refresh the page.</p>
        ) : (
          <>
            <Block id="live-now" title="Live now" empty="No session is on right now. One that is on appears here with a Join button." rows={groups.live} />
            <Block id="coming-up" title="Coming up" empty="Nothing is scheduled. Sessions you schedule for your cohorts appear here." rows={groups.upcoming} />
            <Block id="past" title="Past" empty="Sessions that have ended appear here, with their recording once you add a video link." rows={groups.past} />
          </>
        )}
      </div>
    </Page>
  );
}
