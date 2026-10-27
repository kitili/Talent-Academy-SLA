import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { AcademyShell } from "@/components/AcademyShell";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { QuizRunner } from "@/components/QuizRunner";
import { MODULE_QUIZ_PASS_PERCENT, QUIZ_ATTEMPTS } from "@shared/constants";
import { isWritingExam, mimeFromPaperName, paperPreviewKind } from "@shared/trainerDesk";
import { ChevronLeft } from "lucide-react";

export default function TeacherExam() {
  const { user, logoutMutation } = useAuth();
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
  // The server's standing rule (assignedQuizStanding): passed at the pass mark, or no try left, means the exam is over.
  const passMark = quiz?.passMark || MODULE_QUIZ_PASS_PERCENT;
  const percentOf = (attempt: any) => (attempt.totalQuestions > 0 ? Math.round((attempt.score / attempt.totalQuestions) * 100) : 0);
  const passed = mine.some((attempt) => attempt.totalQuestions > 0 && (attempt.score / attempt.totalQuestions) * 100 >= passMark);
  const finished = passed || mine.length >= QUIZ_ATTEMPTS;
  // A try finished on this visit keeps the runner on screen, so its right / wrong review stays visible.
  const [triedHere, setTriedHere] = useState(false);
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
    <AcademyShell
      title="Quizzes"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      desk="fellow"
      current="quizzes"
    >
      <Link href="/teacher/dashboard?tab=quizzes" className="inline-flex items-center gap-1 self-start text-sm text-sl-accent underline">
        <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
        Back to Quizzes
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-semibold text-sl-ink" data-testid="exam-title">{quiz?.title || "Exam"}</h1>
        {quiz && !writing && (
          <span className="text-sm text-sl-muted">{mine.length >= QUIZ_ATTEMPTS ? `All ${QUIZ_ATTEMPTS} tries used` : `Try ${mine.length + 1} of ${QUIZ_ATTEMPTS}`}</span>
        )}
      </div>
      {isLoading && <p className="m-0 text-sl-muted">Opening the exam…</p>}
      {error && <p className="m-0 text-sm text-sl-risk">This exam is not on your desk.</p>}
      {quiz && writing && (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="exam-split">
          <section className="flex min-h-[24rem] flex-col rounded-xl border border-sl-line bg-sl-surface p-4 text-sl-ink" data-testid="exam-paper">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sl-muted">Exam paper</h2>
            {quiz.paperUrl ? (
              <PaperPane name={quiz.paperName} url={paperObjectUrl} />
            ) : (
              <article className="flex-1 whitespace-pre-wrap font-serif text-base leading-7" data-testid="exam-prompt">
                {(quiz.questions || []).map((question: { id: string; question: string }) => question.question).join("\n\n")}
              </article>
            )}
          </section>
          <section className="flex min-h-[24rem] flex-col rounded-xl border border-sl-line bg-sl-surface p-4 text-sl-ink" data-testid="exam-answers">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-sl-muted">Your answers</h2>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Write your answers here, the way you would in a document."
              aria-label="Your answers"
              className="min-h-[20rem] flex-1 resize-y rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 font-serif text-base leading-7 text-sl-ink placeholder:text-sl-muted"
              data-testid="input-exam-answers"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="m-0 text-xs text-sl-muted">
                {mine.length > 0 ? `Sent ${mine.length} time${mine.length === 1 ? "" : "s"}.` : "Not sent yet."}
              </p>
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-sl-accent-strong px-[18px] text-[15px] font-semibold text-white disabled:opacity-50"
                onClick={() => submit.mutate()}
                disabled={submit.isPending || mine.length >= QUIZ_ATTEMPTS}
                data-testid="button-submit-exam"
              >
                {submit.isPending ? "Sending…" : "Send answers"}
              </button>
            </div>
          </section>
        </div>
      )}
      {quiz && !writing && finished && !triedHere && (
        <section className="flex flex-col gap-3 rounded-xl border border-sl-line bg-sl-surface p-5" data-testid="exam-finished">
          <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${passed ? "bg-sl-done-soft text-sl-done" : "bg-sl-neutral-soft text-sl-neutral"}`}>
            {passed ? `Passed · best ${Math.max(...mine.map(percentOf))}%` : `All ${QUIZ_ATTEMPTS} tries used · best ${Math.max(0, ...mine.map(percentOf))}%`}
          </span>
          <h2 className="m-0 text-lg font-semibold text-sl-ink">Your tries</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {mine.map((attempt, index) => (
              <li key={attempt.id ?? index} className="flex justify-between gap-3 rounded-lg border border-sl-line px-4 py-2.5 text-[15px] text-sl-ink">
                <span>Try {mine.length - index}</span>
                <span className="text-sl-muted">{attempt.score} of {attempt.totalQuestions} · {percentOf(attempt)}%</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-sl-muted">This exam is finished; there is no try left to take.</p>
        </section>
      )}
      {quiz && !writing && (!finished || triedHere) && (
        <section className="rounded-xl border border-sl-line bg-sl-surface p-5">
          <QuizRunner
            questions={quiz.questions || []}
            quizId={quiz.id}
            attemptNumber={mine.length + 1}
            onComplete={() => {
              setTriedHere(true);
              queryClient.invalidateQueries({ queryKey: ["/api/teacher/quiz-attempts"] });
            }}
            onClose={() => undefined}
          />
        </section>
      )}
    </AcademyShell>
  );
}

function PaperPane({ name, url }: { name?: string; url: string }) {
  const kind = paperPreviewKind(name);
  if (!url) return <p className="text-sm text-sl-muted">Loading the paper…</p>;
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
