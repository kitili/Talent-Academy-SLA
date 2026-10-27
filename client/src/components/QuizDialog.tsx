import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle } from "lucide-react";
import { SkeletonCard } from "@/components/Skeletons";
import { useToast } from "@/hooks/use-toast";

interface QuizDialogProps {
  weekId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Buttons follow the sl-* tokens (design/DESIGN-BRIEF.md "Look").
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;

export function QuizDialog({ weekId, open, onOpenChange }: QuizDialogProps) {
  const { toast } = useToast();
  const [quizState, setQuizState] = useState<'loading' | 'quiz' | 'results'>('loading');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<{
    score: number;
    totalQuestions: number;
    passed: boolean;
    percentage: number;
  } | null>(null);

  const generateQuizMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/training-weeks/${weekId}/generate-quiz`, {});
      const data = await response.json();
      return data.questions;
    },
    onSuccess: (generatedQuestions: QuizQuestion[]) => {
      setQuestions(generatedQuestions);
      setAnswers({});
      setQuizState('quiz');
      posthog.capture("quiz_started", { weekId, type: "checkpoint", questionCount: generatedQuestions.length });
    },
    onError: (error: Error) => {
      console.error('[QUIZ-DIALOG] Error:', error);
      toast({
        title: "Quiz Generation Failed",
        description: error.message || "Unable to generate quiz. Please try again.",
        variant: "destructive",
      });
      onOpenChange(false);
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/training-weeks/${weekId}/submit-quiz`, {
        questions,
        answers,
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setResults(data);
      setQuizState('results');
      queryClient.invalidateQueries({ queryKey: ['/api/training-weeks', weekId, 'deck-progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training-weeks', weekId, 'quiz-passed'] });
      posthog.capture("quiz_submitted", { weekId, type: "checkpoint", score: data.score, totalQuestions: data.totalQuestions, passed: data.passed, percentage: data.percentage });
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
    // Only trigger generation when opening
    if (newOpen) {
      setQuizState('loading');
      setAnswers({});
      setResults(null);

      // Delay the mutation slightly to ensure dialog is open
      setTimeout(() => {
        generateQuizMutation.mutate();
      }, 100);
    }

    if (!newOpen) {
      setQuizState('loading');
      setQuestions([]);
      setAnswers({});
      setResults(null);
    }

    onOpenChange(newOpen);
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
    setQuizState('loading');
    setAnswers({});
    setResults(null);
    generateQuizMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-sl-line bg-sl-surface text-sl-ink">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-sl-ink">Module quiz</DialogTitle>
          <DialogDescription className="text-sl-muted">
            {quizState === 'quiz' && "Answer all questions to complete this module's checkpoint."}
            {quizState === 'results' && "Review your quiz results below."}
            {quizState === 'loading' && "Generating quiz questions from your training materials..."}
          </DialogDescription>
        </DialogHeader>

        {quizState === 'loading' && (
          <div className="space-y-6 py-4">
            <SkeletonCard label="Preparing your quiz" lines={3} />
            <div aria-hidden="true">
              <SkeletonCard label="" lines={3} />
            </div>
          </div>
        )}

        {quizState === 'quiz' && (
          <div className="space-y-6 py-4">
            {questions.map((question, index) => (
              <div key={question.id} className="rounded-xl border border-sl-line bg-sl-surface p-4">
                <p className="mb-3 font-semibold text-sl-ink">
                  {index + 1}. {question.question}
                </p>
                <RadioGroup
                  value={answers[question.id] || ""}
                  onValueChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                >
                  {(question.options ?? []).map((option, optIdx) => (
                    <div key={optIdx} className="mb-2 flex min-h-[44px] items-center space-x-2">
                      <RadioGroupItem value={option} id={`${question.id}-${optIdx}`} />
                      <Label htmlFor={`${question.id}-${optIdx}`} className="cursor-pointer text-sl-ink">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-4">
              <button type="button" className={BTN_SECONDARY} onClick={() => onOpenChange(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={BTN_PRIMARY}
                onClick={handleSubmit}
                disabled={submitQuizMutation.isPending}
                data-testid="button-submit-quiz"
              >
                {submitQuizMutation.isPending ? "Submitting..." : "Submit Quiz"}
              </button>
            </div>
          </div>
        )}

        {quizState === 'results' && results && (
          <div className="space-y-6 py-4">
            <div className={`rounded-xl p-6 text-center ${results.passed ? 'bg-sl-done-soft' : 'bg-sl-risk-soft'}`}>
              {results.passed ? (
                <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-sl-done" aria-hidden="true" />
              ) : (
                <XCircle className="mx-auto mb-4 h-16 w-16 text-sl-risk" aria-hidden="true" />
              )}
              <h3 className="mb-2 text-2xl font-semibold text-sl-ink">
                {results.passed ? "Congratulations!" : "Keep Learning"}
              </h3>
              <p className="mb-4 text-lg text-sl-ink">
                You scored {results.score} out of {results.totalQuestions} ({results.percentage}%)
              </p>
              <p className="text-sm text-sl-muted">
                {results.passed
                  ? "You've successfully completed this module quiz!"
                  : "You need 70% or higher to pass. Review the materials and try again."}
              </p>
            </div>

            {results.passed ? (
              <div className="space-y-4">
                <h4 className="font-semibold text-sl-ink">Review Your Answers:</h4>
                {questions.map((question, index) => {
                  const userAnswer = answers[question.id];
                  const isCorrect = userAnswer === question.correctAnswer;
                  return (
                    <div key={question.id} className={`rounded-xl border border-sl-line p-4 ${isCorrect ? 'bg-sl-done-soft' : 'bg-sl-risk-soft'}`}>
                      <p className="mb-2 font-semibold text-sl-ink">
                        {index + 1}. {question.question}
                      </p>
                      <div className="space-y-1 text-sm">
                        <p className={isCorrect ? 'text-sl-done' : 'text-sl-risk'}>
                          Your answer: {userAnswer}
                        </p>
                        {!isCorrect && (
                          <p className="text-sl-done">
                            Correct answer: {question.correctAnswer}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg bg-sl-neutral-soft p-4 text-center text-sm text-sl-neutral">
                Correct answers are shown after passing the quiz. Review the material and try again.
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <button type="button" className={BTN_SECONDARY} onClick={() => onOpenChange(false)}>
                Close
              </button>
              {!results.passed && (
                <button type="button" className={BTN_PRIMARY} onClick={handleRetake} data-testid="button-retake-quiz">
                  Retake Quiz
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
