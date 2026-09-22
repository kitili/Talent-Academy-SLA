import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import posthog from "posthog-js";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { QuizQuestion } from "@shared/schema";
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
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, XCircle, Loader2, Clock, ChevronRight, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileQuizDialogProps {
  weekId: string;
  fileId: string;
  fileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canGenerateQuiz: boolean; // Only trainers can generate quizzes
}

export function FileQuizDialog({ weekId, fileId, fileName, open, onOpenChange, canGenerateQuiz }: FileQuizDialogProps) {
  console.log('[FILE-QUIZ-DIALOG] 🏗️ Component mounted/updated, open:', open, 'weekId:', weekId, 'fileId:', fileId, 'canGenerateQuiz:', canGenerateQuiz);
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
  } | null>(null);
  const [hasStartedGeneration, setHasStartedGeneration] = useState(false);
  // One-at-a-time runner state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [countdown, setCountdown] = useState(3);
  const [runnerPhase, setRunnerPhase] = useState<'countdown' | 'question'>('countdown');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // For teachers: fetch existing quiz if available
  const { data: existingQuiz, isLoading: isLoadingExistingQuiz, error: quizError } = useQuery<{ questions: QuizQuestion[] } | null>({
    queryKey: ['/api/training-weeks', weekId, 'files', fileId, 'quiz'],
    queryFn: async () => {
      try {
        console.log(`[FILE-QUIZ-DIALOG] 🔍 Fetching quiz from: /api/training-weeks/${weekId}/files/${fileId}/quiz`);
        const response = await apiRequest('GET', `/api/training-weeks/${weekId}/files/${fileId}/quiz`);
        const data = await response.json();
        console.log('[FILE-QUIZ-DIALOG] ✅ Successfully fetched quiz:', data.questions?.length, 'questions');
        return data;
      } catch (error) {
        // 404 is expected when no quiz exists yet
        if (error instanceof Error && error.message.includes('404')) {
          console.log('[FILE-QUIZ-DIALOG] ℹ️ Quiz not yet created (404)');
          return null;
        }
        console.error('[FILE-QUIZ-DIALOG] 💥 Fetch error:', error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    enabled: open, // Fetch for everyone when dialog opens
    retry: 0,
    staleTime: 0, // Always refetch when enabled
  });

  const generateQuizMutation = useMutation({
    mutationFn: async (questionCount: number) => {
      console.log('[FILE-QUIZ-DIALOG] 🚀 Starting quiz generation');
      console.log('[FILE-QUIZ-DIALOG] Week ID:', weekId);
      console.log('[FILE-QUIZ-DIALOG] File ID:', fileId);
      console.log('[FILE-QUIZ-DIALOG] File Name:', fileName);
      console.log('[FILE-QUIZ-DIALOG] Number of Questions:', questionCount);
      
      const url = `/api/training-weeks/${weekId}/files/${fileId}/generate-quiz`;
      console.log('[FILE-QUIZ-DIALOG] 📡 Making API request to:', url);
      
      const response = await apiRequest('POST', url, { numQuestions: questionCount });
      console.log('[FILE-QUIZ-DIALOG] ✅ Got response, status:', response.status);
      
      const data = await response.json();
      console.log('[FILE-QUIZ-DIALOG] 📦 Response data:', data);
      
      return data.questions;
    },
    onSuccess: (generatedQuestions: QuizQuestion[]) => {
      console.log('[FILE-QUIZ-DIALOG] Got', generatedQuestions.length, 'questions');
      
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
      
      setQuestions(generatedQuestions);
      setAnswers({});
      setQuizState('quiz');
      posthog.capture("quiz_started", { weekId, fileId, type: "file_quiz", questionCount: generatedQuestions.length });
    },
    onError: (error: Error) => {
      console.error('[FILE-QUIZ-DIALOG] ❌ Quiz generation error:', error);
      console.error('[FILE-QUIZ-DIALOG] Error message:', error.message);
      console.error('[FILE-QUIZ-DIALOG] Error stack:', error.stack);
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
        questions,
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
        description: error.message || "Failed to submit quiz. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    console.log('[FILE-QUIZ-DIALOG] 🔔 handleOpenChange called, newOpen:', newOpen);
    
    if (newOpen) {
      console.log('[FILE-QUIZ-DIALOG] 📂 Opening dialog');
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
    setQuizState('setup');
    setAnswers({});
    setResults(null);
    setHasStartedGeneration(false);
    setCurrentIndex(0);
    setCurrentAnswer("");
    setCountdown(3);
    setRunnerPhase('countdown');
  };

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      console.log('[FILE-QUIZ-DIALOG] 🔄 Dialog closed, resetting state');
      setQuizState('setup');
      setQuestions([]);
      setAnswers({});
      setResults(null);
      setHasStartedGeneration(false);
      setCurrentIndex(0);
      setCurrentAnswer("");
      setCountdown(3);
      setRunnerPhase('countdown');
      if (timerRef.current) clearInterval(timerRef.current);
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
        setCurrentAnswer("");
        setCountdown(3);
        setRunnerPhase('countdown');
        setQuizState('quiz');
      } else {
        // No cached quiz yet — show setup screen so they can generate manually
        setQuizState('setup');
      }
    }
  }, [existingQuiz, isLoadingExistingQuiz, canGenerateQuiz, open]);

  // For teachers: when quiz exists, load it automatically
  useEffect(() => {
    if (!canGenerateQuiz && open) {
      if (isLoadingExistingQuiz) {
        console.log('[FILE-QUIZ-DIALOG] ⏳ Loading quiz...');
        setQuizState('loading');
      } else if (existingQuiz && existingQuiz.questions && existingQuiz.questions.length > 0) {
        console.log('[FILE-QUIZ-DIALOG] 📥 Loading existing quiz for teacher attempt, questions:', existingQuiz.questions.length);
        setQuestions(existingQuiz.questions);
        setAnswers({});
        setResults(null);
        setCurrentIndex(0);
        setCurrentAnswer("");
        setCountdown(3);
        setRunnerPhase('countdown');
        setQuizState('quiz');
        posthog.capture("quiz_started", { weekId, fileId, type: "file_quiz", questionCount: existingQuiz.questions.length, source: "existing_quiz" });
      } else {
        console.log('[FILE-QUIZ-DIALOG] ❌ No quiz available for this file. existingQuiz:', existingQuiz);
        setQuizState('unavailable');
      }
    }
  }, [existingQuiz, isLoadingExistingQuiz, canGenerateQuiz, open]);

  // Teachers attempting existing quiz
  if (!canGenerateQuiz) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Quiz: {fileName}</DialogTitle>
            <DialogDescription>
              {quizState === 'loading' && "Loading quiz..."}
              {quizState === 'quiz' && `Answer all ${questions.length} questions to complete this file's checkpoint.`}
              {quizState === 'results' && "Review your quiz results below."}
              {quizState === 'unavailable' && "No quiz available for this file yet."}
            </DialogDescription>
          </DialogHeader>

          {quizState === 'loading' && (
            <div className="flex flex-col items-center justify-center py-12" data-testid="loading-state">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-sm text-muted-foreground">Loading quiz...</p>
            </div>
          )}

          {quizState === 'unavailable' && (
            <div className="py-6 text-center space-y-4">
              <p className="text-muted-foreground">
                Your admin hasn't created a quiz for this file yet. Please check back later.
              </p>
              <Button onClick={() => onOpenChange(false)} data-testid="button-close-dialog">
                Close
              </Button>
            </div>
          )}

          {quizState === 'quiz' && (() => {
            const currentQuestion = questions[currentIndex];
            const totalQuestions = questions.length;
            const totalTime = currentQuestion?.timeLimit ?? 30;
            const timerPercent = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
            const timerWarning = timeLeft <= 10;

            const advanceQuestion = (savedAnswer: string) => {
              if (timerRef.current) clearInterval(timerRef.current);
              const newAnswers = { ...answers, [currentQuestion.id]: savedAnswer };
              setAnswers(newAnswers);
              setCurrentAnswer("");
              if (currentIndex + 1 >= totalQuestions) {
                // Submit
                submitQuizMutation.mutate();
              } else {
                const next = questions[currentIndex + 1];
                setCurrentIndex(i => i + 1);
                setTimeLeft(next?.timeLimit ?? 30);
              }
            };

            // Countdown phase
            if (runnerPhase === 'countdown') {
              // Use effect to decrement — render a countdown display
              // We'll handle it via button auto-transition
              return (
                <RunnerCountdown
                  countdown={countdown}
                  setCountdown={setCountdown}
                  onDone={() => {
                    setRunnerPhase('question');
                    setTimeLeft(questions[0]?.timeLimit ?? 30);
                  }}
                  onCancel={() => onOpenChange(false)}
                />
              );
            }

            return (
              <div className="space-y-4 py-2">
                {/* Header */}
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Question {currentIndex + 1} of {totalQuestions}</span>
                  <div className={`flex items-center gap-1 font-mono ${timerWarning ? "text-red-500" : ""}`}>
                    <Clock className="h-4 w-4" />
                    <TimerDisplay
                      key={currentIndex}
                      timeLeft={timeLeft}
                      setTimeLeft={setTimeLeft}
                      timerRef={timerRef}
                      onExpire={() => advanceQuestion(currentAnswer)}
                    />
                  </div>
                </div>
                {/* Timer bar */}
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${timerWarning ? "bg-red-500" : "bg-primary"}`}
                    style={{ width: `${timerPercent}%` }}
                  />
                </div>
                <Progress value={((currentIndex) / totalQuestions) * 100} className="h-1" />

                {/* Question */}
                <div className="space-y-1">
                  <Badge variant="outline" className="text-xs capitalize">
                    {(currentQuestion.type || "multiple_choice").replace("_", " ")}
                  </Badge>
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
                    {(currentQuestion.options ?? []).map((option, optIdx) => (
                      <div key={optIdx} className="flex items-center space-x-2 border rounded px-3 py-2 cursor-pointer hover:bg-muted transition-colors">
                        <RadioGroupItem value={option} id={`opt-${currentIndex}-${optIdx}`} />
                        <Label htmlFor={`opt-${currentIndex}-${optIdx}`} className="cursor-pointer flex-1">{option}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                <Button
                  onClick={() => advanceQuestion(currentAnswer)}
                  disabled={currentQuestion.type !== "open_ended" && !currentAnswer}
                  className="w-full"
                  data-testid="button-submit-quiz"
                >
                  {submitQuizMutation.isPending ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                  ) : currentIndex + 1 < totalQuestions ? (
                    <><ChevronRight className="h-4 w-4 mr-1" />Next</>
                  ) : (
                    "Submit Quiz"
                  )}
                </Button>
              </div>
            );
          })()}

          {quizState === 'results' && results && (
            <div className="space-y-6 py-4">
              <div className="text-center p-6 bg-muted/30 rounded-lg">
                <div className="text-5xl font-bold mb-2" data-testid="text-score">
                  {results.percentage}%
                </div>
                <p className="text-muted-foreground mb-4">
                  {results.score} out of {results.totalQuestions} correct
                </p>
                {results.passed ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <CheckCircle2 className="h-6 w-6" />
                    <span className="font-semibold">Passed!</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-destructive">
                    <XCircle className="h-6 w-6" />
                    <span className="font-semibold">Not Passed (70% required)</span>
                  </div>
                )}
              </div>

              {/* Show review only when passed */}
              {results.passed ? (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">Review Answers</h3>
                  {questions.map((question, index) => {
                    const userAnswer = answers[question.id];
                    const isCorrect = userAnswer === question.correctAnswer;
                    return (
                      <div
                        key={question.id}
                        className={`p-4 rounded-lg border-2 ${
                          isCorrect ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20'
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          {isCorrect ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <p className="font-medium mb-2">
                              {index + 1}. {question.question}
                            </p>
                            <p className="text-sm text-muted-foreground mb-1">
                              <span className="font-medium">Your answer:</span> {userAnswer || "Not answered"}
                            </p>
                            {!isCorrect && (
                              <p className="text-sm text-green-700 dark:text-green-400">
                                <span className="font-medium">Correct answer:</span> {question.correctAnswer}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground text-center">
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Quiz: {fileName}</DialogTitle>
          <DialogDescription>
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
              <p className="text-sm text-muted-foreground">
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
          <div className="flex flex-col items-center justify-center py-12" data-testid="loading-state">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Analyzing presentation content...</p>
            <p className="text-xs text-muted-foreground mt-1">Generating {numQuestions} questions - this may take 10-15 seconds</p>
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
                    <p className="text-sm text-muted-foreground italic">
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
            <div className="text-center p-6 bg-muted/30 rounded-lg">
              <div className="text-5xl font-bold mb-2" data-testid="text-score">
                {results.percentage}%
              </div>
              <p className="text-muted-foreground mb-4">
                {results.score} out of {results.totalQuestions} correct
              </p>
              {results.passed ? (
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                  <span className="font-semibold">Passed!</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-destructive">
                  <XCircle className="h-6 w-6" />
                  <span className="font-semibold">Not Passed (70% required)</span>
                </div>
              )}
            </div>

            {/* Show review only when passed */}
            {results.passed ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Review Answers</h3>
                {questions.map((question, index) => {
                  const userAnswer = answers[question.id];
                  const isCorrect = userAnswer === question.correctAnswer;
                  return (
                    <div
                      key={question.id}
                      className={`p-4 rounded-lg border-2 ${
                        isCorrect ? 'border-green-500/30 bg-green-50/50 dark:bg-green-950/20' : 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20'
                      }`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        {isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium mb-2">
                            {index + 1}. {question.question}
                          </p>
                          <p className="text-sm text-muted-foreground mb-1">
                            <span className="font-medium">Your answer:</span> {userAnswer || "Not answered"}
                          </p>
                          {!isCorrect && (
                            <p className="text-sm text-green-700 dark:text-green-400">
                              <span className="font-medium">Correct answer:</span> {question.correctAnswer}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground text-center">
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

// ── Helper sub-components for one-at-a-time quiz runner ──

function RunnerCountdown({ countdown, setCountdown, onDone, onCancel }: {
  countdown: number;
  setCountdown: React.Dispatch<React.SetStateAction<number>>;
  onDone: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (countdown <= 0) { onDone(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  return (
    <div className="flex flex-col items-center justify-center h-48 gap-4">
      <p className="text-muted-foreground">Quiz starting in</p>
      <span className="text-7xl font-bold text-primary">{countdown}</span>
      <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function TimerDisplay({ timeLeft, setTimeLeft, timerRef, onExpire }: {
  timeLeft: number;
  setTimeLeft: React.Dispatch<React.SetStateAction<number>>;
  timerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  onExpire: () => void;
}) {
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          onExpire();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span>{timeLeft}s</span>;
}
