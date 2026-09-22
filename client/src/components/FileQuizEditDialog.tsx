import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "MCQ",
  true_false: "True/False",
  open_ended: "Open-ended",
};

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

  useEffect(() => {
    if (open) {
      setQuestions(initialQuestions);
      setRegenCount(initialQuestions.length || 10);
    }
  }, [open, initialQuestions]);

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
    onError: () => toast({ title: "Failed to save quiz", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/training-weeks/${weekId}/files/${fileId}/quiz/approve`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quiz approved — teachers can now take it" });
      invalidate();
      onClose();
    },
    onError: () => toast({ title: "Failed to approve quiz", variant: "destructive" }),
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
      toast({ title: `Regenerated ${data.questions?.length ?? 0} questions` });
      invalidate();
    },
    onError: (error: Error) => toast({
      title: "Regeneration failed",
      description: error.message || "Create questions manually with Add Question instead.",
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {questions.length === 0 ? "Create Quiz" : "Edit Quiz"} — {fileName}
            {approved
              ? <Badge className="bg-green-500 text-white text-xs">Approved</Badge>
              : <Badge variant="secondary" className="text-xs">Pending Approval</Badge>
            }
          </DialogTitle>
          {questions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Automatic generation needs readable slide text. Add questions here if the file has no extractable content.
            </p>
          )}
        </DialogHeader>

        {/* Regenerate controls */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
          <RefreshCw className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground flex-shrink-0">Regenerate with</span>
          <Input
            type="number"
            min={1}
            max={50}
            value={regenCount}
            onChange={e => setRegenCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-20 h-8 text-sm text-center"
            data-testid="input-regen-count"
          />
          <span className="text-sm text-muted-foreground flex-shrink-0">questions</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className="ml-auto"
            data-testid="button-regenerate-quiz"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${regenMutation.isPending ? "animate-spin" : ""}`} />
            {regenMutation.isPending ? "Regenerating…" : "Regenerate"}
          </Button>
        </div>

        <div className="space-y-4 py-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                  <Select value={q.type} onValueChange={(val) => changeQuestionType(idx, val)}>
                    <SelectTrigger className="h-7 text-xs w-36" data-testid={`select-question-type-${idx}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="multiple_choice">MCQ</SelectItem>
                      <SelectItem value="true_false">True / False</SelectItem>
                      <SelectItem value="open_ended">Open-ended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteQuestion(idx)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div>
                <Label className="text-xs">Question</Label>
                <Textarea
                  value={q.question}
                  onChange={e => updateQuestion(idx, { question: e.target.value })}
                  rows={2}
                  className="mt-1 text-sm resize-none"
                  placeholder="Enter question text…"
                />
              </div>

              {q.type === "multiple_choice" && (
                <div className="space-y-2">
                  <Label className="text-xs">Options (click circle to mark correct)</Label>
                  {(q.options ?? ["", "", "", ""]).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(idx, { correctAnswer: opt })}
                        className="shrink-0"
                      >
                        <CheckCircle
                          className={`h-4 w-4 ${opt && q.correctAnswer === opt ? "text-green-500" : "text-muted-foreground/30"}`}
                        />
                      </button>
                      <Input
                        value={opt}
                        onChange={e => updateOption(idx, optIdx, e.target.value)}
                        placeholder={`Option ${optIdx + 1}`}
                        className="text-sm h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteOption(idx, optIdx)}
                        disabled={(q.options ?? []).length <= 2}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-option-${idx}-${optIdx}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addOption(idx)}
                    className="text-xs text-muted-foreground mt-1"
                    data-testid={`button-add-option-${idx}`}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add option
                  </Button>
                </div>
              )}

              {q.type === "true_false" && (
                <div>
                  <Label className="text-xs">Correct Answer</Label>
                  <div className="flex gap-2 mt-1">
                    {["True", "False"].map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateQuestion(idx, { correctAnswer: option })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          (q.correctAnswer || "True") === option
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        <CheckCircle className={`h-3.5 w-3.5 ${(q.correctAnswer || "True") === option ? "text-primary" : "text-muted-foreground/30"}`} />
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {q.type === "open_ended" && (
                <p className="text-xs text-muted-foreground italic">Open-ended — graded manually.</p>
              )}
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="h-4 w-4 mr-1" /> Add Question
          </Button>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
          {!approved && (
            <Button
              type="button"
              onClick={() => {
                // Save first, then approve
                saveMutation.mutateAsync().then(() => approveMutation.mutate());
              }}
              disabled={saveMutation.isPending || approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {approveMutation.isPending ? "Approving…" : "Save & Approve"}
            </Button>
          )}
          {approved && (
            <Button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Re-approve
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
