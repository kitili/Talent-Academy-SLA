import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, Plus, CheckCircle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { QuizQuestion } from "@shared/schema";
import { ACADEMY_TERMS } from "@shared/academyPath";
import { serverSentence } from "@/components/FileQuizDialog";

interface FileQuizEditDialogProps {
  open: boolean;
  onClose: () => void;
  weekId: string;
  fileId: string;
  fileName: string;
  initialQuestions: QuizQuestion[];
  approved: boolean;
  onQuizStatusChange: () => void;
}

// Buttons, fields and chips follow the sl-* tokens (design/board/CourseEditor.dc.html).
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center gap-1.5 rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_ICON = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sl-muted hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";

export function FileQuizEditDialog({
  open,
  onClose,
  weekId,
  fileId,
  fileName,
  initialQuestions,
  approved,
  onQuizStatusChange,
}: FileQuizEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [regenCount, setRegenCount] = useState(initialQuestions.length || 10);
  // Tracked here too, because a regenerated draft is saved unapproved before the parent refetches.
  const [isApproved, setIsApproved] = useState(approved);

  useEffect(() => {
    if (open) {
      setQuestions(initialQuestions);
      setRegenCount(initialQuestions.length || 10);
      setIsApproved(approved);
    }
  }, [open, initialQuestions, approved]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/training-weeks/${weekId}/quiz-status`] });
    onQuizStatusChange();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/training-weeks/${weekId}/files/${fileId}/quiz`, { questions });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quiz saved" });
      invalidate();
    },
    onError: (error: Error) => toast({
      title: "Failed to save quiz",
      description: serverSentence(error, "Please try again."),
      variant: "destructive",
    }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/training-weeks/${weekId}/files/${fileId}/quiz/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: `Quiz approved — ${ACADEMY_TERMS.learner.title}s can now take it` });
      setIsApproved(true);
      invalidate();
      onClose();
    },
    onError: (error: Error) => toast({
      title: "Failed to approve quiz",
      description: serverSentence(error, "Please try again."),
      variant: "destructive",
    }),
  });

  const regenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/training-weeks/${weekId}/files/${fileId}/generate-quiz`, {
        numQuestions: regenCount,
        force: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setQuestions(data.questions ?? []);
      // A regenerated quiz is a new AI draft, saved unapproved (D5).
      setIsApproved(false);
      toast({
        title: `Regenerated ${data.questions?.length ?? 0} questions`,
        description: `Saved as a draft. Approve it before ${ACADEMY_TERMS.learner.title}s can take it.`,
      });
      invalidate();
    },
    onError: (error: Error) => toast({
      title: "Regeneration failed",
      description: serverSentence(error, "Create questions manually with Add question instead."),
      variant: "destructive",
    }),
  });

  const updateQuestion = (idx: number, patch: Partial<QuizQuestion>) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const updateOption = (qIdx: number, optIdx: number, value: string) => {
    setQuestions(qs =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        const newOpts = [...(q.options ?? [])];
        newOpts[optIdx] = value;
        return { ...q, options: newOpts, correctAnswer: q.correctAnswer === (q.options ?? [])[optIdx] ? "" : q.correctAnswer };
      })
    );
  };

  const deleteOption = (qIdx: number, optIdx: number) => {
    setQuestions(qs =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        const opts = q.options ?? [];
        if (opts.length <= 2) return q;
        const newOpts = opts.filter((_, oi) => oi !== optIdx);
        return { ...q, options: newOpts, correctAnswer: q.correctAnswer === opts[optIdx] ? "" : q.correctAnswer };
      })
    );
  };

  const addOption = (qIdx: number) => {
    setQuestions(qs =>
      qs.map((q, i) => {
        if (i !== qIdx) return q;
        const opts = q.options ?? [];
        return { ...q, options: [...opts, ""] };
      })
    );
  };

  const deleteQuestion = (idx: number) => setQuestions(qs => qs.filter((_, i) => i !== idx));

  const changeQuestionType = (idx: number, newType: string) => {
    setQuestions(qs => qs.map((q, i) => {
      if (i !== idx) return q;
      const defaults: Partial<QuizQuestion> = { type: newType as QuizQuestion["type"] };
      if (newType === "multiple_choice") {
        defaults.options = ["", "", "", ""];
        defaults.correctAnswer = "";
      } else if (newType === "true_false") {
        defaults.options = [];
        defaults.correctAnswer = "True";
      } else {
        defaults.options = [];
        defaults.correctAnswer = "";
      }
      return { ...q, ...defaults };
    }));
  };

  const addQuestion = () => {
    setQuestions(qs => [...qs, {
      id: `q${Date.now()}`,
      question: "",
      type: "multiple_choice",
      options: ["", "", "", ""],
      correctAnswer: "",
      timeLimit: 30,
    }]);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-sl-line bg-sl-surface text-sl-ink">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-lg font-semibold text-sl-ink">
            {questions.length === 0 ? "Create quiz" : "Edit quiz"} — {fileName}
            {isApproved
              ? <span className="rounded-full bg-sl-done-soft px-2.5 py-0.5 text-xs font-semibold text-sl-done">Quiz approved</span>
              : <span className="rounded-full bg-sl-attention-soft px-2.5 py-0.5 text-xs font-semibold text-sl-attention">Quiz draft · waiting for you</span>
            }
          </DialogTitle>
          {questions.length === 0 && (
            <p className="text-sm text-sl-muted">
              Automatic generation needs readable slide text. Add questions here if the file has no extractable content.
            </p>
          )}
        </DialogHeader>

        {/* Regenerate controls */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sl-line bg-sl-ground p-3">
          <RefreshCw className="h-4 w-4 flex-shrink-0 text-sl-muted" aria-hidden="true" />
          <label htmlFor="regen-count" className="flex-shrink-0 text-sm text-sl-muted">Regenerate with</label>
          <input
            id="regen-count"
            type="number"
            min={1}
            max={50}
            value={regenCount}
            onChange={e => setRegenCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
            className={`${FIELD} w-20 text-center`}
            data-testid="input-regen-count"
          />
          <span className="flex-shrink-0 text-sm text-sl-muted">questions</span>
          <button
            type="button"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className={`${BTN_SECONDARY} ml-auto`}
            data-testid="button-regenerate-quiz"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenMutation.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
            {regenMutation.isPending ? "Regenerating…" : "Regenerate"}
          </button>
        </div>

        <div className="space-y-4 py-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="space-y-3 rounded-xl border border-sl-line bg-sl-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sl-muted">#{idx + 1}</span>
                  <select
                    aria-label={`Question ${idx + 1} type`}
                    value={q.type}
                    onChange={(e) => changeQuestionType(idx, e.target.value)}
                    className={`${FIELD} w-40`}
                    data-testid={`select-question-type-${idx}`}
                  >
                    <option value="multiple_choice">MCQ</option>
                    <option value="true_false">True / False</option>
                    <option value="open_ended">Open-ended</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => deleteQuestion(idx)}
                  className={`${BTN_ICON} hover:text-sl-risk`}
                  aria-label={`Delete question ${idx + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`question-${idx}`} className={LABEL}>Question</label>
                <textarea
                  id={`question-${idx}`}
                  value={q.question}
                  onChange={e => updateQuestion(idx, { question: e.target.value })}
                  rows={2}
                  className={`${FIELD} resize-none`}
                  placeholder="Enter question text…"
                />
              </div>

              {q.type === "multiple_choice" && (
                <div className="space-y-2">
                  <p className={LABEL}>Options (click circle to mark correct)</p>
                  {(q.options ?? ["", "", "", ""]).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuestion(idx, { correctAnswer: opt })}
                        className={BTN_ICON}
                        aria-pressed={Boolean(opt && q.correctAnswer === opt)}
                        aria-label={`Mark option ${optIdx + 1} correct`}
                      >
                        <CheckCircle
                          className={`h-5 w-5 ${opt && q.correctAnswer === opt ? "text-sl-done" : "text-sl-muted/40"}`}
                          aria-hidden="true"
                        />
                      </button>
                      <input
                        value={opt}
                        onChange={e => updateOption(idx, optIdx, e.target.value)}
                        placeholder={`Option ${optIdx + 1}`}
                        aria-label={`Option ${optIdx + 1} of question ${idx + 1}`}
                        className={FIELD}
                      />
                      <button
                        type="button"
                        onClick={() => deleteOption(idx, optIdx)}
                        disabled={(q.options ?? []).length <= 2}
                        className={`${BTN_ICON} hover:text-sl-risk`}
                        aria-label={`Delete option ${optIdx + 1}`}
                        data-testid={`button-delete-option-${idx}-${optIdx}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addOption(idx)}
                    className={`${BTN_SECONDARY} text-xs`}
                    data-testid={`button-add-option-${idx}`}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" /> Add option
                  </button>
                </div>
              )}

              {q.type === "true_false" && (
                <div className="space-y-1.5">
                  <p className={LABEL}>Correct answer</p>
                  <div className="flex gap-2">
                    {["True", "False"].map(option => {
                      const selected = (q.correctAnswer || "True") === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => updateQuestion(idx, { correctAnswer: option })}
                          className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3.5 text-sm transition-colors ${FOCUS} ${
                            selected
                              ? "border-sl-accent bg-sl-accent-soft font-medium text-sl-accent"
                              : "border-sl-control bg-sl-surface text-sl-muted hover:bg-sl-neutral-soft"
                          }`}
                        >
                          <CheckCircle className={`h-3.5 w-3.5 ${selected ? "text-sl-accent" : "text-sl-muted/40"}`} aria-hidden="true" />
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {q.type === "open_ended" && (
                <p className="text-xs italic text-sl-muted">Open-ended — graded manually.</p>
              )}
            </div>
          ))}

          <button type="button" className={BTN_SECONDARY} onClick={addQuestion}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add question
          </button>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </button>
          {!isApproved && (
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => {
                // Save first, then approve
                saveMutation.mutateAsync().then(() => approveMutation.mutate());
              }}
              disabled={saveMutation.isPending || approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {approveMutation.isPending ? "Approving…" : "Save & Approve"}
            </button>
          )}
          {isApproved && (
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Re-approve
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
