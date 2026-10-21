import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QuizRunner } from "@/components/QuizRunner";
import { isWritingExam, mimeFromPaperName, paperPreviewKind } from "@shared/trainerDesk";
import { ArrowLeft } from "lucide-react";

export default function TeacherExam() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/teacher/exams/:quizId");
  const quizId = params?.quizId || "";
  const { toast } = useToast();
  const [answer, setAnswer] = useState("");
  const [paperObjectUrl, setPaperObjectUrl] = useState("");

  const { data: quiz, isLoading, error } = useQuery<any>({
    queryKey: ["/api/assigned-quizzes", quizId],
    enabled: !!quizId,
  });

  const { data: attempts = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/quiz-attempts"],
    enabled: !!quizId,
  });

  const mine = attempts.filter((attempt) => attempt.assignedQuizId === quizId);
  const latest = mine[0];
  const writing = quiz ? isWritingExam(quiz) : false;
  const questionId = quiz?.questions?.[0]?.id;
  const savedAnswer = latest?.answers?.[questionId] || "";

  useEffect(() => {
    if (savedAnswer && !answer) setAnswer(savedAnswer);
  }, [savedAnswer, answer]);

  useEffect(() => {
    if (!quiz?.paperUrl) return;
    let active = true;
    let objectUrl = "";
    (async () => {
      const response = await fetch(quiz.paperUrl, { credentials: "include" });
      if (!response.ok) return;
      const blob = await response.blob();
      const typed = new Blob([blob], { type: mimeFromPaperName(quiz.paperName) });
      objectUrl = URL.createObjectURL(typed);
      if (active) setPaperObjectUrl(objectUrl);
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [quiz?.paperUrl, quiz?.paperName]);

  const submit = useMutation({
    mutationFn: async () => {
      const text = answer.trim();
      if (!text) throw new Error("Write your answers before sending");
      const answers: Record<string, string> = {};
      for (const question of quiz.questions || []) answers[question.id] = text;
      const response = await apiRequest("POST", `/api/assigned-quizzes/${quizId}/submit`, { answers });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Answers sent", description: "Your trainer can read them now." });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/quiz-attempts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Could not send", description: err.message, variant: "destructive" });
    },
  });

  if (!quizId) return null;

  return (
    <div className="sl-page min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-[#17233c] text-[#f6f1e8]">
        <div className="mx-auto flex w-[calc(100%-1rem)] items-center justify-between gap-3 py-3 sm:w-[80%]">
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/10 text-[#f6f1e8] hover:bg-white/20"
            onClick={() => setLocation("/teacher/dashboard")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <p className="truncate text-sm font-medium" data-testid="exam-title">{quiz?.title || "Exam"}</p>
        </div>
      </header>
      <main className="sl-sheet sl-frame my-4 p-4 sm:my-6 sm:p-6">
        {isLoading && <p>Opening the exam…</p>}
        {error && <p className="text-sm">This exam is not on your desk.</p>}
        {quiz && writing && (
          <div className="grid gap-4 lg:grid-cols-2" data-testid="exam-split">
            <section className="flex min-h-[24rem] flex-col rounded-xl border bg-white p-4 text-[#17233c]" data-testid="exam-paper">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#3a4a60]">Exam paper</h2>
              {quiz.paperUrl ? (
                <PaperPane name={quiz.paperName} url={paperObjectUrl} />
              ) : (
                <article className="flex-1 whitespace-pre-wrap font-serif text-base leading-7" data-testid="exam-prompt">
                  {(quiz.questions || []).map((question: { id: string; question: string }) => question.question).join("\n\n")}
                </article>
              )}
            </section>
            <section className="flex min-h-[24rem] flex-col rounded-xl border bg-white p-4 text-[#17233c]" data-testid="exam-answers">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#3a4a60]">Your answers</h2>
              <Textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Write your answers here, the way you would in a document."
                className="min-h-[20rem] flex-1 resize-y border-[#d7deea] bg-white font-serif text-base leading-7 text-[#17233c]"
                data-testid="input-exam-answers"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-[#3a4a60]">
                  {mine.length > 0 ? `Sent ${mine.length} time${mine.length === 1 ? "" : "s"}.` : "Not sent yet."}
                </p>
                <Button
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending || mine.length >= 3}
                  data-testid="button-submit-exam"
                >
                  {submit.isPending ? "Sending…" : "Send answers"}
                </Button>
              </div>
            </section>
          </div>
        )}
        {quiz && !writing && (
          <QuizRunner
            questions={quiz.questions || []}
            quizId={quiz.id}
            attemptNumber={mine.length + 1}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ["/api/teacher/quiz-attempts"] })}
            onClose={() => undefined}
          />
        )}
      </main>
    </div>
  );
}

function PaperPane({ name, url }: { name?: string; url: string }) {
  const kind = paperPreviewKind(name);
  if (!url) return <p className="text-sm text-[#3a4a60]">Loading the paper…</p>;
  if (kind === "image") return <img src={url} alt={name || "Exam paper"} className="max-h-[36rem] w-full object-contain" />;
  if (kind === "pdf") return <iframe title={name || "Exam paper"} src={url} className="min-h-[32rem] w-full flex-1 rounded-lg border" />;
  return (
    <div className="space-y-3">
      <p className="font-serif leading-7">
        This paper is a document{name ? ` (${name})` : ""}. Open it, then write your answers in the document on the right.
      </p>
      <Button variant="outline" asChild>
        <a href={url} download={name || "exam-paper"} data-testid="link-open-paper">Open the paper</a>
      </Button>
    </div>
  );
}
