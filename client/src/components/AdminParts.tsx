import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
export function MoreActions({ actions, testId, label = "More actions" }: { actions: MenuAction[]; testId?: string; label?: string }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid={testId} className={secondaryButton}>
          {label}
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
  /** The Fellows enrolled in the cohort, whoever enrolled them. */
  fellows?: PathPerson[];
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

/** The Fellows enrolled in a cohort. The server sends them; older payloads fall back to the steps' ticks, once each. */
export function cohortFellows(cohort: PathCohort): PathPerson[] {
  if (cohort.fellows) return cohort.fellows;
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

/**
 * "Reset password…" on a person's page. It calls the route the Home tool calls (`/api/admin/reset-user-password`),
 * with the person's own login so the Admin types only the new password.
 */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  personName,
  identifier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  identifier: string;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const reset = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/reset-user-password", { userIdentifier: identifier, newPassword: password }),
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setPassword("");
      onOpenChange(false);
    },
    onError: (error: Error) => toast({ title: "Could not reset the password", description: error.message, variant: "destructive" }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="person-new-password">New Password</Label>
          <div className="relative">
            <PasswordInput
              id="person-new-password"
              placeholder="Enter new password (min 6 characters)"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              data-testid="input-person-new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => reset.mutate()} disabled={reset.isPending || password.length < 6} data-testid="button-confirm-person-reset">
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
