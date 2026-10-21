import { BookOpen, CheckCircle, Clock, MessageCircle, Sprout, Star, TrendingUp } from "lucide-react";
import type { Medal, MedalKind } from "@shared/cohortMedals";

const TONE: Record<MedalKind, { disc: string; ribbon: string }> = {
  "first-step": { disc: "bg-[#1d4e89] border-[#c9dbf2]", ribbon: "bg-[#1d4e89]" },
  "keeping-time": { disc: "bg-[#0f7a6c] border-[#b7e4dc]", ribbon: "bg-[#0f7a6c]" },
  questions: { disc: "bg-[#c47b2b] border-[#f3d7b0]", ribbon: "bg-[#c47b2b]" },
  "quiz-pass": { disc: "bg-[#3d6b2f] border-[#cfe3c8]", ribbon: "bg-[#3d6b2f]" },
  "strong-progress": { disc: "bg-[#9b3d55] border-[#f3c3ce]", ribbon: "bg-[#9b3d55]" },
  "course-done": { disc: "bg-[#102448] border-[#c5d0e4]", ribbon: "bg-[#102448]" },
  "trainer-star": { disc: "bg-[#b8860b] border-[#ffe7a3]", ribbon: "bg-[#b8860b]" },
};

const ICON: Record<MedalKind, typeof Star> = {
  "first-step": Sprout,
  "keeping-time": Clock,
  questions: MessageCircle,
  "quiz-pass": CheckCircle,
  "strong-progress": TrendingUp,
  "course-done": BookOpen,
  "trainer-star": Star,
};

/** A row of cohort medals. Unearned ones stay visible, faded, the way a locked achievement does. */
export function CohortMedals({ medals }: { medals: Medal[] }) {
  if (!medals.length) return null;
  const earned = medals.filter((medal) => medal.earned).length;
  return (
    <div data-testid="cohort-medals">
      <p className="text-xs text-muted-foreground mb-2">{earned} of {medals.length} medals</p>
      <div className="flex flex-wrap gap-3">
        {medals.map((medal) => {
          const Icon = ICON[medal.kind];
          const tone = TONE[medal.kind];
          return (
            <div
              key={medal.kind}
              className={`w-16 text-center ${medal.earned ? "" : "opacity-40 grayscale"}`}
              title={medal.detail}
              data-testid={`medal-${medal.kind}`}
              data-earned={medal.earned ? "yes" : "no"}
            >
              <div className={`relative mx-auto h-12 w-12 rounded-full border-4 ${tone.disc} text-white shadow-sm flex items-center justify-center`}>
                <Icon className="h-5 w-5" />
                <span className={`absolute -bottom-1 left-1/2 h-2 w-5 -translate-x-1/2 rounded-b-sm ${tone.ribbon}`} />
              </div>
              <p className="mt-2 text-[11px] font-medium leading-tight text-foreground">{medal.title}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
