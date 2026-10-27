import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DeskMail } from "@/components/DeskMail";
import { PageStrip, usePager } from "@/components/PageStrip";
import { SkeletonBar, SkeletonRows } from "@/components/Skeletons";

type Notice = { id: string; title: string; message: string; isRead: string | boolean; createdAt: string };
type Teacher = { id: string; name: string };
type Cohort = { id: string; name: string; teacherCount?: number | string | null };

const isUnread = (notice: Notice) => notice.isRead === "false" || notice.isRead === false;

const FIELD = "min-h-11 w-full rounded-lg border border-sl-control bg-sl-surface px-3 text-sm text-sl-ink";
const PRIMARY_BUTTON = "min-h-11 bg-sl-accent-strong text-white hover:bg-sl-accent-strong/90";
const PANEL = "rounded-xl border border-sl-line bg-sl-surface p-5";

const CATEGORIES = [
  { value: "progress", label: "Progress" },
  { value: "improvement", label: "Improvement" },
  { value: "general", label: "General" },
];

/**
 * Everything a Trainer writes or reads on one page: desk mail with a Fellow of the chosen cohort, a note to the whole
 * cohort, a feedback comment on one Fellow, and every message that reaches the Trainer from any part of the system.
 */
export function TrainerMessages({
  batches,
  selectedBatchId,
  onSelectBatch,
  teachers,
  expandedId,
  onPick,
  selfLabel,
  loading = false,
}: {
  batches: Cohort[];
  selectedBatchId: string;
  onSelectBatch: (id: string) => void;
  teachers: Teacher[];
  expandedId: string | null;
  onPick: (id: string) => void;
  selfLabel: string;
  /** The cohorts or the chosen cohort's Fellows have not arrived: grey bars stand where they will be. */
  loading?: boolean;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [feedbackFellowId, setFeedbackFellowId] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("progress");
  const [feedback, setFeedback] = useState("");
  const { data: notices = [], isLoading: noticesLoading } = useQuery<Notice[]>({
    queryKey: ["/api/notifications", "inbox"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=100", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const pager = usePager(notices, 6);
  const markAll = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });
  const sendNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${selectedBatchId}/announce`, {
        title: "A note from your Trainer",
        message: note,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Cohort note sent to ${data.sent || 0} Fellows` });
      setNote("");
    },
    onError: () => toast({ title: "Could not send the cohort note", variant: "destructive" }),
  });
  const saveFeedback = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/trainer/comments", {
        teacherId: feedbackFellow?.id,
        batchId: selectedBatchId,
        comment: feedback,
        category: feedbackCategory,
      });
    },
    onSuccess: () => {
      toast({ title: "Feedback saved", description: "The Fellow can read it but not reply to it." });
      setFeedback("");
    },
    onError: (error: Error) => toast({ title: "Could not save the feedback", description: error.message, variant: "destructive" }),
  });
  const peer = teachers.find((teacher) => teacher.id === expandedId) || teachers[0];
  const feedbackFellow = teachers.find((teacher) => teacher.id === feedbackFellowId) || teachers[0];
  const unread = notices.filter(isUnread).length;
  const cohort = batches.find((batch) => batch.id === selectedBatchId);

  const cohortSelect = (id: string) => loading ? <SkeletonBar className="h-11 w-full rounded-lg" /> : (
    <select id={id} className={FIELD} value={selectedBatchId} onChange={(event) => onSelectBatch(event.target.value)} data-testid={`select-${id}`}>
      {batches.map((batch) => (
        <option key={batch.id} value={batch.id}>
          {batch.name} · {Number(batch.teacherCount || 0)} {Number(batch.teacherCount || 0) === 1 ? "Fellow" : "Fellows"}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)] lg:items-stretch">
        <section className={`${PANEL} space-y-4`} aria-label="Desk mail" data-testid="desk-mail-threads">
          <div>
            <h2 className="text-lg font-semibold text-sl-ink">Desk mail</h2>
            <p className="text-sm text-sl-muted">Private threads between you and one Fellow</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="mail-cohort" className="text-sm font-normal text-sl-muted">Cohort</Label>
            {cohortSelect("mail-cohort")}
          </div>
          {loading ? (
            <SkeletonRows label="Loading Fellows" rows={3} className="-mx-5" />
          ) : teachers.length === 0 ? (
            <p className="text-sm text-sl-muted">No Fellows in {cohort?.name || "this cohort"} yet. Add one on Cohorts, then write to them here.</p>
          ) : (
            <ul className="space-y-2" data-testid="select-message-teacher">
              {teachers.map((teacher) => {
                const selected = teacher.id === peer?.id;
                return (
                  <li key={teacher.id}>
                    <button
                      type="button"
                      onClick={() => onPick(teacher.id)}
                      aria-current={selected ? "true" : undefined}
                      className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-sl-ink ${selected ? "bg-sl-accent-soft" : "hover:bg-sl-neutral-soft"}`}
                      data-testid={`button-mail-${teacher.id}`}
                    >
                      {teacher.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <div className="min-w-0 [&>*]:h-full [&>*]:max-w-none">
          <DeskMail peer={peer ? { id: peer.id, name: peer.name, role: "teacher" } : null} selfLabel={selfLabel} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className={`${PANEL} space-y-4`} aria-label="Send a cohort note" data-testid="trainer-cohort-note">
          <div>
            <h2 className="text-lg font-semibold text-sl-ink">Send a cohort note</h2>
            <p className="text-sm text-sl-muted">
              Goes to every Fellow in the cohort and rings their bell. Fellows cannot reply to a cohort note; they can write to you on desk mail.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="note-cohort">Cohort</Label>
            {cohortSelect("note-cohort")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="note-message">Message</Label>
            <Textarea id="note-message" className="min-h-28 border-sl-control bg-sl-surface" value={note} onChange={(event) => setNote(event.target.value)} data-testid="input-cohort-note" />
          </div>
          <Button
            className={PRIMARY_BUTTON}
            disabled={!selectedBatchId || !note.trim() || sendNote.isPending}
            onClick={() => sendNote.mutate()}
            data-testid="button-send-cohort-note"
          >
            {sendNote.isPending ? "Sending..." : "Send to the whole cohort"}
          </Button>
        </section>

        <section className={`${PANEL} space-y-4`} aria-label="Feedback comments" data-testid="trainer-feedback">
          <div>
            <h2 className="text-lg font-semibold text-sl-ink">Feedback comments</h2>
            <p className="text-sm text-sl-muted">A comment for one Fellow. They can read it but not reply to it.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="feedback-fellow">Fellow</Label>
              {loading ? (
                <SkeletonBar className="h-11 w-full rounded-lg" />
              ) : (
                <select
                  id="feedback-fellow"
                  className={FIELD}
                  value={feedbackFellow?.id || ""}
                  onChange={(event) => setFeedbackFellowId(event.target.value)}
                  disabled={teachers.length === 0}
                  data-testid="select-feedback-fellow"
                >
                  {teachers.length === 0 && <option value="">No Fellows in this cohort</option>}
                  {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="feedback-category">Category</Label>
              <select id="feedback-category" className={FIELD} value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)} data-testid="select-feedback-category">
                {CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="feedback-comment">Comment</Label>
            <Textarea id="feedback-comment" className="min-h-28 border-sl-control bg-sl-surface" value={feedback} onChange={(event) => setFeedback(event.target.value)} data-testid="input-feedback-comment" />
          </div>
          <Button
            className={PRIMARY_BUTTON}
            disabled={!feedbackFellow || !feedback.trim() || saveFeedback.isPending}
            onClick={() => saveFeedback.mutate()}
            data-testid="button-save-feedback"
          >
            {saveFeedback.isPending ? "Saving..." : "Save feedback"}
          </Button>
        </section>
      </div>

      <section className={`${PANEL} space-y-3`} aria-label="Inbox" data-testid="trainer-inbox">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-sl-ink">Inbox{unread > 0 ? ` · ${unread} new` : ""}</h2>
          <Button size="sm" variant="outline" className="min-h-11 border-sl-control bg-sl-surface text-sl-ink" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        </div>
        {noticesLoading ? (
          <SkeletonRows label="Loading messages" rows={3} className="-mx-5" />
        ) : notices.length === 0 ? (
          <p className="text-sm text-sl-muted">No messages yet.</p>
        ) : pager.slice.map((notice) => (
          <button
            key={notice.id}
            type="button"
            onClick={() => isUnread(notice) && markOne.mutate(notice.id)}
            className="w-full rounded-lg border border-sl-line px-3 py-2 text-left"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-medium text-sl-ink">{notice.title}</span>
              {isUnread(notice) && <span className="rounded-full bg-sl-accent-soft px-2.5 py-0.5 text-xs font-semibold text-sl-accent">New</span>}
            </span>
            <span className="block text-sm text-sl-muted">{notice.message}</span>
            <span className="block text-xs text-sl-muted">{new Date(notice.createdAt).toLocaleString()}</span>
          </button>
        ))}
        <PageStrip page={pager.page} pages={pager.pages} setPage={pager.setPage} />
      </section>
    </div>
  );
}
