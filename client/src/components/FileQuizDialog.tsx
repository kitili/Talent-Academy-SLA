import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { QuizQuestion } from "@shared/schema";
import { MODULE_QUIZ_PASS_PERCENT } from "@shared/constants";
import { ACADEMY_TERMS } from "@shared/academyPath";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, Loader2, ChevronLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { QuizSkeleton } from "@/components/QuizRunner";

/** The sentence the server sent with a refusal (`{ error }`), not the raw "403: {...}" of `apiRequest`. */
export function serverSentence(error: Error | null | undefined, fallback: string) {
  const text = error?.message || "";
  const body = text.replace(/^\d{3}: /, "");
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // Not JSON: fall through to the plain text.
  }
  return body || fallback;
}

interface FileQuizDialogProps {
  weekId: string;
  fileId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canGenerateQuiz: boolean; // Only trainers can generate quizzes
  /** Fellow view only: opens the next lesson file after a pass. Left out, the pass screen has no such button. */
  onNextFile?: () => void;
}

const SECONDARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-[18px] text-[15px] text-sl-ink disabled:opacity-50";
const PRIMARY_BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-lg bg-sl-accent-strong px-[18px] text-[15px] font-semibold text-white disabled:opacity-50";

/** Open-ended answers start empty, so a skipped one is sent as "" and not left out. */
function blankAnswers(questions: QuizQuestion[]) {
  const blank: Record<string, string> = {};
  for (const question of questions) {
    if (question.type === "open_ended") blank[question.id] = "";
  }
  return blank;
}

export function FileQuizDialog({ weekId, fileId, fileName, open, onOpenChange, canGenerateQuiz, onNextFile }: FileQuizDialogProps) {
  const { toast } = useToast();
  const [quizState, setQuizState] = useState<'setup' | 'loading' | 'quiz' | 'results' | 'unavailable'>('setup');
  const [numQuestions, setNumQuestions] = useState<number>(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    score: number;
    totalQuestions: number;
    passed: boolean;
    percentage: number;
    // Graded on the server; correct answers come back only after a pass.
    review?: Array<{ id: string; correct: boolean | null; correctAnswer?: string }>;
  } | null>(null);
  const reviewOf = (questionId: string) => results?.review?.find((item) => item.id === questionId);
  // Fellow view: the question on screen
  const [currentIndex, setCurrentIndex] = useState(0);

  // Fetch the existing quiz when the dialog opens: a Fellow gets an approved quiz, staff can always preview.
  const { data: existingQuiz, isLoading: isLoadingExistingQuiz } = useQuery<{ questions: QuizQuestion[] } | null>({
    queryKey: ['/api/training-weeks', weekId, 'files', fileId, 'quiz'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/training-weeks/${weekId}/files/${fileId}/quiz`);
        return await response.json();
      } catch {
        // 404 is expected when no quiz exists yet
        return null;
      }
    },
    enabled: open,
    retry: 0,
    staleTime: 0, // Always refetch when enabled
  });

  const generateQuizMutation = useMutation({
    mutationFn: async (questionCount: number) => {
      const url = `/api/training-weeks/${weekId}/files/${fileId}/generate-quiz`;
      const response = await apiRequest('POST', url, { numQuestions: questionCount });
      const data = await response.json();
      return data as { questions: QuizQuestion[]; approved?: boolean };
    },
    onSuccess: (data: { questions: QuizQuestion[]; approved?: boolean }) => {
      const generatedQuestions = data.questions || [];

      // Invalidate the teacher's quiz query so they can fetch the newly generated quiz
      queryClient.invalidateQueries({
        queryKey: ['/api/training-weeks', weekId, 'files', fileId, 'quiz']
      });

      // Handle empty result
      if (generatedQuestions.length === 0) {
        toast({
          title: "Quiz Generation Failed",
          description: "No valid questions could be generated. Try selecting fewer questions or check the file content.",
          variant: "destructive",
        });
        setQuizState('setup');
        return;
      }

      // Warn if fewer questions than requested
      if (generatedQuestions.length < numQuestions) {
        toast({
          title: "Partial Quiz Generated",
          description: `Generated ${generatedQuestions.length} questions instead of ${numQuestions}. You can still complete the quiz.`,
          variant: "default",
        });
      }

      // A new AI draft is saved unapproved (D5): say so, so nobody thinks it is live.
      if (data.approved === false) {
        toast({
          title: "This quiz is a draft",
          description: `${ACADEMY_TERMS.learner.title}s cannot take this quiz until a trainer or admin approves it on the course page.`,
        });
      }

      setQuestions(generatedQuestions);
      setAnswers({});
      setQuizState('quiz');
      posthog.capture("quiz_started", { weekId, fileId, type: "file_quiz", questionCount: generatedQuestions.length });
    },
    onError: (error: Error) => {
      toast({
        title: "Quiz Generation Failed",
        description: error.message?.includes("manually")
          ? "No slide text was found. Ask an admin to create this quiz manually."
          : (error.message || "Unable to generate quiz. Please try again."),
        variant: "destructive",
      });
      setQuizState("setup");
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/training-weeks/${weekId}/files/${fileId}/submit-quiz`, {
        answers,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setResults(data);
      setQuizState('results');
      queryClient.invalidateQueries({ queryKey: ['/api/training-weeks', weekId, 'deck-progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training-weeks', weekId, 'file-quiz-progress'] });
      queryClient.invalidateQueries({ queryKey: [`/api/teacher/week/${weekId}/file-quizzes`] });
      queryClient.invalidateQueries({ queryKey: ['/api/teachers/weeks', weekId, 'content'] });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/assigned-weeks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/report-card'] });
      posthog.capture("quiz_submitted", { weekId, fileId, type: "file_quiz", score: data.score, totalQuestions: data.totalQuestions, passed: data.passed, percentage: data.percentage });
      queryClient.invalidateQueries({ queryKey: ['/api/training-weeks', weekId, 'files', fileId, 'quiz-passed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/teacher/report-card'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Submission Failed",
        description: serverSentence(error, "Failed to submit quiz. Please try again."),
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setQuizState('loading'); // Will be overridden by useEffect once existingQuiz loads
      setNumQuestions(10);
      setAnswers({});
      setResults(null);
    }

    if (!newOpen) {
      setQuizState('setup');
      setQuestions([]);
      setAnswers({});
      setResults(null);
    }

    onOpenChange(newOpen);
  };

  const startQuiz = () => {
    setQuizState('loading');
    generateQuizMutation.mutate(numQuestions);
  };

  const handleSubmit = () => {
    if (Object.keys(answers).length < questions.length) {
      toast({
        title: "Incomplete Quiz",
        description: "Please answer all questions before submitting.",
        variant: "destructive",
      });
      return;
    }
    submitQuizMutation.mutate();
  };

  const handleRetake = () => {
    setResults(null);
    setCurrentIndex(0);
    if (canGenerateQuiz) {
      // Staff go back to the setup screen, as before.
      setAnswers({});
      setQuizState('setup');
      return;
    }
    // A Fellow tries the same approved quiz again.
    setAnswers(blankAnswers(questions));
    setQuizState('quiz');
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuizState('setup');
      setQuestions([]);
      setAnswers({});
      setResults(null);
      setCurrentIndex(0);
    }
  }, [open]);

  // For admins/trainers: auto-load cached quiz if it exists, otherwise show setup
  useEffect(() => {
    if (canGenerateQuiz && open) {
      if (isLoadingExistingQuiz) {
        setQuizState('loading');
      } else if (existingQuiz && existingQuiz.questions && existingQuiz.questions.length > 0) {
        setQuestions(existingQuiz.questions);
        setAnswers({});
        setResults(null);
        setCurrentIndex(0);
        setQuizState('quiz');
      } else {
        // No cached quiz yet — show setup screen so they can generate manually
        setQuizState('setup');
      }
    }
  }, [existingQuiz, isLoadingExistingQuiz, canGenerateQuiz, open]);

  // For Fellows: when an approved quiz exists, load it automatically
  useEffect(() => {
    if (!canGenerateQuiz && open) {
      if (isLoadingExistingQuiz) {
        setQuizState('loading');
      } else if (existingQuiz && existingQuiz.questions && existingQuiz.questions.length > 0) {
        setQuestions(existingQuiz.questions);
        setAnswers(blankAnswers(existingQuiz.questions));
        setResults(null);
        setCurrentIndex(0);
        setQuizState('quiz');
        posthog.capture("quiz_started", { weekId, fileId, type: "file_quiz", questionCount: existingQuiz.questions.length, source: "existing_quiz" });
      } else {
        setQuizState('unavailable');
      }
    }
  }, [existingQuiz, isLoadingExistingQuiz, canGenerateQuiz, open]);

  // A Fellow takes the quiz (design/board/FellowQuiz.dc.html, FellowStates.dc.html)
  if (!canGenerateQuiz) {
    const total = questions.length;
    const current = questions[currentIndex];
    const isLast = currentIndex + 1 >= total;
    const answeredCurrent = current?.type === "open_ended" || Boolean(answers[current?.id]);
    const allAnswered = questions.every((question) => question.type === "open_ended" || Boolean(answers[question.id]));
    const passed = results?.passed === true;

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-sl-line bg-sl-surface text-sl-ink">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-sl-ink">
              {quizState === 'results' ? "Your result" : `${fileName} quiz`}
            </DialogTitle>
            <DialogDescription className="text-sm text-sl-muted">
              {quizState === 'loading' && "Preparing the quiz"}
              {quizState === 'quiz' && `Question ${currentIndex + 1} of ${total} · pass at ${MODULE_QUIZ_PASS_PERCENT}%`}
              {quizState === 'results' && `${fileName} quiz · pass at ${MODULE_QUIZ_PASS_PERCENT}%`}
              {quizState === 'unavailable' && "No quiz available for this file yet."}
            </DialogDescription>
          </DialogHeader>

          {quizState === 'loading' && (
            <div className="py-4" data-testid="loading-state">
              <QuizSkeleton label="Loading the quiz" note="Preparing the quiz" />
            </div>
          )}

          {quizState === 'unavailable' && (
            <div className="flex flex-col items-start gap-4 py-4">
              <p className="m-0 text-[15px] text-sl-muted">
                Your trainer has not approved a quiz for this file yet. Mark the file read to continue.
              </p>
              <button type="button" className={SECONDARY_BUTTON} onClick={() => onOpenChange(false)} data-testid="button-close-dialog">
                Back to the module
              </button>
            </div>
          )}

          {quizState === 'quiz' && current && (
            <div className="flex flex-col gap-4 py-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 self-start text-sm text-sl-accent underline"
                onClick={() => onOpenChange(false)}
              >
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                Back to the module
              </button>
              <div
                role="progressbar"
                aria-label={`Question ${currentIndex + 1} of ${total}`}
                aria-valuemin={1}
                aria-valuemax={total}
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

              {current.type === "open_ended" ? (
                <div className="flex flex-col gap-2.5">
                  <label htmlFor={`answer-${currentIndex}`} className="pb-1 text-[17px] font-semibold leading-snug text-sl-ink">
                    {currentIndex + 1}. {current.question}
                  </label>
                  <textarea
                    id={`answer-${currentIndex}`}
                    rows={5}
                    placeholder="Type your answer here…"
                    value={answers[current.id] ?? ""}
                    onChange={(event) => setAnswers({ ...answers, [current.id]: event.target.value })}
                    className="resize-none rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink"
                  />
                </div>
              ) : (
                <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0" data-testid={`question-${current.id}`}>
                  <legend className="pb-3 text-[17px] font-semibold leading-snug text-sl-ink">
                    {currentIndex + 1}. {current.question}
                  </legend>
                  {(current.options ?? []).map((option, optionIndex) => {
                    const checked = answers[current.id] === option;
                    const id = `opt-${currentIndex}-${optionIndex}`;
                    return (
                      <div
                        key={optionIndex}
                        className={`flex min-h-[48px] items-center gap-3 rounded-lg border px-3.5 ${
                          checked ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"
                        }`}
                      >
                        <input
                          type="radio"
                          id={id}
                          name={`question-${current.id}`}
                          checked={checked}
                          onChange={() => setAnswers({ ...answers, [current.id]: option })}
                          className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]"
                          data-testid={`radio-${current.id}-${optionIndex}`}
                        />
                        <label htmlFor={id} className="flex-1 cursor-pointer py-[13px] text-[15px] text-sl-ink">
                          {option}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              )}

              <div className="flex flex-wrap justify-between gap-2.5">
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                >
                  Previous
                </button>
                {isLast ? (
                  <button
                    type="button"
                    className={PRIMARY_BUTTON}
                    onClick={handleSubmit}
                    disabled={!allAnswered || submitQuizMutation.isPending}
                    data-testid="button-submit-quiz"
                  >
                    {submitQuizMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                    ) : (
                      "Submit answers"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${SECONDARY_BUTTON} font-semibold`}
                    disabled={!answeredCurrent}
                    onClick={() => setCurrentIndex((index) => Math.min(total - 1, index + 1))}
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          )}

          {quizState === 'results' && results && (
            <div className="flex flex-col gap-4 py-2">
              <h3 className="m-0">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${
                    passed ? "bg-sl-done-soft text-sl-done" : "bg-sl-attention-soft text-sl-attention"
                  }`}
                  data-testid="text-score"
                >
                  {passed
                    ? `${results.score} of ${results.totalQuestions} · ${results.percentage}% · Passed`
                    : `Not passed · ${results.score} of ${results.totalQuestions} · ${results.percentage}%`}
                </span>
              </h3>

              {passed ? (
                <>
                  <p className="m-0 text-sm text-sl-muted">
                    You passed, so the correct answers are shown. {fileName} is done.
                  </p>
                  <ol className="m-0 flex list-none flex-col gap-2 p-0">
                    {questions.map((question, index) => {
                      const reviewed = reviewOf(question.id);
                      const written = reviewed?.correct === null;
                      const isCorrect = reviewed?.correct !== false;
                      return (
                        <li key={question.id} className="flex flex-col gap-1 rounded-[10px] border border-sl-line px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-sl-ink">{index + 1}. {question.question}</span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                written
                                  ? "bg-sl-neutral-soft text-sl-neutral"
                                  : isCorrect
                                    ? "bg-sl-done-soft text-sl-done"
                                    : "bg-sl-risk-soft text-sl-risk"
                              }`}
                            >
                              {written ? "Written answer" : isCorrect ? "Right" : "Wrong"}
                            </span>
                          </div>
                          <span className="text-[13px] text-sl-muted">
                            Your answer: {answers[question.id] || "Not answered"}
                            {!isCorrect && !written && reviewed?.correctAnswer ? ` · correct answer: ${reviewed.correctAnswer}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-wrap justify-end gap-2.5">
                    <button type="button" className={SECONDARY_BUTTON} onClick={() => onOpenChange(false)} data-testid="button-close">
                      Back to the module
                    </button>
                    {onNextFile && (
                      <button type="button" className={PRIMARY_BUTTON} onClick={onNextFile} data-testid="button-next-file">
                        Next lesson file
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="m-0 text-sm leading-normal text-sl-muted">
                    Read the lesson again, then try again. The correct answers show once you pass.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button type="button" className={PRIMARY_BUTTON} onClick={() => onOpenChange(false)} data-testid="button-close">
                      Read the lesson again
                    </button>
                    <button type="button" className={SECONDARY_BUTTON} onClick={handleRetake} data-testid="button-retake">
                      Try again
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  // A trainer or admin previews, generates and takes the quiz; the page that opens it is the course editor.
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-sl-line bg-sl-surface text-sl-ink">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-sl-ink">Quiz: {fileName}</DialogTitle>
          <DialogDescription className="text-sl-muted">
            {quizState === 'setup' && "No quiz generated yet. Generate one manually or wait for the auto-generated quiz."}
            {quizState === 'quiz' && `Answer all ${questions.length} questions to complete this file's checkpoint.`}
            {quizState === 'results' && "Review your quiz results below."}
            {quizState === 'loading' && "Generating quiz questions from this presentation..."}
          </DialogDescription>
        </DialogHeader>

        {quizState === 'setup' && (
          <div className="space-y-6 py-6" data-testid="setup-state">
            <div className="space-y-3">
              <Label htmlFor="num-questions" className="text-base font-medium">
                Number of Questions
              </Label>
              <Select
                value={numQuestions.toString()}
                onValueChange={(value) => setNumQuestions(parseInt(value))}
              >
                <SelectTrigger id="num-questions" data-testid="select-num-questions">
                  <SelectValue placeholder="Select number of questions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3" data-testid="option-3">3 Questions</SelectItem>
                  <SelectItem value="5" data-testid="option-5">5 Questions</SelectItem>
                  <SelectItem value="7" data-testid="option-7">7 Questions</SelectItem>
                  <SelectItem value="10" data-testid="option-10">10 Questions</SelectItem>
                  <SelectItem value="15" data-testid="option-15">15 Questions</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-sl-muted">
                More questions provide a more comprehensive assessment but will take longer to generate.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-setup"
              >
                Cancel
              </Button>
              <Button
                onClick={startQuiz}
                data-testid="button-start-quiz"
              >
                Generate Quiz
              </Button>
            </div>
          </div>
        )}

        {quizState === 'loading' && (
          <div className="py-4" data-testid="loading-state">
            <QuizSkeleton label="Preparing the quiz" note="Analyzing presentation content. Generating questions can take 10-15 seconds." />
          </div>
        )}

        {quizState === 'quiz' && (
          <div className="space-y-6 py-4">
            {questions.map((question, index) => (
              <div key={question.id} className="space-y-3" data-testid={`question-${question.id}`}>
                <h3 className="font-semibold">
                  {index + 1}. {question.question}
                </h3>
                <RadioGroup
                  value={answers[question.id] || ""}
                  onValueChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                >
                  {Array.isArray(question.options) && question.options.length > 0 ? (
                    question.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center space-x-2">
                        <RadioGroupItem
                          value={option}
                          id={`${question.id}-${optionIndex}`}
                          data-testid={`radio-${question.id}-${optionIndex}`}
                        />
                        <Label
                          htmlFor={`${question.id}-${optionIndex}`}
                          className="cursor-pointer flex-1"
                        >
                          {option}
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm italic text-sl-muted">
                      Error: Question options not available
                    </p>
                  )}
                </RadioGroup>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-quiz"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitQuizMutation.isPending}
                data-testid="button-submit-quiz"
              >
                {submitQuizMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Quiz"
                )}
              </Button>
            </div>
          </div>
        )}

        {quizState === 'results' && results && (
          <div className="space-y-6 py-4">
            <div className="rounded-lg bg-sl-ground p-6 text-center">
              <div className="mb-2 text-5xl font-bold" data-testid="text-score">
                {results.percentage}%
              </div>
              <p className="mb-4 text-sl-muted">
                {results.score} out of {results.totalQuestions} correct
              </p>
              {results.passed ? (
                <div className="flex items-center justify-center gap-2 text-sl-done">
                  <CheckCircle2 className="h-6 w-6" />
                  <span className="font-semibold">Passed!</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sl-risk">
                  <XCircle className="h-6 w-6" />
                  <span className="font-semibold">Not passed (pass at {MODULE_QUIZ_PASS_PERCENT}%)</span>
                </div>
              )}
            </div>

            {/* Show review only when passed */}
            {results.passed ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Review Answers</h3>
                {questions.map((question, index) => {
                  const userAnswer = answers[question.id];
                  const reviewed = reviewOf(question.id);
                  const isCorrect = reviewed?.correct !== false;
                  return (
                    <div
                      key={question.id}
                      className={`rounded-lg border p-4 ${isCorrect ? "border-sl-done bg-sl-done-soft" : "border-sl-risk bg-sl-risk-soft"}`}
                    >
                      <div className="mb-2 flex items-start gap-2">
                        {isCorrect ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-sl-done" />
                        ) : (
                          <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-sl-risk" />
                        )}
                        <div className="flex-1">
                          <p className="mb-2 font-medium">
                            {index + 1}. {question.question}
                          </p>
                          <p className="mb-1 text-sm text-sl-muted">
                            <span className="font-medium">Your answer:</span> {userAnswer || "Not answered"}
                          </p>
                          {!isCorrect && (
                            <p className="text-sm text-sl-done">
                              <span className="font-medium">Correct answer:</span> {reviewed?.correctAnswer}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg bg-sl-neutral-soft p-4 text-center text-sm text-sl-muted">
                Correct answers are shown after passing the quiz. Review the material and try again.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              {results.passed ? (
                <Button onClick={() => onOpenChange(false)} data-testid="button-close">
                  Close
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close">
                    Close
                  </Button>
                  <Button onClick={handleRetake} data-testid="button-retake">
                    Retake Quiz
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
