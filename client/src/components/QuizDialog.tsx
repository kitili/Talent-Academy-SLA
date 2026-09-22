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
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface QuizDialogProps {
  weekId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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
      console.log('[QUIZ-DIALOG] Starting quiz generation for weekId:', weekId);
      const url = `/api/training-weeks/${weekId}/generate-quiz`;
      console.log('[QUIZ-DIALOG] Making request to:', url);
      const response = await apiRequest('POST', url, {});
      console.log('[QUIZ-DIALOG] Got response, status:', response.status);
      const data = await response.json();
      console.log('[QUIZ-DIALOG] Parsed response:', data);
      return data.questions;
    },
    onSuccess: (generatedQuestions: QuizQuestion[]) => {
      console.log('[QUIZ-DIALOG] Success! Got', generatedQuestions.length, 'questions');
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
    console.log('[QUIZ-DIALOG] handleOpenChange called, newOpen:', newOpen, 'weekId:', weekId);
    
    // Only trigger generation when opening
    if (newOpen) {
      console.log('[QUIZ-DIALOG] Dialog opening, setting up quiz generation');
      setQuizState('loading');
      setAnswers({});
      setResults(null);
      
      // Delay the mutation slightly to ensure dialog is open
      setTimeout(() => {
        console.log('[QUIZ-DIALOG] Calling mutation...');
        generateQuizMutation.mutate();
      }, 100);
    }
    
    if (!newOpen) {
      console.log('[QUIZ-DIALOG] Dialog closing, resetting state');
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Checkpoint Quiz</DialogTitle>
          <DialogDescription>
            {quizState === 'quiz' && "Answer all questions to complete this week's checkpoint."}
            {quizState === 'results' && "Review your quiz results below."}
            {quizState === 'loading' && "Generating quiz questions from your training materials..."}
          </DialogDescription>
        </DialogHeader>

        {quizState === 'loading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Analyzing training content...</p>
          </div>
        )}

        {quizState === 'quiz' && (
          <div className="space-y-6 py-4">
            {questions.map((question, index) => (
              <div key={question.id} className="border rounded-lg p-4 bg-card">
                <p className="font-semibold mb-3">
                  {index + 1}. {question.question}
                </p>
                <RadioGroup
                  value={answers[question.id] || ""}
                  onValueChange={(value) => setAnswers({ ...answers, [question.id]: value })}
                >
                  {question.options.map((option, optIdx) => (
                    <div key={optIdx} className="flex items-center space-x-2 mb-2">
                      <RadioGroupItem value={option} id={`${question.id}-${optIdx}`} />
                      <Label htmlFor={`${question.id}-${optIdx}`} className="cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={submitQuizMutation.isPending}
                data-testid="button-submit-quiz"
              >
                {submitQuizMutation.isPending ? "Submitting..." : "Submit Quiz"}
              </Button>
            </div>
          </div>
        )}

        {quizState === 'results' && results && (
          <div className="space-y-6 py-4">
            <div className={`text-center p-6 rounded-lg ${results.passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              {results.passed ? (
                <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400 mx-auto mb-4" />
              ) : (
                <XCircle className="h-16 w-16 text-red-600 dark:text-red-400 mx-auto mb-4" />
              )}
              <h3 className="text-2xl font-bold mb-2">
                {results.passed ? "Congratulations!" : "Keep Learning"}
              </h3>
              <p className="text-lg mb-4">
                You scored {results.score} out of {results.totalQuestions} ({results.percentage}%)
              </p>
              <p className="text-sm text-muted-foreground">
                {results.passed 
                  ? "You've successfully completed this checkpoint quiz!" 
                  : "You need 70% or higher to pass. Review the materials and try again."}
              </p>
            </div>

            {results.passed ? (
              <div className="space-y-4">
                <h4 className="font-semibold">Review Your Answers:</h4>
                {questions.map((question, index) => {
                  const userAnswer = answers[question.id];
                  const isCorrect = userAnswer === question.correctAnswer;
                  return (
                    <div key={question.id} className={`border rounded-lg p-4 ${isCorrect ? 'border-green-200 bg-green-50/50 dark:bg-green-900/10' : 'border-red-200 bg-red-50/50 dark:bg-red-900/10'}`}>
                      <p className="font-semibold mb-2">
                        {index + 1}. {question.question}
                      </p>
                      <div className="space-y-1 text-sm">
                        <p className={isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                          Your answer: {userAnswer}
                        </p>
                        {!isCorrect && (
                          <p className="text-green-700 dark:text-green-400">
                            Correct answer: {question.correctAnswer}
                          </p>
                        )}
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
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {!results.passed && (
                <Button onClick={handleRetake} data-testid="button-retake-quiz">
                  Retake Quiz
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
