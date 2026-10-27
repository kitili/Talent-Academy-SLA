import type { ReactNode } from "react";

/**
 * Loading placeholders in the shape of what is coming (design/DESIGN-BRIEF.md: "loading shows a skeleton, grey bars
 * #EEF0F3, never a false 0"). Every page uses these while its data has not arrived, instead of a spinner, "Loading…"
 * text, or an empty-state message. A region that is loading is announced once to screen readers by `Loading`.
 */

/** One grey bar. Size it with Tailwind (`h-4 w-40`). The pulse stops when the person asks for reduced motion. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-md bg-sl-neutral-soft motion-safe:animate-pulse ${className}`} />;
}

/** A loading region: announces `label` to screen readers and marks itself busy. */
export function Loading({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className} data-testid="skeleton">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function CardShape({ lines }: { lines: number }) {
  return (
    <>
      <SkeletonBar className="h-5 w-48" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <SkeletonBar key={index} className={`h-3.5 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </>
  );
}

/** A white card with a title bar and `lines` lines of text, as the page's cards are drawn. */
export function SkeletonCard({ label = "Loading", lines = 3, className = "" }: { label?: string; lines?: number; className?: string }) {
  return (
    <Loading label={label} className={`rounded-xl border border-sl-line bg-sl-surface p-5 ${className}`}>
      <CardShape lines={lines} />
    </Loading>
  );
}

/** List or table rows: a name, a line under it, and a chip or button on the right. */
export function SkeletonRows({ label = "Loading", rows = 4, className = "" }: { label?: string; rows?: number; className?: string }) {
  return (
    <Loading label={label} className={`divide-y divide-sl-line ${className}`}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBar className="h-4 w-1/3" />
            <SkeletonBar className="h-3 w-1/2" />
          </div>
          <SkeletonBar className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </Loading>
  );
}

/** A row of figure tiles, or the one-line figures summary when `line` is set. */
export function SkeletonFigures({ label = "Loading figures", count = 4, line = false }: { label?: string; count?: number; line?: boolean }) {
  if (line) {
    return (
      <Loading label={label} className="flex flex-wrap gap-x-7 gap-y-2 rounded-xl border border-sl-line bg-sl-surface px-5 py-3.5">
        {Array.from({ length: count }, (_, index) => <SkeletonBar key={index} className="h-4 w-28" />)}
      </Loading>
    );
  }
  return (
    <Loading label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border border-sl-line bg-sl-surface p-4">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-7 w-12" />
        </div>
      ))}
    </Loading>
  );
}

/** A page heading and the line under it. */
export function SkeletonHeading() {
  return (
    <div aria-hidden="true" className="space-y-2">
      <SkeletonBar className="h-8 w-56" />
      <SkeletonBar className="h-4 w-80 max-w-full" />
    </div>
  );
}

/**
 * The whole page in outline, the shape of the shell (header, side menu, heading, two cards), for the moments before
 * anyone is known: the first load and the sign-in check. It draws no desk name, so it suits every desk.
 */
export function PageSkeleton({ label = "Opening Silverleaf Academy" }: { label?: string }) {
  return (
    <Loading label={label} className="min-h-screen bg-sl-ground">
      <div className="flex h-[68px] items-center justify-between border-b border-sl-line bg-sl-surface px-6">
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-9 w-[30px]" />
          <SkeletonBar className="h-4 w-36" />
        </div>
        <SkeletonBar className="h-9 w-24" />
      </div>
      <div className="flex">
        <div className="hidden w-[256px] shrink-0 space-y-3 border-r border-sl-line bg-sl-surface p-4 lg:block">
          {Array.from({ length: 7 }, (_, index) => <SkeletonBar key={index} className="h-8 w-full" />)}
        </div>
        <div className="min-w-0 flex-1 space-y-6 px-5 py-8 sm:px-10">
          <SkeletonHeading />
          <div className="rounded-xl border border-sl-line bg-sl-surface p-5"><CardShape lines={4} /></div>
          <div className="rounded-xl border border-sl-line bg-sl-surface p-5"><CardShape lines={3} /></div>
        </div>
      </div>
    </Loading>
  );
}
