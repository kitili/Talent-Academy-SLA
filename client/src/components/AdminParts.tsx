import type { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The small pieces the Admin people, approvals, home and cohorts pages share (design/board/Admin*.dc.html):
 * status chips by meaning, one primary button, tabs with a count, a breadcrumb and a closed "More actions" menu.
 * Colours are the `sl-*` tokens only.
 */

export type Tone = "risk" | "attention" | "done" | "neutral" | "accent";

const TONES: Record<Tone, string> = {
  risk: "bg-sl-risk-soft text-sl-risk",
  attention: "bg-sl-attention-soft text-sl-attention",
  done: "bg-sl-done-soft text-sl-done",
  neutral: "bg-sl-neutral-soft text-sl-neutral",
  accent: "bg-sl-accent-soft text-sl-accent",
};

export function Chip({ tone = "neutral", children, testId }: { tone?: Tone; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const BUTTON = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-[15px] disabled:cursor-not-allowed disabled:opacity-50";
export const primaryButton = `${BUTTON} bg-sl-accent-strong font-semibold text-white hover:opacity-90`;
export const secondaryButton = `${BUTTON} border border-sl-control bg-sl-surface text-sl-ink hover:bg-sl-neutral-soft`;
export const dangerButton = `${BUTTON} border border-sl-risk bg-sl-surface font-semibold text-sl-risk hover:bg-sl-risk-soft`;
export const linkClass = "text-sl-accent underline underline-offset-2 hover:opacity-80";
export const cardClass = "rounded-xl border border-sl-line bg-sl-surface";
export const inputClass =
  "min-h-[44px] w-full rounded-lg border border-sl-control bg-sl-surface px-3 text-[15px] text-sl-ink placeholder:text-sl-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-sl-accent";

/** Status chip for a person's or cohort's `approvalStatus`. */
export function StatusChip({ status }: { status?: string | null }) {
  const value = (status || "").toLowerCase();
  if (value === "approved") return <Chip tone="done">Approved</Chip>;
  if (value === "pending") return <Chip tone="attention">Waiting</Chip>;
  if (value === "inactive") return <Chip tone="neutral">Inactive</Chip>;
  return <Chip tone="risk">{value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown"}</Chip>;
}

export function PageHeader({
  title,
  detail,
  tabs,
  actions,
}: {
  title: string;
  detail?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2.5">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{title}</h1>
          {detail && <p className="mt-1 text-[15px] text-sl-muted">{detail}</p>}
        </div>
        {tabs}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type TabItem = { id: string; label: string; count?: number; testId?: string };

/** Tabs with a count ("Trainers · 2"); the selected tab has an accent underline. */
export function TabBar({
  label,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  tabs: readonly TabItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 text-[15px]">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={tab.testId}
            onClick={() => onSelect(tab.id)}
            className={`min-h-[44px] border-b-2 px-3 ${
              selected ? "border-sl-accent font-semibold text-sl-accent" : "border-transparent text-sl-muted hover:text-sl-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className={selected ? "" : "text-sl-muted"}> · {tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Breadcrumb({ trail, current }: { trail: Array<{ label: string; href: string; testId?: string }>; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[15px]">
      {trail.map((step) => (
        <span key={step.href} className="flex items-center gap-1.5">
          <Link href={step.href} data-testid={step.testId} className={linkClass}>
            {step.label}
          </Link>
          <ChevronRight className="h-4 w-4 text-sl-muted" aria-hidden="true" />
        </span>
      ))}
      <span aria-current="page" className="text-sl-muted">
        {current}
      </span>
    </nav>
  );
}

export type MenuAction = { label: string; onSelect: () => void; testId?: string; danger?: boolean; disabled?: boolean };

/** A closed "More actions" menu. Destructive items end in "…" when they ask for confirmation. */
export function MoreActions({ actions, testId }: { actions: MenuAction[]; testId?: string }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid={testId} className={secondaryButton}>
          More actions
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            data-testid={action.testId}
            onSelect={action.onSelect}
            className={`min-h-[44px] cursor-pointer text-[15px] ${action.danger ? "text-sl-risk focus:text-sl-risk" : ""}`}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Grey bars while a list loads (never a false 0). */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-6 animate-pulse rounded bg-sl-neutral-soft" />
      ))}
    </div>
  );
}

/** Whole-page denied card, in tokens. */
export function AccessDenied({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sl-ground p-6">
      <div className={`${cardClass} max-w-md p-8 text-center`}>
        <h2 className="mb-3 text-xl font-semibold text-sl-ink">Access denied</h2>
        <p className="text-sl-muted">Only administrators can access this page.</p>
        {children}
      </div>
    </div>
  );
}

/** The academy path payload of `GET /api/admin/academy-path`: cohorts, their steps, courses and Fellows. */
export type PathCourse = { id: string; name: string; description?: string | null; publishStatus?: string };
export type PathPerson = { id: string; name: string; email?: string | null };
export type PathStep = {
  id: string;
  name: string;
  description?: string | null;
  orderIndex?: number;
  courses: PathCourse[];
  teachers?: PathPerson[];
};
export type PathCohort = {
  id: string;
  name: string;
  description?: string | null;
  track?: string | null;
  trainerId?: string | null;
  trainerIds?: string[];
  status?: string | null;
  quizzesStatus?: string | null;
  batches: PathStep[];
};
export type PathTrainer = { id: string; username: string; email?: string | null };
export type PathPayload = {
  cohortsRequired: number;
  cohorts: PathCohort[];
  courses: PathCourse[];
  trainers: PathTrainer[];
  teachers?: PathPerson[];
};

export function orderedSteps(cohort: PathCohort) {
  return [...cohort.batches].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

/** The Fellows enrolled in a cohort: everyone ticked on any of its steps, once. */
export function cohortFellows(cohort: PathCohort): PathPerson[] {
  const seen = new Map<string, PathPerson>();
  for (const step of cohort.batches) for (const person of step.teachers || []) seen.set(person.id, person);
  return Array.from(seen.values());
}

/** Steps (by 1-based position) that hold no course yet. */
export function emptyStepNumbers(cohort: PathCohort) {
  return orderedSteps(cohort).flatMap((step, index) => (step.courses.length === 0 ? [index + 1] : []));
}

/** "Step 2", "Steps 2 and 3", "Steps 2, 3 and 4". */
export function stepWords(numbers: number[]) {
  if (numbers.length === 1) return `Step ${numbers[0]}`;
  return `Steps ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

export function cohortHasTrainer(cohort: PathCohort) {
  return (cohort.trainerIds || []).length > 0;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
