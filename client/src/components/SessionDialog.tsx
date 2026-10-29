import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { deadlineLocalValue, parseDeadline } from "@shared/academyPath";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;

export type SessionRow = {
  id: string;
  batchId: string;
  title: string;
  description?: string | null;
  eventType: string;
  startDate: string;
  endDate?: string | null;
  meetingUrl?: string | null;
  videoUrl?: string | null;
  materialsUrl?: string | null;
};

const blank = { batchId: "", title: "", eventType: "session", start: "", end: "", description: "", meetingUrl: "", videoUrl: "", materialsUrl: "" };

/**
 * Schedule a session, or edit one, from the Calendar. Admin and Trainers use it; the server decides who may touch which
 * cohort and who may add links. `canAddLinks` only hides the link fields from someone the server would refuse.
 */
export function SessionDialog({
  open,
  onOpenChange,
  cohorts,
  session,
  canAddLinks,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cohorts: Array<{ id: string; name: string }>;
  session?: SessionRow | null;
  canAddLinks: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!open) return;
    setForm(session
      ? {
        batchId: session.batchId,
        title: session.title,
        eventType: session.eventType,
        start: deadlineLocalValue(session.startDate),
        end: deadlineLocalValue(session.endDate),
        description: session.description || "",
        meetingUrl: session.meetingUrl || "",
        videoUrl: session.videoUrl || "",
        materialsUrl: session.materialsUrl || "",
      }
      : { ...blank, batchId: cohorts[0]?.id || "" });
  }, [open, session, cohorts]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: form.title.trim(),
        eventType: form.eventType,
        // datetime-local has no zone; the browser's is applied here so the server stores the moment meant.
        startDate: parseDeadline(form.start)?.toISOString(),
        endDate: parseDeadline(form.end)?.toISOString() ?? null,
        description: form.description.trim() || null,
        ...(canAddLinks ? { meetingUrl: form.meetingUrl, videoUrl: form.videoUrl, materialsUrl: form.materialsUrl } : {}),
      };
      const res = session
        ? await apiRequest("PATCH", `/api/events/${session.id}`, body)
        : await apiRequest("POST", `/api/batches/${form.batchId}/events`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: session ? "Session saved" : "Session scheduled" });
      queryClient.invalidateQueries({ queryKey: ["/api/timetable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Could not save the session", description: error.message, variant: "destructive" }),
  });

  const set = (key: keyof typeof blank) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const ready = form.title.trim() && form.start && (session || form.batchId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{session ? "Edit session" : "Schedule a session"}</DialogTitle>
          <DialogDescription>Fellows in the cohort see it on their Calendar and Home.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (ready) save.mutate(); }}>
          {!session && (
            <div className="space-y-1.5">
              <label htmlFor="session-cohort" className={LABEL}>Cohort</label>
              <select id="session-cohort" className={FIELD} value={form.batchId} onChange={set("batchId")} data-testid="select-session-cohort">
                {cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="session-title" className={LABEL}>Title</label>
            <input id="session-title" className={FIELD} value={form.title} onChange={set("title")} data-testid="input-session-title" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="session-type" className={LABEL}>Type</label>
            <select id="session-type" className={FIELD} value={form.eventType} onChange={set("eventType")}>
              <option value="session">Session</option>
              <option value="assessment">Assessment</option>
              <option value="deadline">Deadline</option>
              <option value="holiday">Holiday</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="session-start" className={LABEL}>Starts</label>
              <input id="session-start" type="datetime-local" className={FIELD} value={form.start} onChange={set("start")} data-testid="input-session-start" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="session-end" className={LABEL}>Ends (optional)</label>
              <input id="session-end" type="datetime-local" className={FIELD} value={form.end} onChange={set("end")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="session-description" className={LABEL}>Notes (optional)</label>
            <textarea id="session-description" rows={2} className={`${FIELD} resize-y`} value={form.description} onChange={set("description")} />
          </div>
          {canAddLinks ? (
            <fieldset className="space-y-3">
              <legend className={LABEL}>Online (optional)</legend>
              <input aria-label="Meeting link" className={FIELD} placeholder="Google Meet or Zoom link, https://meet.google.com/…" value={form.meetingUrl} onChange={set("meetingUrl")} data-testid="input-session-meeting" />
              <input aria-label="Video link" className={FIELD} placeholder="Recording or video link" value={form.videoUrl} onChange={set("videoUrl")} />
              <input aria-label="Materials link" className={FIELD} placeholder="Slides or materials link" value={form.materialsUrl} onChange={set("materialsUrl")} />
            </fieldset>
          ) : session && (session.meetingUrl || session.videoUrl || session.materialsUrl) ? (
            <p className="text-sm text-sl-muted">The session's online links stay as they are.</p>
          ) : null}
          <button type="submit" className={`${BTN_PRIMARY} w-full`} disabled={!ready || save.isPending} data-testid="button-save-session">
            {save.isPending ? "Saving…" : session ? "Save session" : "Schedule"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
