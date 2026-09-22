import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock, ChevronRight, AlertCircle } from "lucide-react";

export interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "true_false" | "open_ended";
  options?: string[];
  correctAnswer?: string;
  timeLimit?: number;
}

export interface QuizResult {
  score: number;
  totalQuestions: number;
  mcqTotal: number;
  passed: boolean;
  openEndedPending: boolean;
  percentage: number;
  attemptNumber: number;
  remainingAttempts: number;
  answers: Record<string, string>;
}

interface QuizRunnerProps {
  questions: QuizQuestion[];
  quizId: string;
  attemptNumber: number;
  onComplete: (result: QuizResult) => void;
  onClose: () => void;
}

type Phase = "countdown" | "question" | "submitting" | "results";

export function QuizRunner({ questions, quizId, attemptNumber, onComplete, onClose }: QuizRunnerProps) {
  const [phase, setPhase] = useState<Phase>("countdown");
  const [countdown, setCountdown] = useState(3);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<QuizResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;

  const submitMutation = useMutation({
    mutationFn: async (allAnswers: Record<string, string>) => {
      const res = await apiRequest("POST", `/api/assigned-quizzes/${quizId}/submit`, { answers: allAnswers });
      return res.json();
    },
    onSuccess: (data) => {
      const r: QuizResult = { ...data, answers };
      setResult(r);
      setPhase("results");
      onComplete(r);
    },
  });

  // Countdown phase
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("question");
      setTimeLeft(currentQuestion?.timeLimit ?? 30);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, currentQuestion]);

  // Per-question timer
  const advanceQuestion = useCallback((savedAnswer: string) => {
    const newAnswers = { ...answers, [currentQuestion.id]: savedAnswer };
    setAnswers(newAnswers);
    setCurrentAnswer("");

    if (currentIndex + 1 >= totalQuestions) {
      setPhase("submitting");
      submitMutation.mutate(newAnswers);
    } else {
      setCurrentIndex(i => i + 1);
      const next = questions[currentIndex + 1];
      setTimeLeft(next?.timeLimit ?? 30);
    }
  }, [answers, currentQuestion, currentIndex, totalQuestions, questions, submitMutation]);

  useEffect(() => {
    if (phase !== "question") return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          // Auto-submit current answer (whatever was typed/selected)
          advanceQuestion(currentAnswer);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIndex]);

  const handleSubmitAnswer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    advanceQuestion(currentAnswer);
  };

  const totalTime = currentQuestion?.timeLimit ?? 30;
  const timerPercent = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const timerWarning = timeLeft <= 10;

  // ── COUNTDOWN ──
  if (phase === "countdown") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-lg text-muted-foreground">Quiz starting in</p>
        <span className="text-7xl font-bold text-primary">{countdown}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    );
  }

  // ── SUBMITTING ──
  if (phase === "submitting") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground">Submitting your answers…</p>
      </div>
    );
  }

  // ── RESULTS ──
  if (phase === "results" && result) {
    return (
      <div className="flex flex-col gap-5 p-2">
        <div className="text-center">
          {result.openEndedPending ? (
            <div className="flex flex-col items-center gap-2">
              <AlertCircle className="h-12 w-12 text-yellow-500" />
              <h2 className="text-xl font-semibold">MCQ Complete — Awaiting Review</h2>
              <p className="text-sm text-muted-foreground">
                Your MCQ score: {result.score}/{result.mcqTotal} ({result.percentage}%). <br />
                Your written answers are being reviewed by your trainer.
              </p>
              <Badge variant="secondary" className="mt-1">Pending trainer review</Badge>
            </div>
          ) : result.passed ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h2 className="text-xl font-semibold text-green-600">Passed!</h2>
              <p className="text-sm text-muted-foreground">
                Score: {result.score}/{result.mcqTotal} ({result.percentage}%)
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <XCircle className="h-12 w-12 text-red-500" />
              <h2 className="text-xl font-semibold text-red-600">Not passed</h2>
              <p className="text-sm text-muted-foreground">
                Score: {result.score}/{result.mcqTotal} ({result.percentage}%){" "}
                {result.remainingAttempts > 0 && `— ${result.remainingAttempts} attempt(s) remaining`}
              </p>
            </div>
          )}
        </div>

        {/* Answer review — only show correct answers if passed; hide if failed */}
        {!result.openEndedPending && (
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {questions.map((q, idx) => {
              const given = result.answers[q.id] ?? "";
              const correct = q.correctAnswer ?? "";
              const isCorrect = q.type === "open_ended" ? null : given === correct;

              return (
                <div key={q.id} className="border rounded p-3 text-sm space-y-1">
                  <div className="flex items-start gap-2">
                    {q.type !== "open_ended" && (
                      isCorrect
                        ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <span className="font-medium">{idx + 1}. {q.question}</span>
                  </div>
                  {q.type === "open_ended" ? (
                    <p className="text-muted-foreground pl-6 italic">{given || "(no answer)"}</p>
                  ) : (
                    <>
                      <p className="pl-6">Your answer: <span className={isCorrect ? "text-green-600" : "text-red-600"}>{given || "(none)"}</span></p>
                      {result.passed && !isCorrect && (
                        <p className="pl-6 text-green-600">Correct: {correct}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button onClick={onClose} className="w-full">Close</Button>
      </div>
    );
  }

  // ── QUESTION ──
  return (
    <div className="flex flex-col gap-5">
      {/* Header: progress + timer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Question {currentIndex + 1} of {totalQuestions}</span>
        <div className={`flex items-center gap-1 font-mono ${timerWarning ? "text-red-500" : ""}`}>
          <Clock className="h-4 w-4" />
          <span>{timeLeft}s</span>
        </div>
      </div>

      {/* Timer bar */}
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${timerWarning ? "bg-red-500" : "bg-primary"}`}
          style={{ width: `${timerPercent}%` }}
        />
      </div>

      {/* Overall progress */}
      <Progress value={((currentIndex) / totalQuestions) * 100} className="h-1" />

      {/* Question */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs capitalize">
            {currentQuestion.type.replace("_", " ")}
          </Badge>
        </div>
        <p className="text-base font-medium leading-relaxed">{currentQuestion.question}</p>
      </div>

      {/* Answer area */}
      {currentQuestion.type === "open_ended" ? (
        <Textarea
          placeholder="Type your answer here…"
          value={currentAnswer}
          onChange={e => setCurrentAnswer(e.target.value)}
          rows={5}
          className="resize-none"
        />
      ) : (
        <RadioGroup
          value={currentAnswer}
          onValueChange={setCurrentAnswer}
          className="space-y-2"
        >
          {(currentQuestion.options ?? []).map(option => (
            <div key={option} className="flex items-center space-x-2 border rounded px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
              <RadioGroupItem value={option} id={`opt-${option}`} />
              <Label htmlFor={`opt-${option}`} className="cursor-pointer flex-1">{option}</Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {/* Submit button */}
      <Button
        onClick={handleSubmitAnswer}
        disabled={currentQuestion.type !== "open_ended" && !currentAnswer}
        className="w-full"
      >
        {currentIndex + 1 < totalQuestions ? (
          <><ChevronRight className="h-4 w-4 mr-1" /> Next</>
        ) : (
          "Submit Quiz"
        )}
      </Button>
    </div>
  );
}
