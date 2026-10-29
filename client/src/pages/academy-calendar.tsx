import { useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AcademyShell } from "@/components/AcademyShell";
import { SkeletonCard } from "@/components/Skeletons";
import type { Desk } from "@/components/deskMenu";
import { SessionDialog, type SessionRow } from "@/components/SessionDialog";
import { SessionLinks } from "@/components/SessionLinks";
import {
  CALENDAR_KINDS,
  CALENDAR_KIND_LABELS,
  canRunOnlineSessions,
  groupByMonth,
  monthTitle,
  type CalendarKind,
} from "@shared/academyPeople";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";
const TAB_TRIGGER = `h-auto min-h-[44px] rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-3 text-[15px] font-normal text-sl-neutral shadow-none -mb-px data-[state=active]:border-sl-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-sl-accent data-[state=active]:shadow-none ${FOCUS}`;

const KIND_CHIP: Record<string, string> = {
  term: "bg-sl-accent-soft text-sl-accent",
  training: "bg-sl-done-soft text-sl-done",
  assessment: "bg-sl-attention-soft text-sl-attention",
  deadline: "bg-sl-risk-soft text-sl-risk",
  holiday: "bg-sl-neutral-soft text-sl-neutral",
  event: "bg-sl-neutral-soft text-sl-neutral",
  session: "bg-sl-accent-soft text-sl-accent",
  other: "bg-sl-neutral-soft text-sl-neutral",
};

type Session = {
  id: string;
  batchId: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDate: string;
  endDate?: string | null;
  cohortName?: string | null;
  trainerName?: string | null;
  meetingUrl?: string | null;
  videoUrl?: string | null;
  materialsUrl?: string | null;
};

type YearEntry = {
  id: string;
  title: string;
  description?: string | null;
  kind: CalendarKind;
  startDate: string;
  endDate?: string | null;
  publishedAt?: string | null;
};

const SECTIONS = ["timetable", "year"] as const;
type Section = (typeof SECTIONS)[number];

function Chip({ kind, label }: { kind: string; label: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_CHIP[kind] ?? KIND_CHIP.other}`}>{label}</span>;
}

function dayRange(start: string, end?: string | null) {
  const fmt = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (!end || fmt(end) === fmt(start)) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

function sessionWhen(session: Session) {
  const start = new Date(session.startDate);
  const date = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (!session.endDate) return `${date}, ${time}`;
  const end = new Date(session.endDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time} – ${end}`;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className={`${PANEL} px-5 py-6 text-sm text-sl-muted`}>{children}</p>;
}

/** Sessions Trainers scheduled, in date order. The Admin sees every cohort, a Trainer theirs, a Fellow their own. */
function Timetable({ desk }: { desk: Desk }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showPast, setShowPast] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const staff = desk === "admin" || desk === "trainer";
  const { data: sessions = [], isLoading, isError } = useQuery<Session[]>({ queryKey: ["/api/timetable"] });
  // GET /api/batches gives a Trainer the cohorts they teach and the Admin every cohort.
  const { data: cohorts = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/batches"], enabled: staff });
  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/events/${id}`),
    onSuccess: () => {
      toast({ title: "Session removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/timetable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/events"] });
    },
    onError: (error: Error) => toast({ title: "Could not remove the session", description: error.message, variant: "destructive" }),
  });
  const visible = useMemo(() => {
    const cut = Date.now() - 6 * 60 * 60 * 1000;
    return showPast ? sessions : sessions.filter((item) => new Date(item.endDate || item.startDate).getTime() >= cut);
  }, [sessions, showPast]);
  const months = useMemo(() => groupByMonth(visible), [visible]);
  const who = desk === "admin" ? "every cohort" : desk === "trainer" ? "the cohorts you teach" : "your cohorts";

  return (
    <div className="space-y-4" data-testid="timetable">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-sl-muted">Sessions, assessments and deadlines for {who}, set by Trainers.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => setShowPast((value) => !value)} aria-pressed={showPast} data-testid="button-timetable-past">
            {showPast ? "Hide past sessions" : "Show past sessions"}
          </button>
          {staff && (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={cohorts.length === 0}
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              data-testid="button-schedule-session"
            >
              Schedule a session
            </button>
          )}
        </div>
      </div>
      {staff && (
        <SessionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          cohorts={cohorts}
          session={editing as SessionRow | null}
          canAddLinks={canRunOnlineSessions(user as any)}
        />
      )}
      {isLoading ? (
        <>
          <SkeletonCard label="Loading the timetable" lines={2} />
          <SkeletonCard label="Loading the timetable" lines={2} />
        </>
      ) : isError ? (
        <Empty>The timetable could not be loaded. Refresh the page.</Empty>
      ) : months.length === 0 ? (
        <Empty>
          {desk === "trainer"
            ? "Nothing is scheduled yet. Schedule a session here and it appears for you, the Admin and your Fellows."
            : desk === "fellow"
              ? "No sessions are scheduled for your cohort yet."
              : "No cohort has a session yet."}
        </Empty>
      ) : months.map((month) => (
        <section key={month.key} aria-labelledby={`month-${month.key}`} className="space-y-2">
          <h3 id={`month-${month.key}`} className="text-base font-semibold text-sl-ink">{monthTitle(month.key)}</h3>
          {month.rows.map((session) => (
            <article key={session.id} className={`${PANEL} space-y-1.5 px-5 py-4`} data-testid={`session-${session.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-sl-ink">{session.title}</h4>
                <Chip kind={session.eventType} label={session.eventType === "assessment" ? "Assessment" : session.eventType[0].toUpperCase() + session.eventType.slice(1)} />
              </div>
              <p className="text-sm text-sl-muted">
                {sessionWhen(session)}
                {session.cohortName ? ` · ${session.cohortName}` : ""}
                {session.trainerName && desk !== "trainer" ? ` · ${session.trainerName}` : ""}
              </p>
              {session.description && <p className="text-sm text-sl-ink">{session.description}</p>}
              <SessionLinks session={session} />
              {staff && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className={BTN_SECONDARY} onClick={() => { setEditing(session); setDialogOpen(true); }} data-testid={`button-edit-session-${session.id}`}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={BTN_SECONDARY}
                    disabled={remove.isPending}
                    onClick={() => { if (window.confirm(`Remove "${session.title}" from the timetable?`)) remove.mutate(session.id); }}
                    data-testid={`button-remove-session-${session.id}`}
                  >
                    Remove
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

const emptyForm = { title: "", kind: "event" as CalendarKind, startDate: "", endDate: "", description: "" };

function dateInput(value?: string | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

/** The academy year. An Admin adds and edits it; Trainers and Fellows read the same rows. */
function AcademyYear({ canEdit }: { canEdit: boolean }) {
  const { toast } = useToast();
  const { data: entries = [], isLoading, isError } = useQuery<YearEntry[]>({ queryKey: ["/api/academy-calendar"] });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const months = useMemo(() => groupByMonth(entries), [entries]);
  const drafts = entries.filter((entry) => !entry.publishedAt).length;

  const publish = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/academy-calendar/publish")).json(),
    onSuccess: (data: { published?: number }) => {
      toast({ title: `${data.published || 0} ${data.published === 1 ? "entry is" : "entries are"} now on every Trainer's and Fellow's calendar` });
      queryClient.invalidateQueries({ queryKey: ["/api/academy-calendar"] });
    },
    onError: (error: Error) => toast({ title: "Could not publish", description: error.message, variant: "destructive" }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title,
        kind: form.kind,
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate || null,
      };
      const res = editingId
        ? await apiRequest("PATCH", `/api/admin/academy-calendar/${editingId}`, body)
        : await apiRequest("POST", "/api/admin/academy-calendar", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingId ? "Entry saved" : "Added to the academy year" });
      setForm(emptyForm);
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/academy-calendar"] });
    },
    onError: (error: Error) => toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/academy-calendar/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Removed from the academy year" });
      queryClient.invalidateQueries({ queryKey: ["/api/academy-calendar"] });
    },
    onError: (error: Error) => toast({ title: "Could not remove", description: error.message, variant: "destructive" }),
  });

  const startEdit = (entry: YearEntry) => {
    setEditingId(entry.id);
    setForm({
      title: entry.title,
      kind: entry.kind,
      startDate: dateInput(entry.startDate),
      endDate: dateInput(entry.endDate),
      description: entry.description || "",
    });
  };

  return (
    <div className="space-y-4" data-testid="academy-year">
      <p className="text-sm text-sl-muted">
        {canEdit
          ? "New entries are drafts only you see. Press Done to show them to every Trainer and Fellow."
          : "Terms, holidays, training weeks and exams, set by the Admin."}
      </p>

      {canEdit && drafts > 0 && (
        <div className={`${PANEL} flex flex-wrap items-center justify-between gap-3 px-5 py-4`} data-testid="year-drafts">
          <p className="text-sm text-sl-ink">
            <span className="font-semibold">{drafts} {drafts === 1 ? "draft" : "drafts"}</span> not yet shown to Trainers and Fellows.
          </p>
          <button type="button" className={BTN_PRIMARY} disabled={publish.isPending} onClick={() => publish.mutate()} data-testid="button-year-publish">
            {publish.isPending ? "Publishing…" : "Done — show to Trainers and Fellows"}
          </button>
        </div>
      )}

      {canEdit && (
        <form
          className={`${PANEL} space-y-3 px-5 py-4`}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          aria-label={editingId ? "Edit a calendar entry" : "Add to the academy year"}
        >
          <h3 className="text-base font-semibold text-sl-ink">{editingId ? "Edit entry" : "Add to the academy year"}</h3>
          <div className="space-y-1.5">
            <label htmlFor="year-title" className={LABEL}>Title</label>
            <input id="year-title" className={FIELD} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Term 2 begins" data-testid="input-year-title" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="year-kind" className={LABEL}>Kind</label>
              <select id="year-kind" className={FIELD} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CalendarKind })} data-testid="select-year-kind">
                {CALENDAR_KINDS.map((kind) => <option key={kind} value={kind}>{CALENDAR_KIND_LABELS[kind]}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="year-start" className={LABEL}>From</label>
              <input id="year-start" type="date" className={FIELD} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} data-testid="input-year-start" required />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="year-end" className={LABEL}>To (optional)</label>
              <input id="year-end" type="date" className={FIELD} value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} data-testid="input-year-end" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="year-description" className={LABEL}>Note (optional)</label>
            <input id="year-description" className={FIELD} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="input-year-description" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={BTN_PRIMARY} disabled={save.isPending || !form.title.trim() || !form.startDate} data-testid="button-year-save">
              {save.isPending ? "Saving…" : editingId ? "Save entry" : "Add to the calendar"}
            </button>
            {editingId && (
              <button type="button" className={BTN_SECONDARY} onClick={() => { setEditingId(null); setForm(emptyForm); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {isLoading ? (
        <>
          <SkeletonCard label="Loading the academy year" lines={2} />
          <SkeletonCard label="Loading the academy year" lines={2} />
        </>
      ) : isError ? (
        <Empty>The academy year could not be loaded. Refresh the page.</Empty>
      ) : months.length === 0 ? (
        <Empty>{canEdit ? "The academy year is empty. Add the first term, holiday or exam above." : "The Admin has not added the academy year yet."}</Empty>
      ) : months.map((month) => (
        <section key={month.key} aria-labelledby={`year-month-${month.key}`} className="space-y-2">
          <h3 id={`year-month-${month.key}`} className="text-base font-semibold text-sl-ink">{monthTitle(month.key)}</h3>
          {month.rows.map((entry) => (
            <article key={entry.id} className={`${PANEL} flex flex-wrap items-start justify-between gap-3 px-5 py-4`} data-testid={`year-entry-${entry.id}`}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-sl-ink">{entry.title}</h4>
                  <Chip kind={entry.kind} label={CALENDAR_KIND_LABELS[entry.kind] ?? entry.kind} />
                  {canEdit && !entry.publishedAt && (
                    <span className="rounded-full border border-dashed border-sl-control px-2.5 py-0.5 text-xs font-semibold text-sl-muted">Draft</span>
                  )}
                </div>
                <p className="text-sm text-sl-muted">{dayRange(entry.startDate, entry.endDate)}</p>
                {entry.description && <p className="text-sm text-sl-ink">{entry.description}</p>}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button type="button" className={BTN_SECONDARY} onClick={() => startEdit(entry)} data-testid={`button-year-edit-${entry.id}`}>Edit</button>
                  <button type="button" className={BTN_SECONDARY} disabled={remove.isPending} onClick={() => remove.mutate(entry.id)} data-testid={`button-year-delete-${entry.id}`}>Remove</button>
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

export default function AcademyCalendarPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const tab = new URLSearchParams(useSearch()).get("tab");
  const section: Section = SECTIONS.find((key) => key === tab) ?? "timetable";
  const desk: Desk = user?.role === "admin" ? "admin" : user?.role === "trainer" ? "trainer" : "fellow";

  return (
    <AcademyShell title="Calendar" desk={desk} current="calendar">
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-sl-ink">Calendar</h1>
          <p className="text-sm text-sl-muted">Your timetable, and the academy year the Admin sets for everyone.</p>
        </div>
        <Tabs value={section} onValueChange={(value) => setLocation(`/calendar?tab=${value}`)}>
          <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-sl-line bg-transparent p-0">
            <TabsTrigger value="timetable" className={TAB_TRIGGER} data-testid="tab-calendar-timetable">Timetable</TabsTrigger>
            <TabsTrigger value="year" className={TAB_TRIGGER} data-testid="tab-calendar-year">Academy year</TabsTrigger>
          </TabsList>
          <TabsContent value="timetable" className="mt-5"><Timetable desk={desk} /></TabsContent>
          <TabsContent value="year" className="mt-5"><AcademyYear canEdit={desk === "admin"} /></TabsContent>
        </Tabs>
      </div>
    </AcademyShell>
  );
}
