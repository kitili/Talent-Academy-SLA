import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, RefreshCw, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "true_false" | "open_ended";
  options?: string[];
  correctAnswer?: string;
  timeLimit?: number;
}

interface QuizEditDialogProps {
  open: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
  initialQuestions: QuizQuestion[];
  batchId?: string;
  onRegenerate?: () => void;
  regenerating?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: "MCQ",
  true_false: "True/False",
  open_ended: "Open-ended",
};

const TRUE_FALSE_OPTIONS = ["True", "False"];

function newQuestion(type: QuizQuestion["type"]): QuizQuestion {
  const id = `q${Date.now()}`;
  if (type === "open_ended") {
    return { id, question: "", type: "open_ended", options: [], correctAnswer: "", timeLimit: 180 };
  }
  if (type === "true_false") {
    return { id, question: "", type: "true_false", options: TRUE_FALSE_OPTIONS, correctAnswer: "True", timeLimit: 30 };
  }
  return {
    id,
    question: "",
    type: "multiple_choice",
    options: ["", "", "", ""],
    correctAnswer: "",
    timeLimit: 30,
  };
}

export function QuizEditDialog({
  open,
  onClose,
  quizId,
  quizTitle,
  initialQuestions,
  batchId,
  onRegenerate,
  regenerating,
}: QuizEditDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<QuizQuestion[]>(initialQuestions);
  const [addingType, setAddingType] = useState<QuizQuestion["type"]>("multiple_choice");

  // Sync if parent loads quiz data after dialog opens
  useEffect(() => {
    if (open && initialQuestions.length > 0) {
      setQuestions(initialQuestions);
    }
  }, [open, initialQuestions]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/assigned-quizzes/${quizId}`, { questions });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Quiz saved successfully" });
      if (batchId) {
        queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "quizzes"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      }
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to save quiz", variant: "destructive" });
    },
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
        // If correct answer was the old value, clear it
        return { ...q, options: newOpts, correctAnswer: q.correctAnswer === (q.options ?? [])[optIdx] ? "" : q.correctAnswer };
      })
    );
  };

  const deleteQuestion = (idx: number) => {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  };

  const addQuestion = () => {
    setQuestions(qs => [...qs, newQuestion(addingType)]);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Quiz — {quizTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">#{idx + 1}</span>
                  <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type]}</Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteQuestion(idx)}
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
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
                  <Label className="text-xs">Options (mark correct answer)</Label>
                  {(q.options ?? ["", "", "", ""]).map((opt, optIdx) => (
                    <div key={optIdx} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuestion(idx, { correctAnswer: opt })}
                        className="shrink-0"
                        title="Mark as correct"
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
                    </div>
                  ))}
                  {!q.correctAnswer && (
                    <p className="text-xs text-yellow-600">Click the circle icon to mark the correct answer.</p>
                  )}
                </div>
              )}

              {q.type === "true_false" && (
                <div className="space-y-1">
                  <Label className="text-xs">Correct Answer</Label>
                  <Select
                    value={q.correctAnswer ?? "True"}
                    onValueChange={v => updateQuestion(idx, { correctAnswer: v })}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="True">True</SelectItem>
                      <SelectItem value="False">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {q.type === "open_ended" && (
                <p className="text-xs text-muted-foreground italic">
                  Open-ended — graded manually by trainer.
                </p>
              )}
            </div>
          ))}

          {/* Add new question */}
          <div className="flex items-center gap-2 pt-2">
            <Select value={addingType} onValueChange={v => setAddingType(v as QuizQuestion["type"])}>
              <SelectTrigger className="h-8 text-sm w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiple_choice">MCQ</SelectItem>
                <SelectItem value="true_false">True/False</SelectItem>
                <SelectItem value="open_ended">Open-ended</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              <Plus className="h-4 w-4 mr-1" /> Add Question
            </Button>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {onRegenerate && (
            <Button
              type="button"
              variant="outline"
              onClick={onRegenerate}
              disabled={regenerating}
              className="sm:mr-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Regenerating…" : "Regenerate"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
