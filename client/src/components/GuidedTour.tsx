import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@shared/guidedTour";

const TARGET_CLASS = "sla-tour-target";

type Spot = { top: number; left: number; width: number; height: number };

/** The first element with this target that is on screen: the shell hides its side menu and some header controls on a phone. */
function findTarget(target?: string) {
  if (!target) return null;
  const elements = Array.from(document.querySelectorAll(`[data-tour="${target}"]`));
  const shown = elements.find((element) => {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  });
  return shown instanceof HTMLElement ? shown : null;
}

function spotFor(element: HTMLElement): Spot | null {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const pad = 8;
  const top = Math.max(8, rect.top - pad);
  const left = Math.max(8, rect.left - pad);
  return {
    top,
    left,
    width: Math.min(rect.width + pad * 2, window.innerWidth - left - 8),
    height: Math.min(rect.height + pad * 2, window.innerHeight - top - 8),
  };
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

/** The header's Help: it starts the page's guided tour from the first step (design/board/Shell.dc.html). */
export function TourButton({ onClick, testId, tone = "dark", tourId }: { onClick: () => void; testId: string; tone?: "dark" | "light"; tourId?: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      data-testid={testId}
      data-tour={tourId}
      className={`min-h-11 px-3 text-sm font-normal ${tone === "light" ? "text-sl-neutral" : "text-white hover:bg-white/10"}`}
    >
      Help
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
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    if (!open || !step) return;
    document.querySelectorAll(`.${TARGET_CLASS}`).forEach((node) => node.classList.remove(TARGET_CLASS));
    const element = findTarget(step.target);
    if (!element) {
      setSpot(null);
      return;
    }
    element.classList.add(TARGET_CLASS);
    const rect = element.getBoundingClientRect();
    const clearTop = 88;
    const clearBottom = window.innerHeight - 240;
    const hidden = rect.top < clearTop || rect.bottom > clearBottom;
    if (hidden) {
      const low = rect.top + rect.height / 2 > window.innerHeight * 0.55;
      element.scrollIntoView({ block: low ? "end" : "start", behavior: "smooth" });
    }
    const update = () => setSpot(spotFor(element));
    update();
    const timer = window.setTimeout(update, 380);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      element.classList.remove(TARGET_CLASS);
      window.clearTimeout(timer);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, step]);

  if (!open || !step) return null;

  const last = index === steps.length - 1;
  const cardOnTop = !!spot && spot.top + spot.height / 2 > window.innerHeight * 0.55;

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
      {spot && (
        <div
          aria-hidden
          className="fixed rounded-xl border-2 border-sl-surface"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 3px rgb(var(--sl-accent)), 0 0 0 9999px rgba(16, 36, 72, 0.14)",
          }}
        />
      )}
      <div className={`absolute inset-x-0 ${cardOnTop ? "top-0" : "bottom-0"} p-4 sm:p-6 flex justify-center`}>
        <div className="pointer-events-auto w-full max-w-lg rounded-xl border border-sl-line bg-sl-surface p-5 text-sl-ink shadow-lg space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sl-accent">
              Step {index + 1} of {steps.length}
            </p>
            <button type="button" className="min-h-11 px-2 text-sm text-sl-muted hover:text-sl-ink" onClick={onClose}>
              Skip
            </button>
          </div>
          <div>
            <h2 id="guided-tour-title" className="text-xl font-semibold">{step.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-sl-muted">{step.body}</p>
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
    </div>
  );
}
