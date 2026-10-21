import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PRACTICE_LESSONS, practiceLesson } from "@shared/practiceLessons";

const READ_KEY = "sla-practice-read";

function readIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

/** Practice lessons live on Learning, apart from assignments and quizzes. */
export function PracticeShelf() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [read, setRead] = useState<string[]>(() => readIds());
  const lesson = openId ? practiceLesson(openId) : undefined;

  function markRead(id: string) {
    const next = read.includes(id) ? read : [...read, id];
    setRead(next);
    localStorage.setItem(READ_KEY, JSON.stringify(next));
  }

  return (
    <Card className="border-[#1d4e89]/20 bg-white text-[#17233c]" data-testid="practice-shelf">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BookOpen className="h-5 w-5 text-[#1d4e89]" />
          Learning materials
        </CardTitle>
        <CardDescription className="text-[#3a4a60]">
          Open a lesson and read it. These are materials, not an assignment and not a quiz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {PRACTICE_LESSONS.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`practice-lesson-${item.id}`}
            onClick={() => setOpenId(item.id)}
            className="flex w-full items-center justify-between rounded-xl border border-[#d7deea] bg-[#f7f9fc] px-3 py-3 text-left hover:border-[#1d4e89]"
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-[#c47b2b]">{item.week}</span>
              <span className="block font-medium">{item.title}</span>
              <span className="block text-sm text-[#3a4a60]">{item.minutes} min{read.includes(item.id) ? " · Read" : ""}</span>
            </span>
          </button>
        ))}
        {lesson && (
          <div className="rounded-xl border border-[#1d4e89]/20 bg-[#f4f7fb] p-4" data-testid="practice-reader">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#c47b2b]">{lesson.week}</p>
            <h3 className="mt-1 text-lg font-semibold">{lesson.title}</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#243044]">{lesson.body}</p>
            <Button className="mt-4" data-testid="button-mark-lesson-read" onClick={() => markRead(lesson.id)}>
              {read.includes(lesson.id) ? "Read" : "I have read this"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
