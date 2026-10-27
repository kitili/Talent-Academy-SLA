import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Clock } from "lucide-react";
import { Loading, SkeletonBar } from "@/components/Skeletons";

const SECONDARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-[18px] text-[15px] text-sl-ink disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-sl-accent-strong px-[18px] text-[15px] font-semibold text-white disabled:opacity-50";

/**
 * A quiz question in outline: the question bar and four answer cards. Shown while questions load, while an AI draft is
 * made, and while answers are sent. `note` is the one honest line under it ("Preparing the quiz").
 */
export function QuizSkeleton({ label, note }: { label: string; note?: string }) {
  return (
    <Loading label={label} className="flex flex-col gap-4">
      <SkeletonBar className="h-1.5 w-full" />
      <SkeletonBar className="h-5 w-4/5" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonBar key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      {note && <p className="m-0 text-center text-sm text-sl-muted">{note}</p>}
    </Loading>
  );
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "true_false" | "open_ended";
  options?: string[];
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
  // Graded on the server; correct answers come back only after a pass.
  review?: Array<{ id: string; correct: boolean | null; correctAnswer?: string }>;
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
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="m-0 text-lg text-sl-muted">Quiz starting in</p>
        <span className="text-7xl font-bold text-sl-accent">{countdown}</span>
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>Cancel</button>
      </div>
    );
  }

  // ── SUBMITTING ──
  if (phase === "submitting") {
    return (
      <QuizSkeleton label="Sending your answers" note="Submitting your answers…" />
    );
  }

  // ── RESULTS ──
  if (phase === "results" && result) {
    const chip = result.openEndedPending
      ? { tone: "bg-sl-attention-soft text-sl-attention", text: `Awaiting review · ${result.score} of ${result.mcqTotal} · ${result.percentage}%` }
      : result.passed
        ? { tone: "bg-sl-done-soft text-sl-done", text: `${result.score} of ${result.mcqTotal} · ${result.percentage}% · Passed` }
        : {
            tone: "bg-sl-attention-soft text-sl-attention",
            text: `Not passed · ${result.score} of ${result.mcqTotal} · ${result.percentage}% · ${
              result.remainingAttempts > 0
                ? `${result.remainingAttempts} ${result.remainingAttempts === 1 ? "try" : "tries"} left`
                : "no tries left"
            }`,
          };
    return (
      <div className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold text-sl-ink">Your result</h2>
        <p className="m-0">
          <span className={`inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${chip.tone}`}>{chip.text}</span>
        </p>
        {result.openEndedPending && (
          <p className="m-0 text-sm text-sl-muted">Your written answers are being reviewed by your trainer.</p>
        )}

        {/* Right or wrong shows after every try; the correct answer only when the server sends it (after a pass). */}
        {!result.openEndedPending && (
          <ol className="m-0 flex max-h-80 list-none flex-col gap-2 overflow-y-auto p-0">
            {questions.map((q, idx) => {
              const given = result.answers[q.id] ?? "";
              const reviewed = result.review?.find((item) => item.id === q.id);
              const correct = reviewed?.correctAnswer ?? "";
              const isCorrect = q.type === "open_ended" ? null : reviewed?.correct === true;

              return (
                <li key={q.id} className="flex flex-col gap-1 rounded-[10px] border border-sl-line px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-sl-ink">{idx + 1}. {q.question}</span>
                    {q.type !== "open_ended" && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isCorrect ? "bg-sl-done-soft text-sl-done" : "bg-sl-risk-soft text-sl-risk"
                        }`}
                      >
                        {isCorrect ? "Right" : "Wrong"}
                      </span>
                    )}
                  </div>
                  {q.type === "open_ended" ? (
                    <span className="text-[13px] italic text-sl-muted">{given || "(no answer)"}</span>
                  ) : (
                    <span className="text-[13px] text-sl-muted">
                      Your answer: {given || "(none)"}
                      {result.passed && !isCorrect ? ` · correct answer: ${correct}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        <div className="flex justify-end">
          <button type="button" className={PRIMARY_BUTTON} onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  // ── QUESTION ──
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-sl-muted">
        <span>Question {currentIndex + 1} of {totalQuestions} · try {attemptNumber}</span>
        <div className={`flex items-center gap-1 font-mono ${timerWarning ? "text-sl-risk" : ""}`}>
          <Clock aria-hidden="true" className="h-4 w-4" />
          <span>{timeLeft}s</span>
        </div>
      </div>

      {/* Progress dots, one per question */}
      <div
        role="progressbar"
        aria-label={`Question ${currentIndex + 1} of ${totalQuestions}`}
        aria-valuemin={1}
        aria-valuemax={totalQuestions}
        aria-valuenow={currentIndex + 1}
        className="flex gap-1.5"
      >
        {questions.map((question, index) => (
          <span
            key={question.id}
            className={`h-1.5 flex-1 rounded-sm ${index <= currentIndex ? "bg-sl-accent-strong" : "bg-sl-line"}`}
          />
        ))}
      </div>

      {/* Timer bar */}
      <div className="h-1 overflow-hidden rounded-full bg-sl-line">
        <div
          className={`h-full rounded-full transition-all ${timerWarning ? "bg-sl-risk" : "bg-sl-accent-strong"}`}
          style={{ width: `${timerPercent}%` }}
        />
      </div>

      {currentQuestion.type === "open_ended" ? (
        <div className="flex flex-col gap-2.5">
          <label htmlFor={`answer-${currentIndex}`} className="pb-1 text-[17px] font-semibold leading-snug text-sl-ink">
            {currentIndex + 1}. {currentQuestion.question}
          </label>
          <textarea
            id={`answer-${currentIndex}`}
            placeholder="Type your answer here…"
            value={currentAnswer}
            onChange={e => setCurrentAnswer(e.target.value)}
            rows={5}
            className="resize-none rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink"
          />
        </div>
      ) : (
        <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="pb-3 text-[17px] font-semibold leading-snug text-sl-ink">
            {currentIndex + 1}. {currentQuestion.question}
          </legend>
          {(currentQuestion.options ?? []).map((option, optionIndex) => {
            const checked = currentAnswer === option;
            const id = `opt-${currentIndex}-${optionIndex}`;
            return (
              <div
                key={option}
                className={`flex min-h-[48px] items-center gap-3 rounded-lg border px-3.5 ${
                  checked ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"
                }`}
              >
                <input
                  type="radio"
                  id={id}
                  name={`question-${currentQuestion.id}`}
                  checked={checked}
                  onChange={() => setCurrentAnswer(option)}
                  className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]"
                />
                <label htmlFor={id} className="flex-1 cursor-pointer py-[13px] text-[15px] text-sl-ink">{option}</label>
              </div>
            );
          })}
        </fieldset>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmitAnswer}
          disabled={currentQuestion.type !== "open_ended" && !currentAnswer}
          className={PRIMARY_BUTTON}
        >
          {currentIndex + 1 < totalQuestions ? "Next" : "Submit answers"}
        </button>
      </div>
    </div>
  );
}
