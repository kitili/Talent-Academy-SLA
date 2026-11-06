import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { apiErrorText, reopenBody, reopenCandidates } from "@/components/trainerDeskRules";
import { DateTimeField } from "@/components/DateField";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;

export type ReopenTarget = {
  kind: "quiz" | "assignment";
  itemId: string;
  title: string;
  batchId: string;
  audience?: Array<{ teacherId: string; name: string }>;
  dueDate?: string | null;
};

/**
 * Give one Fellow, or everyone, a new deadline on a quiz, exam or written assessment. Used by the Trainer's
 * Assessments page and the cohort room. The server decides who may reopen what; it answers `{ error }` and that is shown.
 */
export function ReopenDialog({ target, onClose }: { target: ReopenTarget | null; onClose: () => void }) {
  const { toast } = useToast();
  const [scope, setScope] = useState<"fellow" | "everyone">("fellow");
  const [teacherId, setTeacherId] = useState("");
  const [due, setDue] = useState("");
  const [problem, setProblem] = useState("");

  const { data: cohort } = useQuery<any>({
    queryKey: ["/api/batches", target?.batchId],
    enabled: Boolean(target?.batchId),
  });
  const candidates = target ? reopenCandidates(target.audience, Array.isArray(cohort?.teachers) ? cohort.teachers : []) : [];

  const reopeningsKey = ["/api/deadlines/reopenings", target?.kind, target?.itemId];
  const { data: reopenings = [] } = useQuery<Array<{ teacherId: string; name: string; dueDate: string }>>({
    queryKey: reopeningsKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/deadlines/reopenings?kind=${target!.kind}&itemId=${encodeURIComponent(target!.itemId)}`);
      return res.json();
    },
    enabled: Boolean(target),
    staleTime: 0,
  });

  useEffect(() => {
    if (!target) return;
    setScope("fellow");
    setTeacherId("");
    setDue("");
    setProblem("");
  }, [target?.kind, target?.itemId]);

  const reopen = useMutation({
    mutationFn: async () => {
      const built = reopenBody({ kind: target!.kind, itemId: target!.itemId, scope, teacherId, dueLocal: due });
      if ("error" in built) throw new Error(built.error);
      const res = await apiRequest("POST", "/api/deadlines/reopen", built.body);
      return res.json();
    },
    onSuccess: () => {
      const who = scope === "everyone" ? "everyone" : candidates.find((fellow) => fellow.id === teacherId)?.name || "the Fellow";
      toast({ title: "Deadline reopened", description: `${target?.title} is open for ${who} until ${new Date(due).toLocaleString()}.` });
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines/reopenings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", target?.batchId, "quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", target?.batchId, "assignments"] });
      onClose();
    },
    onError: (error: Error) => setProblem(apiErrorText(error, "Could not reopen the deadline")),
  });

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="reopen-dialog">
        <DialogHeader>
          <DialogTitle>Reopen {target?.title}</DialogTitle>
          <DialogDescription>
            {target?.dueDate ? `Its deadline is ${new Date(target.dueDate).toLocaleString()}. ` : ""}
            Give one Fellow more time, or move the deadline for everyone who sits it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setProblem("");
            reopen.mutate();
          }}
        >
          <fieldset className="space-y-2">
            <legend className={LABEL}>Who gets more time</legend>
            <label className="flex items-center gap-2 text-sm text-sl-ink">
              <input type="radio" name="reopen-scope" checked={scope === "fellow"} onChange={() => setScope("fellow")} data-testid="radio-reopen-fellow" />
              One Fellow
            </label>
            <label className="flex items-center gap-2 text-sm text-sl-ink">
              <input type="radio" name="reopen-scope" checked={scope === "everyone"} onChange={() => setScope("everyone")} data-testid="radio-reopen-everyone" />
              Everyone who sits it
            </label>
          </fieldset>
          {scope === "fellow" && (
            <div className="space-y-1.5">
              <label htmlFor="reopen-fellow" className={LABEL}>Fellow</label>
              <select id="reopen-fellow" className={FIELD} value={teacherId} onChange={(event) => setTeacherId(event.target.value)} data-testid="select-reopen-fellow">
                <option value="">Choose a Fellow</option>
                {candidates.map((fellow) => <option key={fellow.id} value={fellow.id}>{fellow.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="reopen-due" className={LABEL}>New deadline</label>
            <DateTimeField id="reopen-due" value={due} onChange={setDue} data-testid="input-reopen-due" />
            <p className="text-xs text-sl-muted">
              {scope === "everyone" ? "This becomes the deadline of the item itself." : "Only this Fellow gets this deadline. Everyone else keeps the item's own."}
            </p>
          </div>
          {problem && <p role="alert" className="text-sm font-medium text-sl-risk" data-testid="reopen-error">{problem}</p>}
          <button type="submit" className={`${BTN_PRIMARY} w-full`} disabled={reopen.isPending} data-testid="button-reopen-save">
            {reopen.isPending ? "Reopening…" : "Reopen"}
          </button>
        </form>
        <section aria-label="Fellows with their own deadline" data-testid="reopen-list">
          <h3 className="text-sm font-semibold text-sl-ink">Fellows with their own deadline</h3>
          {reopenings.length === 0 ? (
            <p className="text-sm text-sl-muted">None. Everyone has the item's deadline.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-sl-muted">
              {reopenings.map((row) => (
                <li key={row.teacherId} data-testid={`reopening-${row.teacherId}`}>
                  <span className="font-medium text-sl-ink">{row.name}</span> until {new Date(row.dueDate).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
