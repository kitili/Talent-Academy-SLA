import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CircleHelp } from "lucide-react";
import type { TourStep } from "@shared/guidedTour";

const TARGET_CLASS = "sla-tour-target";

function markTarget(target?: string) {
  document.querySelectorAll(`.${TARGET_CLASS}`).forEach((node) => node.classList.remove(TARGET_CLASS));
  if (!target) return;
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (!element) return;
  element.classList.add(TARGET_CLASS);
  element.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function useGuidedTour(storageKey: string) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  const close = () => {
    try {
      localStorage.setItem(storageKey, "done");
    } catch {
      /* private mode */
    }
    document.querySelectorAll(`.${TARGET_CLASS}`).forEach((node) => node.classList.remove(TARGET_CLASS));
    setOpen(false);
  };

  const replay = () => {
    setIndex(0);
    setOpen(true);
  };

  return { open, index, setIndex, close, replay };
}

export function TourButton({ onClick, testId, tone = "dark" }: { onClick: () => void; testId: string; tone?: "dark" | "light" }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={onClick}
      data-testid={testId}
      className={tone === "light"
        ? "bg-transparent text-[#17233c] border-[#102448]/15 hover:bg-[#102448]/5 dark:text-[#f6f1e8] dark:border-white/20 dark:hover:bg-white/10"
        : "bg-white/10 text-white border-white/20 hover:bg-white/20"}
    >
      <CircleHelp className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">Tour</span>
    </Button>
  );
}

export function GuidedTour({
  open,
  steps,
  index,
  onIndex,
  onClose,
}: {
  open: boolean;
  steps: TourStep[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];

  useEffect(() => {
    if (!open || !step) return;
    markTarget(step.target);
    return () => {
      document.querySelectorAll(`.${TARGET_CLASS}`).forEach((node) => node.classList.remove(TARGET_CLASS));
    };
  }, [open, step]);

  if (!open || !step) return null;

  const last = index === steps.length - 1;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-slate-950/55" />
      <div className="fixed inset-x-0 bottom-0 z-[90] p-4 sm:p-6 flex justify-center pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white text-slate-900 shadow-2xl border p-5 space-y-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guided-tour-title"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Step {index + 1} of {steps.length}
            </p>
            <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={onClose}>
              Skip
            </button>
          </div>
          <div>
            <h2 id="guided-tour-title" className="text-xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              Back
            </Button>
            <Button
              type="button"
              data-testid="button-tour-next"
              onClick={() => {
                if (last) onClose();
                else onIndex(index + 1);
              }}
            >
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
