import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import posthog from "posthog-js";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AcademyShell } from "@/components/AcademyShell";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import { TEACHER_TOUR } from "@shared/guidedTour";
import { DeskMail } from "@/components/DeskMail";
import { CohortMedals } from "@/components/CohortMedals";
import { PageStrip, usePager } from "@/components/PageStrip";
import { batchIsComplete } from "@shared/academyPath";
import { MODULE_QUIZ_PASS_PERCENT, QUIZ_ATTEMPTS } from "@shared/constants";
import type { Medal } from "@shared/cohortMedals";

/** The Fellow desk's sections. Keys are DESK_MENUS.fellow's (the shell draws the menu); `quiz` is the old key of `quizzes`. */
const FELLOW_TABS = ["home", "learning", "work", "quizzes", "progress", "reflect", "messages"] as const;
type FellowTab = (typeof FELLOW_TABS)[number];

function tabFromUrl(search: string, hash: string): FellowTab {
  const asked = new URLSearchParams(search).get("tab");
  if (asked === "quiz") return "quizzes";
  if ((FELLOW_TABS as readonly string[]).includes(asked || "")) return asked as FellowTab;
  if (hash === "#my-learning") return "learning";
  if (hash === "#my-work") return "work";
  return "home";
}

// ── Look: the sl-* tokens (design/DESIGN-BRIEF.md) ─────────────────────────────────────────────────────────────

type Tone = "neutral" | "done" | "attention" | "risk" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-sl-neutral-soft text-sl-neutral",
  done: "bg-sl-done-soft text-sl-done",
  attention: "bg-sl-attention-soft text-sl-attention",
  risk: "bg-sl-risk-soft text-sl-risk",
  accent: "bg-sl-accent-soft text-sl-accent",
};

const BTN = "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARY = `${BTN} bg-sl-accent-strong text-white hover:opacity-90`;
const BTN_SECONDARY = `${BTN} border border-sl-control bg-sl-surface font-medium text-sl-ink hover:bg-sl-neutral-soft`;
const FIELD = "w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted";
const LINK = "text-sl-accent underline underline-offset-2 hover:opacity-80";

function Chip({ tone = "neutral", children, testId }: { tone?: Tone; children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

function PageHeading({ title, sub, testId }: { title: string; sub?: ReactNode; testId?: string }) {
  return (
    <div>
      <h1 className="text-[28px] font-semibold leading-tight text-sl-ink" data-testid={testId}>{title}</h1>
      {sub && <p className="mt-1 text-sm text-sl-muted">{sub}</p>}
    </div>
  );
}

function Panel({
  title,
  sub,
  id,
  tour,
  testId,
  headerRight,
  children,
}: {
  title: string;
  sub?: ReactNode;
  id?: string;
  tour?: string;
  testId?: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} data-tour={tour} data-testid={testId} className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-sl-line px-5 py-4">
        <div>
          <h2 id={headingId} className="text-lg font-semibold text-sl-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-sl-muted">{sub}</p>}
        </div>
        {headerRight}
      </div>
      {children}
    </section>
  );
}

function Empty({ title, body }: { title: string; body: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[15px] font-medium text-sl-ink">{title}</p>
      <p className="text-sm text-sl-muted">{body}</p>
    </div>
  );
}

function SideCard({ title, children, testId, tour }: { title: string; children: ReactNode; testId?: string; tour?: string }) {
  return (
    <section className="rounded-xl border border-sl-line bg-sl-surface px-5 py-4" data-testid={testId} data-tour={tour}>
      <h2 className="text-base font-semibold text-sl-ink">{title}</h2>
      <div className="mt-1 space-y-1 text-sm text-sl-muted">{children}</div>
    </section>
  );
}

const fmtWhen = (value: unknown) => (value ? new Date(value as string).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const fmtDay = (value: unknown) => (value ? new Date(value as string).toLocaleDateString() : "");
const pickField = (item: any, snake: string, camel: string) => item?.[snake] ?? item?.[camel];

// ── Courses: a path course (from the academy path) joined to the Fellow's modules ──────────────────────────────

type CourseKind = "complete" | "locked" | "no-modules" | "no-files" | "not-started" | "in-progress";
type CourseState = { kind: CourseKind; pct: number; modules: number };

function courseState(pathCourse: any, group: any): CourseState {
  const modules = group?.weeks?.length || 0;
  if (pathCourse.completed || group?.courseChecked) return { kind: "complete", pct: 100, modules };
  if (!group) return { kind: "no-modules", pct: 0, modules: 0 };
  if ((group.totalFiles || 0) === 0) return { kind: "no-files", pct: 0, modules };
  const pct = group.aggregateProgress?.percentage || 0;
  const allLocked = group.weeks.every((week: any) => week.locked);
  if (pct === 0 && allLocked) return { kind: "locked", pct, modules };
  return { kind: pct === 0 ? "not-started" : "in-progress", pct, modules };
}

/** The chip a course shows; `where` picks the board's wording for a course with no lesson file. */
function courseChip(state: CourseState, where: "home" | "progress") {
  switch (state.kind) {
    case "complete": return <Chip tone="done">Completed</Chip>;
    case "no-modules": return <Chip>No modules yet</Chip>;
    case "no-files": return <Chip>{where === "home" ? "Waiting for lesson files" : "No lesson files yet"}</Chip>;
    case "locked": return <Chip>Opens after the course before it</Chip>;
    case "not-started": return <Chip>Not started</Chip>;
    default: return <Chip tone="accent">In progress · {state.pct}%</Chip>;
  }
}

const moduleName = (week: any, index: number) => {
  const number = week.weekNumber || index + 1;
  const topic = week.competencyFocus || week.title;
  return topic ? `Module ${number} · ${topic}` : `Module ${number}`;
};

/** "Steps 2 and 3, Systems and Procedures and Rules and Consequences, open after Step 1." */
function laterStepsLine(steps: any[], current: number) {
  const later = steps.slice(current + 1);
  const joinWith = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
  const numbers = later.map((_, i) => String(current + 2 + i));
  const label = later.length === 1 ? `Step ${numbers[0]}` : `Steps ${joinWith(numbers)}`;
  return `${label}, ${joinWith(later.map((step) => step.name))}, open after Step ${current + 1}.`;
}

/** A cohort's steps, each marked `open`: a step opens once every step before it is finished. */
function stepsWithState(cohort: any) {
  const steps: any[] = cohort?.batches || [];
  const firstUnfinished = steps.findIndex((step) => !batchIsComplete(step));
  const current = firstUnfinished < 0 ? Math.max(0, steps.length - 1) : firstUnfinished;
  return { steps, current };
}

function draftKey(id: string) {
  return `sl-work-draft-${id}`;
}
function readDraft(id: string) {
  try {
    return localStorage.getItem(draftKey(id)) || "";
  } catch {
    return "";
  }
}
function writeDraft(id: string, text: string) {
  try {
    if (text) localStorage.setItem(draftKey(id), text);
    else localStorage.removeItem(draftKey(id));
  } catch {
    /* private mode: the draft stays on the page */
  }
}

/** A 1–5 choice drawn as radio cards, with a real radio input each. */
function ScaleRadios({
  name,
  value,
  onChange,
  low,
  high,
  testId,
}: {
  name: string;
  value: number;
  onChange: (n: number) => void;
  low: string;
  high: string;
  testId?: (n: number) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <label
          key={n}
          className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-[15px] ${value === n ? "border-sl-accent bg-sl-accent-soft text-sl-ink" : "border-sl-control bg-sl-surface text-sl-ink"}`}
        >
          <input
            type="radio"
            name={name}
            value={n}
            checked={value === n}
            onChange={() => onChange(n)}
            className="h-4 w-4 accent-[rgb(var(--sl-accent))]"
            data-testid={testId?.(n)}
          />
          {n === 1 ? `1 · ${low}` : n === 5 ? `5 · ${high}` : n}
        </label>
      ))}
    </div>
  );
}

function GoalRow({
  goal,
  onStatus,
  onRemove,
}: {
  goal: any;
  onStatus?: (status: string) => void;
  onRemove?: () => void;
}) {
  const done = goal.status === "completed";
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-sl-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] ${done ? "text-sl-muted line-through" : "text-sl-ink"}`}>{goal.goalText}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-sl-muted">
          {done ? <Chip tone="done">Done</Chip> : goal.status === "in_progress" ? <Chip tone="accent">In progress</Chip> : <Chip>Not started</Chip>}
          {goal.dueDate && <span>Target {fmtDay(goal.dueDate)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {onStatus && goal.status === "pending" && (
          <button type="button" className={`${BTN_SECONDARY} min-h-[44px]`} onClick={() => onStatus("in_progress")}>Start</button>
        )}
        {onStatus && goal.status === "in_progress" && (
          <button type="button" className={BTN_PRIMARY} onClick={() => onStatus("completed")}>Done</button>
        )}
        {onRemove && (
          <button type="button" className={BTN_SECONDARY} aria-label={`Remove goal: ${goal.goalText}`} onClick={onRemove}>Remove</button>
        )}
      </div>
    </li>
  );
}

export default function TeacherDashboard() {
  const [, setLocation] = useLocation();
  const search = useSearch();

  // Track dashboard view
  useEffect(() => {
    posthog.capture("teacher_dashboard_viewed");
  }, []);

  const { data: teacher } = useQuery<any>({
    queryKey: ["/api/teacher/me"],
  });

  const { data: reportCard } = useQuery<any>({
    queryKey: ["/api/teacher/report-card"],
  });

  const { data: assignedWeeks = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/assigned-weeks"],
  });
  const { data: medalRows = [] } = useQuery<Array<{ batchId: string; batchName: string; medals: Medal[] }>>({
    queryKey: ["/api/teacher/medals"],
  });
  const { data: deskPeers = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/desk-peers"],
  });
  const { data: path } = useQuery<any>({
    queryKey: ["/api/teacher/academy-path"],
  });
  const { data: certificates = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher", teacher?.id, "certificates"],
    enabled: Boolean(teacher?.id),
  });

  const { data: deskNotices = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=8");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { toast } = useToast();
  const completeCourse = useMutation({
    mutationFn: async ({ courseId, batchId }: { courseId: string; batchId: string }) => {
      await apiRequest("POST", `/api/teacher/courses/${courseId}/complete`, { batchId });
    },
    onSuccess: () => {
      toast({ title: "Course complete", description: "The next course is open." });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assigned-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/medals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/academy-path"] });
    },
    onError: (error: Error) => {
      toast({ title: "Could not mark the course complete", description: error.message, variant: "destructive" });
    },
  });
  const [reflectionWeekId, setReflectionWeekId] = useState("");
  const [reflectionBatchId, setReflectionBatchId] = useState("");
  const [reflectionContent, setReflectionContent] = useState("");
  const [reflectionRating, setReflectionRating] = useState(0);
  const [satisfactionScore, setSatisfactionScore] = useState(0);
  const [satisfactionCourseId, setSatisfactionCourseId] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackScore, setFeedbackScore] = useState(0);
  const [workDrafts, setWorkDrafts] = useState<Record<string, string>>({});
  const [draftSavedAt, setDraftSavedAt] = useState<Record<string, string>>({});
  const [shownAnswers, setShownAnswers] = useState<Record<string, boolean>>({});
  const [deskPeerId, setDeskPeerId] = useState("");
  const [learningCohortId, setLearningCohortId] = useState("");
  const [learningStep, setLearningStep] = useState<number | null>(null);

  const { logoutMutation } = useAuth();
  const tour = useGuidedTour("sla-tour-teacher-v1");

  // The section lives in `?tab=` so a refresh, a shared link and the shell's menu all agree. An old `#my-learning` or
  // `#my-work` link still lands on its section, and the URL is rewritten to `?tab=`.
  const [tab, setTabState] = useState<FellowTab>(() => tabFromUrl(search, typeof window === "undefined" ? "" : window.location.hash));
  useEffect(() => {
    setTabState(tabFromUrl(search, window.location.hash));
  }, [search]);
  const setTab = (next: FellowTab, replace = false) => {
    setTabState(next);
    setLocation(`/teacher/dashboard?tab=${next}`, { replace });
  };
  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash;
      if (hash === "#my-learning") setTab("learning", true);
      if (hash === "#my-work") setTab("work", true);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tour.open) return;
    const target = TEACHER_TOUR[tour.index]?.target;
    if (target === "teacher-continue") setTab("home", true);
    if (target === "teacher-learning") setTab("learning", true);
    if (target === "teacher-progress") setTab("progress", true);
    if (target === "teacher-certificates") setTab("home", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.open, tour.index]);

  useEffect(() => {
    if (!tour.open) return;
    const target = TEACHER_TOUR[tour.index]?.target;
    if (!target) return;
    const element = document.querySelector(`[data-tour="${target}"]`);
    if (!element) return;
    element.classList.add("sla-tour-target");
    element.scrollIntoView({ block: "center" });
  }, [tour.open, tour.index, tab]);

  // Fetch own reflections
  const { data: reflections = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/reflections"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/reflections");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch trainer comments
  const { data: trainerComments = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/trainer-comments"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/trainer-comments");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch goals
  const { data: goals = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/goals"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/goals");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch improvement tips
  const { data: tips = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/improvement-tips"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/improvement-tips");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch progress summary
  const { data: progressSummary } = useQuery<any>({
    queryKey: ["/api/teacher/progress-summary"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/progress-summary");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  // Goal state
  const [newGoalText, setNewGoalText] = useState("");
  const [newGoalDate, setNewGoalDate] = useState("");

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async (data: { goalText: string; dueDate?: string }) => {
      await apiRequest("POST", "/api/teacher/goals", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Goal created successfully" });
      setNewGoalText("");
      setNewGoalDate("");
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/goals"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update goal mutation
  const updateGoalMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/teacher/goals/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/goals"] });
    },
  });

  // Delete goal mutation
  const deleteGoalMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teacher/goals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/goals"] });
    },
  });

  // Submit reflection mutation
  const submitReflectionMutation = useMutation({
    mutationFn: async (data: { weekId: string; batchId: string; content: string; rating: number | null }) => {
      await apiRequest("POST", "/api/teacher/reflections", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Reflection submitted successfully" });
      setReflectionContent("");
      setReflectionRating(0);
      setReflectionWeekId("");
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/reflections"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Submit satisfaction score mutation
  const submitSatisfactionMutation = useMutation({
    mutationFn: async (data: { type: string; raterId: string; raterRole: string; targetId: string; targetType: string; score: number }) => {
      await apiRequest("POST", "/api/satisfaction-scores", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Rating submitted successfully" });
      setSatisfactionScore(0);
      setSatisfactionCourseId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const sendFeedback = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/satisfaction-scores", {
        type: "teacher_feedback",
        targetId: "academy",
        targetType: "academy",
        score: feedbackScore,
        comment: feedbackNote,
      });
    },
    onSuccess: () => {
      toast({ title: "Feedback sent", description: "An admin can read this with the other ratings." });
      setFeedbackNote("");
      setFeedbackScore(0);
    },
    onError: (error: Error) => {
      toast({ title: "Could not send feedback", description: error.message, variant: "destructive" });
    },
  });

  // Group weeks by course and aggregate progress
  const groupedCourses = assignedWeeks.reduce((acc: any, week: any) => {
    const key = week.courseId || week.courseName || week.title;
    if (!acc[key]) {
      acc[key] = {
        courseId: week.courseId,
        courseName: week.courseName || week.title,
        batchId: week.batchId,
        courseChecked: false,
        canCheckComplete: false,
        weeks: [],
        totalCompleted: 0,
        totalFiles: 0,
      };
    }
    acc[key].weeks.push(week);
    acc[key].batchId = acc[key].batchId || week.batchId;
    acc[key].courseChecked = acc[key].courseChecked || Boolean(week.courseChecked);
    acc[key].canCheckComplete = acc[key].canCheckComplete || Boolean(week.canCheckComplete);
    acc[key].totalCompleted += week.progress?.completed || 0;
    acc[key].totalFiles += week.progress?.total || 0;
    return acc;
  }, {});

  const uniqueCourses = Object.values(groupedCourses).map((course: any) => ({
    ...course,
    aggregateProgress: {
      completed: course.totalCompleted,
      total: course.totalFiles,
      percentage: course.totalFiles > 0
        ? Math.round((course.totalCompleted / course.totalFiles) * 100)
        : 0,
    },
  }));
  const groupFor = (courseId: string) => uniqueCourses.find((course: any) => course.courseId === courseId);

  const nextLesson = [...assignedWeeks]
    .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0))
    .find((week: any) => !week.locked && (week.progress?.total || 0) > 0 && (week.progress?.percentage || 0) < 100);
  const lastWeekId = typeof window !== "undefined" ? sessionStorage.getItem("sl-last-week") : null;
  const shelfIsEmpty = assignedWeeks.length > 0 && assignedWeeks.every((week: any) => (week.progress?.total || 0) === 0);
  const firstModule = [...assignedWeeks]
    .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0))
    .find((week: any) => !week.locked);
  const resumeWeek =
    assignedWeeks.find((week: any) => week.id === lastWeekId && !week.locked) || nextLesson || (shelfIsEmpty ? firstModule : undefined);

  const { data: upcomingEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/events"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/events");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: skills = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/skills-map"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/skills-map");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: myExams = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/quizzes"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/quizzes", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Each try's score, so an exam row can say Not started, Passed or how many tries are left (the server grades; this
  // page only reads the scores back).
  const { data: examAttempts = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/quiz-attempts"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/quiz-attempts", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: myWork = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/assignments"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/assignments");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const submitWork = useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const res = await apiRequest("POST", `/api/teacher/assignments/${id}/submit`, { response });
      return res.json();
    },
    onSuccess: (_row, variables) => {
      writeDraft(variables.id, "");
      toast({ title: "Work submitted" });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assignments"] });
    },
    onError: () => toast({ title: "Could not submit work", variant: "destructive" }),
  });

  const cohorts: any[] = path?.cohorts || [];
  const cohortName = (id?: string) => cohorts.find((cohort) => cohort.id === id)?.name as string | undefined;
  const cohortNames = cohorts.map((cohort) => cohort.name).join(" and ");

  // The attendance summary per cohort comes from the server (the same figures the medals use).
  const attendanceByCohort = useQueries({
    queries: cohorts.map((cohort) => ({
      queryKey: ["/api/teacher/attendance/summary", cohort.id],
      queryFn: async () => {
        const res = await fetch(`/api/teacher/attendance/summary?batchId=${encodeURIComponent(cohort.id)}`, { credentials: "include" });
        if (!res.ok) return null;
        return res.json();
      },
    })),
  });

  const assessments = myWork.filter((item: any) => item.kind === "assessment");
  const eventPager = usePager(upcomingEvents, 5);
  const workPager = usePager(assessments, 4);
  const reflectionPager = usePager(reflections, 4);
  const commentPager = usePager(trainerComments, 4);
  const goalPager = usePager(goals, 5);
  const noticePager = usePager(deskNotices, 4);

  const firstName = String(teacher?.name || "").trim().split(/\s+/)[0] || "Fellow";
  const focusCohort =
    cohorts.find((cohort) => cohort.id === resumeWeek?.batchId) || cohorts.find((cohort) => (cohort.batches || []).length > 0) || cohorts[0];
  const focus = stepsWithState(focusCohort);
  const homeStep = focus.steps[focus.current];
  const headerLine = focusCohort
    ? focus.steps.length > 0
      ? `${focusCohort.name} · Step ${focus.current + 1} of ${focus.steps.length}`
      : `${focusCohort.name} · no steps yet`
    : "You are not in a cohort yet. An Admin places you in one.";

  const learningCohort = cohorts.find((cohort) => cohort.id === learningCohortId) || focusCohort;
  const learning = stepsWithState(learningCohort);
  const learningStepIndex = learningStep !== null && learningStep <= learning.current ? learningStep : learning.current;
  const learningStepData = learning.steps[learningStepIndex];
  const pathCourseIds = new Set(cohorts.flatMap((cohort) => (cohort.batches || []).flatMap((step: any) => step.courses.map((course: any) => course.id))));
  const strayCourses = uniqueCourses.filter((course: any) => !course.courseId || !pathCourseIds.has(course.courseId));

  const goTab = (next: FellowTab) => (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  // ── Home ─────────────────────────────────────────────────────────────────────────────────────────────────────

  const openWork = assessments.filter((item: any) => !(item.my_response || item.myResponse));
  const todoItems = [
    myExams[0] && { key: "exam", title: myExams[0].title, detail: myExams[0].paperUrl ? "Open the paper and write your answers" : "Write this exam on your desk", go: () => setLocation(`/teacher/exams/${myExams[0].id}`) },
    openWork[0] && { key: "work", title: openWork[0].title, detail: "Written work still due", go: () => setTab("work") },
  ].filter(Boolean) as Array<{ key: string; title: string; detail: string; go: () => void }>;

  const home = (
    <>
      <PageHeading title={`Hello, ${firstName}`} sub={headerLine} testId="text-welcome" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-sl-line bg-sl-surface px-5 py-5" data-tour="teacher-continue" aria-labelledby="continue-heading">
            {resumeWeek && !shelfIsEmpty ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-sl-accent">Continue</p>
                <h2 id="continue-heading" className="mt-1 text-[22px] font-semibold text-sl-ink">{resumeWeek.competencyFocus || `Module ${resumeWeek.weekNumber}`}</h2>
                <p className="mt-1 text-[15px] text-sl-muted">
                  {resumeWeek.courseName ? `${resumeWeek.courseName} · ` : ""}Module {resumeWeek.weekNumber}. Read the lesson file, then take its quiz. Finish the module to open the next one.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button type="button" className={BTN_PRIMARY} onClick={() => setLocation(`/teacher/week/${resumeWeek.id}/content`)}>Resume</button>
                  <a href="?tab=learning" className={LINK} onClick={goTab("learning")}>See all your courses</a>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-sl-accent">Up to date</p>
                <h2 id="continue-heading" className="mt-1 text-[22px] font-semibold text-sl-ink">
                  {assignedWeeks.length > 0 && !shelfIsEmpty ? "You are caught up" : "Nothing to read yet"}
                </h2>
                <p className="mt-1 text-[15px] text-sl-muted">
                  {shelfIsEmpty
                    ? `Your ${homeStep ? `Step ${focus.current + 1} ` : ""}courses have no lesson files yet. When your trainer adds them, the first one to read shows here.`
                    : assignedWeeks.length === 0
                      ? "Your courses have no modules yet. When one is added, the first lesson file to read shows here."
                      : "Every module you can open is complete. Your certificates are next, once an Admin issues them."}
                </p>
                {resumeWeek && shelfIsEmpty && (
                  <p className="mt-3 rounded-lg bg-sl-ground px-3 py-2 text-sm text-sl-muted">
                    You can still open Module {resumeWeek.weekNumber}{resumeWeek.competencyFocus ? `, ${resumeWeek.competencyFocus}` : ""}, and read its objective.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  {resumeWeek && shelfIsEmpty && (
                    <button type="button" className={BTN_SECONDARY} onClick={() => setLocation(`/teacher/week/${resumeWeek.id}/content`)}>
                      Open Module {resumeWeek.weekNumber}
                    </button>
                  )}
                  {!resumeWeek && assignedWeeks.length > 0 && (
                    <button type="button" className={BTN_PRIMARY} onClick={() => setLocation("/teacher/certificates")}>Open certificates</button>
                  )}
                  <a href="?tab=learning" className={LINK} onClick={goTab("learning")}>See all your courses</a>
                </div>
              </>
            )}
          </section>

          {todoItems.length > 0 && (
            <Panel title="To do" id="home-todo">
              <ul className="divide-y divide-sl-line">
                {todoItems.map((item) => (
                  <li key={item.key}>
                    <button type="button" className="flex min-h-[44px] w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-sl-neutral-soft" onClick={item.go}>
                      <span>
                        <span className="block text-[15px] font-medium text-sl-ink">{item.title}</span>
                        <span className="block text-sm text-sl-muted">{item.detail}</span>
                      </span>
                      <span className="text-sl-accent" aria-hidden="true">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {homeStep && (
            <Panel title={`Your courses in Step ${focus.current + 1}`} id="home-courses">
              {homeStep.courses.length === 0 ? (
                <Empty title="No course in this step yet." body="Courses appear here once your Admin places one on this step." />
              ) : (
                <ul className="divide-y divide-sl-line">
                  {homeStep.courses.map((course: any) => {
                    const state = courseState(course, groupFor(course.id));
                    const isCurrent = Boolean(resumeWeek && resumeWeek.courseId === course.id);
                    return (
                      <li key={course.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <span className={`text-[15px] text-sl-ink ${isCurrent ? "font-semibold" : ""}`}>{course.name}</span>
                        {courseChip(state, "home")}
                      </li>
                    );
                  })}
                </ul>
              )}
              {focus.steps.length > focus.current + 1 && (
                <p className="border-t border-sl-line px-5 py-3 text-[13px] text-sl-muted">{laterStepsLine(focus.steps, focus.current)}</p>
              )}
            </Panel>
          )}

          {goals.length > 0 && (
            <Panel title="Your goals" id="home-goals" testId="card-home-goals" sub="Goals you set on Reflect">
              <ul className="space-y-2 px-5 py-4">
                {goalPager.slice.map((goal: any) => (
                  <GoalRow key={goal.id} goal={goal} onStatus={(status) => updateGoalMutation.mutate({ id: goal.id, status })} />
                ))}
              </ul>
              {goalPager.pages > 1 && <div className="px-5 pb-4"><PageStrip page={goalPager.page} pages={goalPager.pages} setPage={goalPager.setPage} /></div>}
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <SideCard title="Coming up">
            {upcomingEvents.length === 0 ? (
              <p>Nothing scheduled. Sessions and deadlines from your trainer appear here.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingEvents.slice(0, 3).map((event: any) => (
                  <li key={event.id}>
                    <p className="font-medium text-sl-ink">{event.title || "Session"}</p>
                    <p>{fmtWhen(pickField(event, "start_date", "startDate"))}</p>
                  </li>
                ))}
              </ul>
            )}
            <p><a href="?tab=work#my-calendar" className={LINK} onClick={(event) => { event.preventDefault(); setTab("work"); window.setTimeout(() => document.getElementById("my-calendar")?.scrollIntoView(), 0); }}>Open my calendar</a></p>
          </SideCard>
          <SideCard title="From your trainer">
            {trainerComments.length === 0 ? (
              <p>No feedback yet. Desk mail with your trainer is under Messages.</p>
            ) : (
              <p>
                <span className="font-medium text-sl-ink">Latest feedback: </span>
                {String(trainerComments[0].comment).slice(0, 90)}{String(trainerComments[0].comment).length > 90 ? "…" : ""}
              </p>
            )}
            <p><a href="?tab=messages" className={LINK} onClick={goTab("messages")}>Open messages</a></p>
          </SideCard>
          <SideCard title="Certificates" tour="teacher-certificates">
            {certificates.length === 0 ? (
              <p>None yet. A course certificate is issued once every module is complete.</p>
            ) : (
              <p>{certificates.length} issued to you.</p>
            )}
            <p>
              <a
                href="/teacher/certificates"
                className={LINK}
                data-testid="button-teacher-certificates"
                onClick={(event) => { event.preventDefault(); setLocation("/teacher/certificates"); }}
              >
                Open certificates
              </a>
            </p>
          </SideCard>
        </div>
      </div>
    </>
  );

  // ── Learning ─────────────────────────────────────────────────────────────────────────────────────────────────

  const courseBlock = (course: { id?: string; name: string }, group: any, state: CourseState) => {
    const pct = state.pct;
    const sortedWeeks = group ? [...group.weeks].sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0)) : [];
    if (state.kind === "no-modules") {
      return (
        <li key={course.id || course.name} data-testid={`card-course-${course.name}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
          <span className="text-[15px] text-sl-muted">{course.name}</span>
          <span className="text-[13px] text-sl-muted">No modules yet · does not hold you up</span>
        </li>
      );
    }
    return (
      <li key={course.id || course.name} data-testid={`card-course-${course.name}`} className="space-y-3 bg-sl-ground/40 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-sl-ink">{course.name}</p>
            <p className="text-[13px] text-sl-muted">
              {state.modules} module{state.modules === 1 ? "" : "s"}
              {state.kind === "no-files" ? " · no lesson files yet, so it cannot be marked complete yet" : ` · ${pct}%`}
            </p>
          </div>
          {state.kind === "complete" ? (
            <Chip tone="done">Completed</Chip>
          ) : group?.canCheckComplete && group.courseId && group.batchId ? (
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={completeCourse.isPending}
              onClick={() => completeCourse.mutate({ courseId: group.courseId, batchId: group.batchId })}
              data-testid={`button-complete-course-${group.courseId}`}
            >
              Mark complete and open the next
            </button>
          ) : (
            <span className="text-[13px] text-sl-muted">Mark complete appears once every lesson file is done</span>
          )}
        </div>
        <ul className="space-y-2">
          {sortedWeeks.map((week: any, index: number) => {
            const locked = !!week.locked;
            const total = week.progress?.total || 0;
            return (
              <li key={week.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sl-line bg-sl-surface px-4 py-2.5">
                <span className={`text-[15px] ${locked ? "text-sl-muted" : "text-sl-ink"}`}>{moduleName(week, index)}</span>
                <span className="flex flex-wrap items-center gap-3">
                  {locked ? (
                    <Chip>Locked · opens after the module before it</Chip>
                  ) : total === 0 ? (
                    <Chip>No lesson file yet · does not hold you up</Chip>
                  ) : (
                    <Chip tone={(week.progress?.percentage || 0) >= 100 ? "done" : "accent"}>
                      {week.progress.completed} of {total} lesson file{total === 1 ? "" : "s"} done
                    </Chip>
                  )}
                  {!locked && (
                    <button type="button" className={`min-h-[44px] px-1 ${LINK}`} onClick={() => setLocation(`/teacher/week/${week.id}/content`)} data-testid={`button-view-content-${week.id}`}>
                      Open
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </li>
    );
  };

  const learningView = (
    <>
      <PageHeading
        title="Learning"
        sub={`${learningCohort ? `${learningCohort.name} · ` : ""}pass mark ${MODULE_QUIZ_PASS_PERCENT}% · ${QUIZ_ATTEMPTS} tries per quiz`}
      />
      {cohorts.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cohort">
          {cohorts.map((cohort) => {
            const active = cohort.id === learningCohort?.id;
            return (
              <button
                key={cohort.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setLearningCohortId(cohort.id); setLearningStep(null); }}
                className={`min-h-[44px] rounded-full border px-4 text-sm ${active ? "border-sl-accent bg-sl-accent-soft font-semibold text-sl-accent" : "border-sl-control bg-sl-surface text-sl-ink"}`}
              >
                {cohort.name}
              </button>
            );
          })}
        </div>
      )}
      {learning.steps.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Steps">
          {learning.steps.map((step: any, index: number) => {
            const open = index <= learning.current;
            const active = index === learningStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                disabled={!open}
                aria-pressed={active}
                onClick={() => setLearningStep(index)}
                className={`min-h-[44px] rounded-full border px-4 text-sm ${active ? "border-sl-accent bg-sl-accent-soft font-semibold text-sl-accent" : "border-sl-line bg-sl-surface text-sl-muted"} disabled:cursor-not-allowed`}
              >
                {open ? `Step ${index + 1} · ${step.name}` : `Step ${index + 1} · opens after Step ${index}`}
              </button>
            );
          })}
        </div>
      )}

      <Panel title={learningStepData ? `Courses in Step ${learningStepIndex + 1}, in order` : "Courses"} id="my-learning" tour="teacher-learning">
        {!learningStepData ? (
          <Empty title="No courses yet." body="An Admin places a course on your cohort, and it appears here." />
        ) : learningStepData.courses.length === 0 ? (
          <Empty title="No course in this step yet." body="Courses appear here once your Admin places one on this step." />
        ) : (
          <ul className="divide-y divide-sl-line">
            {learningStepData.courses.map((course: any) => courseBlock(course, groupFor(course.id), courseState(course, groupFor(course.id))))}
          </ul>
        )}
      </Panel>

      {strayCourses.length > 0 && (
        <Panel title="Other courses" id="other-courses">
          <ul className="divide-y divide-sl-line">
            {strayCourses.map((course: any) => courseBlock({ id: course.courseId, name: course.courseName }, course, courseState({ completed: false }, course)))}
          </ul>
        </Panel>
      )}

      <p className="text-sm text-sl-muted">
        Medals and your course percentages are on <a href="?tab=progress" className={LINK} onClick={goTab("progress")}>Progress</a>.
      </p>
    </>
  );

  // ── Work ─────────────────────────────────────────────────────────────────────────────────────────────────────

  const workView = (
    <>
      <PageHeading
        title="Work"
        sub={`Written work your trainer sets${cohortNames ? ` in ${cohortNames}` : ""} · marked out of 100`}
      />
      <Panel title="Your written work" id="my-work" testId="card-teacher-work">
        {assessments.length === 0 ? (
          <Empty title="No written work yet." body="When your trainer sets some, it appears here with its due date." />
        ) : (
          <div className="divide-y divide-sl-line">
            {workPager.slice.map((item: any) => {
              const id = item.id;
              const submitted = item.my_response || item.myResponse;
              const score = item.trainer_score ?? item.trainerScore;
              const comment = item.trainer_comment || item.trainerComment;
              const marked = score != null;
              const due = pickField(item, "due_date", "dueDate");
              const fileUrl = item.file_url || item.fileUrl;
              const batch = cohortName(pickField(item, "batch_id", "batchId"));
              const draft = workDrafts[id] ?? readDraft(id);
              return (
                <article key={id} className="space-y-3 px-5 py-4" aria-label={item.title}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold text-sl-ink">{item.title}</h3>
                      <p className="text-sm text-sl-muted">{[batch, due ? `due ${fmtWhen(due)}` : ""].filter(Boolean).join(" · ")}</p>
                    </div>
                    {marked ? <Chip tone="done">Marked · {score} / 100</Chip> : submitted ? <Chip>Submitted · waiting for your trainer's mark</Chip> : <Chip tone="done">Open</Chip>}
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-sl-ink">Instructions</p>
                    <p className="whitespace-pre-wrap text-[15px] text-sl-ink">{item.instructions}</p>
                    {fileUrl && (
                      <a className={`text-sm font-medium ${LINK}`} href={fileUrl} target="_blank" rel="noreferrer">
                        Open {item.file_name || item.fileName || "the file"}
                      </a>
                    )}
                  </div>
                  {submitted ? (
                    <div className="space-y-2">
                      {comment && (
                        <div className="rounded-lg bg-sl-ground px-4 py-3">
                          <p className="text-[13px] font-semibold text-sl-neutral">Comment from your trainer</p>
                          <p className="text-[15px] text-sl-ink">{comment}</p>
                        </div>
                      )}
                      {shownAnswers[id] ? (
                        <div>
                          <p className="text-[15px] font-semibold text-sl-ink">Your answer</p>
                          <p className="whitespace-pre-wrap text-[15px] text-sl-ink">{submitted}</p>
                        </div>
                      ) : null}
                      <button type="button" className={`min-h-[44px] ${LINK}`} onClick={() => setShownAnswers((current) => ({ ...current, [id]: !current[id] }))}>
                        {shownAnswers[id] ? "Hide your answer" : "Show your answer"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label htmlFor={`answer-${id}`} className="block text-[15px] font-semibold text-sl-ink">Your answer</label>
                      <textarea
                        id={`answer-${id}`}
                        rows={7}
                        className={FIELD}
                        value={draft}
                        onChange={(e) => setWorkDrafts((current) => ({ ...current, [id]: e.target.value }))}
                      />
                      <p className="text-[13px] text-sl-muted">
                        {draftSavedAt[id] ? `Draft saved on this device at ${draftSavedAt[id]}. ` : ""}Your trainer sees it only after you submit.
                      </p>
                      <div className="flex flex-wrap justify-end gap-3">
                        <button
                          type="button"
                          className={BTN_SECONDARY}
                          disabled={!draft.trim()}
                          onClick={() => {
                            writeDraft(id, draft);
                            setDraftSavedAt((current) => ({ ...current, [id]: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
                          }}
                        >
                          Save draft
                        </button>
                        <button
                          type="button"
                          className={BTN_PRIMARY}
                          disabled={!draft.trim() || submitWork.isPending}
                          onClick={() => submitWork.mutate({ id, response: draft })}
                        >
                          Submit answer
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {workPager.pages > 1 && <div className="px-5 pb-4"><PageStrip page={workPager.page} pages={workPager.pages} setPage={workPager.setPage} /></div>}
          </div>
        )}
      </Panel>

      <Panel title="My calendar" id="my-calendar" sub="Sessions and deadlines for your cohorts">
        {upcomingEvents.length === 0 ? (
          <Empty title="Nothing scheduled yet." body="A session or deadline your trainer adds appears here." />
        ) : (
          <>
            <ul className="divide-y divide-sl-line">
              {eventPager.slice.map((event: any) => (
                <li key={event.id} className="px-5 py-3 text-sm">
                  <p className="text-[15px] font-medium text-sl-ink">{event.title}</p>
                  <p className="text-sl-muted">
                    {pickField(event, "event_type", "eventType")} · {fmtWhen(pickField(event, "start_date", "startDate"))}
                  </p>
                </li>
              ))}
            </ul>
            {eventPager.pages > 1 && <div className="px-5 pb-4"><PageStrip page={eventPager.page} pages={eventPager.pages} setPage={eventPager.setPage} /></div>}
          </>
        )}
      </Panel>
    </>
  );

  // ── Quizzes ──────────────────────────────────────────────────────────────────────────────────────────────────

  const examStanding = (exam: any) => {
    const tries = examAttempts.filter((attempt: any) => attempt.assignedQuizId === exam.id);
    const passMark = exam.passMark || MODULE_QUIZ_PASS_PERCENT;
    const best = tries.reduce((top: number, attempt: any) => Math.max(top, attempt.totalQuestions > 0 ? Math.round((attempt.score / attempt.totalQuestions) * 100) : 0), 0);
    const passed = tries.some((attempt: any) => attempt.totalQuestions > 0 && (attempt.score / attempt.totalQuestions) * 100 >= passMark);
    return { tries: tries.length, passMark, best, passed, left: Math.max(0, QUIZ_ATTEMPTS - tries.length) };
  };

  const examsByCohort = myExams.reduce((groups: Record<string, any[]>, exam: any) => {
    const key = exam.batchId || "";
    (groups[key] = groups[key] || []).push(exam);
    return groups;
  }, {});

  const quizzesView = (
    <>
      <PageHeading
        title="Quizzes"
        sub={<>Exams your trainer assigned. Lesson file quizzes are on each module page in <a href="?tab=learning" className={LINK} onClick={goTab("learning")}>Learning</a>.</>}
      />
      <Panel title="Your exams" id="your-exams" testId="card-teacher-exams">
        {myExams.length === 0 ? (
          <Empty title="No exams yet." body="When your trainer assigns one, it appears here with its due date, pass mark and tries." />
        ) : (
          <div className="space-y-5 px-5 py-4">
            {Object.entries(examsByCohort).map(([batchId, exams]) => (
              <div key={batchId || "none"} className="space-y-2">
                {batchId && cohortName(batchId) && (
                  <h3 className="text-base font-semibold text-sl-ink">{cohortName(batchId)} <span className="font-normal text-sl-muted">· {exams.length} exam{exams.length === 1 ? "" : "s"}</span></h3>
                )}
                <ul className="space-y-2">
                  {exams.map((exam: any) => {
                    const standing = examStanding(exam);
                    const paper = exam.kind === "paper";
                    const finished = standing.passed || (standing.tries > 0 && standing.left === 0);
                    const action = paper ? "Open" : finished ? "Review answers" : standing.tries > 0 ? "Try again" : "Start";
                    return (
                      <li key={exam.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sl-line px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[15px] text-sl-ink">
                            <span className="font-semibold">{exam.title}</span>
                            <span className="text-sl-muted">{exam.dueDate ? ` · due ${fmtWhen(exam.dueDate)}` : ""}</span>
                          </p>
                          {paper ? (
                            <p className="text-[13px] text-sl-muted">Opens as a document: read the paper on the left, write your answers on the right.</p>
                          ) : standing.passed ? (
                            <Chip tone="done">Passed · {standing.best}%</Chip>
                          ) : standing.tries === 0 ? (
                            <Chip>Not started · pass at {standing.passMark}% · {QUIZ_ATTEMPTS} tries</Chip>
                          ) : (
                            <Chip tone="attention">
                              Not passed · {standing.best}% · {standing.left === 0 ? "no tries left" : `${standing.left} ${standing.left === 1 ? "try" : "tries"} left`}
                            </Chip>
                          )}
                          {!paper && exam.kind === "written" && <p className="text-[13px] text-sl-muted">Written exam</p>}
                        </div>
                        <button
                          type="button"
                          className={action === "Start" || action === "Try again" ? BTN_PRIMARY : BTN_SECONDARY}
                          onClick={() => setLocation(`/teacher/exams/${exam.id}`)}
                          data-testid={`link-exam-${exam.id}`}
                        >
                          {action}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p className="text-[13px] text-sl-muted">After each try you see which answers were right. The correct answers show after your last try.</p>
          </div>
        )}
      </Panel>
    </>
  );

  // ── Progress ─────────────────────────────────────────────────────────────────────────────────────────────────

  const attendanceLine = (summary: any) => {
    const days = Number(summary?.total_days || 0);
    if (!days) return null;
    const parts = [
      ["present", Number(summary.present_days || 0)],
      ["late", Number(summary.late_days || 0)],
      ["absent", Number(summary.absent_days || 0)],
      ["excused", Number(summary.excused_days || 0)],
    ].filter(([, count]) => (count as number) > 0);
    const all = parts.length === 1 && parts[0][0] === "present";
    const words = all ? (days === 1 ? "present" : days === 2 ? "both present" : "all present") : parts.map(([label, count]) => `${count} ${label}`).join(", ");
    return `${days} ${days === 1 ? "day" : "days"} marked · ${words}`;
  };

  const progressView = (
    <>
      <PageHeading
        title="Progress"
        sub={`Your courses, attendance and medals in each cohort${path ? ` · academy path ${path.cohortsCompleted} of ${path.cohortsRequired} cohorts finished` : ""}`}
      />
      <div className="space-y-6" data-tour="teacher-progress">
        {cohorts.length === 0 && (
          <Panel title="Cohorts" id="progress-none">
            <Empty title="You are not in a cohort yet." body="An Admin places you in one. Your courses, attendance and medals appear here." />
          </Panel>
        )}
        <div className="space-y-6" data-testid={medalRows.length > 0 ? "card-teacher-medals" : undefined}>
        {cohorts.map((cohort, cohortIndex) => {
          const { steps, current } = stepsWithState(cohort);
          const step = steps[current];
          const medals = medalRows.find((row) => row.batchId === cohort.id)?.medals || [];
          const earned = medals.filter((medal) => medal.earned).length;
          const summary = attendanceByCohort[cohortIndex]?.data;
          const line = attendanceLine(summary);
          const rate = summary?.attendance_rate != null ? Number(summary.attendance_rate) : null;
          const states = (step?.courses || []).map((course: any) => courseState(course, groupFor(course.id)));
          const anyPercent = states.some((state: CourseState) => state.kind === "in-progress" || state.kind === "not-started" || state.kind === "complete");
          return (
            <section key={cohort.id} aria-labelledby={`progress-${cohort.id}`} className="space-y-5 rounded-xl border border-sl-line bg-sl-surface px-5 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`progress-${cohort.id}`} className="text-xl font-semibold text-sl-ink">{cohort.name}</h2>
                {step && <p className="text-sm text-sl-muted">Step {current + 1} of {steps.length} · {step.name}</p>}
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-sl-ink">Courses</h3>
                {!step ? (
                  <p className="text-[15px] text-sl-muted">No steps in this cohort yet.</p>
                ) : step.courses.length === 0 ? (
                  <>
                    <p className="text-[15px] text-sl-ink">{step.name} · no course yet</p>
                    <p className="text-[13px] text-sl-muted">Courses appear here once your Admin places one on this step.</p>
                  </>
                ) : (
                  <>
                    <ul className="divide-y divide-sl-line rounded-lg border border-sl-line">
                      {step.courses.map((course: any, index: number) => (
                        <li key={course.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                          <span className="text-[15px] text-sl-ink">{course.name}</span>
                          {courseChip(states[index], "progress")}
                        </li>
                      ))}
                    </ul>
                    {!anyPercent || states.every((state: CourseState) => state.kind === "no-modules" || state.kind === "no-files") ? (
                      <p className="text-[13px] text-sl-muted">A course shows a percentage once it has lesson files. None does yet.</p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-sl-ink">Attendance</h3>
                {line ? (
                  <p className="flex flex-wrap items-center gap-2 text-[15px] text-sl-ink">
                    {line}
                    {rate !== null && <Chip tone={rate >= 80 ? "done" : "attention"}>{rate}%</Chip>}
                  </p>
                ) : (
                  <p className="text-[15px] text-sl-muted">No attendance marked yet</p>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-sl-ink">Medals <span className="font-normal text-sl-muted">· {earned} of {medals.length || 7}</span></h3>
                {medals.length === 0 || (earned === 0 && cohortIndex > 0) ? (
                  <p className="text-[15px] text-sl-muted">None earned here yet. The same seven medals, earned the same way as above.</p>
                ) : (
                  <CohortMedals medals={medals} showCount={false} />
                )}
              </div>
            </section>
          );
        })}
        </div>

        {path && (
          <section aria-labelledby="path-heading" className="space-y-3 rounded-xl border border-sl-line bg-sl-surface px-5 py-5" data-testid="card-teacher-path">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="path-heading" className="text-lg font-semibold text-sl-ink">Academy path</h2>
              <p className="text-[15px] font-semibold text-sl-ink">{path.cohortsCompleted} of {path.cohortsRequired} cohorts finished</p>
            </div>
            <div className="flex gap-2" aria-hidden="true">
              {Array.from({ length: path.cohortsRequired }).map((_, index) => (
                <span key={index} className={`h-2 flex-1 rounded-full ${index < path.cohortsCompleted ? "bg-sl-done" : "bg-sl-neutral-soft"}`} />
              ))}
            </div>
            <p className="text-[15px] text-sl-muted">
              {path.done
                ? `You have finished the ${path.cohortsRequired} cohorts this academy asks for. Your Admin issues the Fellowship certificate.`
                : `You finish the academy path after ${path.cohortsRequired} cohorts. Your Admin then issues the Fellowship certificate.`}
            </p>
          </section>
        )}

        <Panel title="Your figures" id="progress-figures" sub="From your quizzes, modules and reflections">
          <dl className="grid grid-cols-2 gap-px bg-sl-line sm:grid-cols-5">
            {[
              { label: "Level", value: reportCard?.level || "Beginner", testId: "text-level" },
              { label: "Quizzes taken", value: String(reportCard?.totalQuizzesTaken || 0), testId: "text-quizzes-taken" },
              { label: "Average score", value: `${reportCard?.averageScore || 0}%`, testId: "text-average-score" },
              { label: "Modules", value: String(assignedWeeks.length) },
              { label: "Reflections", value: String(reflections.length) },
            ].map((figure) => (
              <div key={figure.label} className="bg-sl-surface px-4 py-3">
                <dt className="text-xs text-sl-muted">{figure.label}</dt>
                <dd className="text-lg font-semibold text-sl-ink" data-testid={figure.testId}>{figure.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {progressSummary && (
          <Panel title="Progress toward graduation" id="progress-graduation" sub="Your overall training completion and graduation probability">
            <div className="space-y-3 px-5 py-4">
              <p className="flex flex-wrap items-center gap-3 text-[15px] text-sl-ink">
                <span className="text-3xl font-semibold">{progressSummary.graduationProbability}%</span>
                <Chip tone={progressSummary.graduationProbability >= 80 ? "done" : progressSummary.graduationProbability >= 60 ? "attention" : "risk"}>Graduation probability</Chip>
              </p>
              <div className="h-2 rounded-full bg-sl-neutral-soft" role="progressbar" aria-valuenow={progressSummary.graduationProbability} aria-valuemin={0} aria-valuemax={100} aria-label="Graduation probability">
                <div className="h-2 rounded-full bg-sl-accent-strong" style={{ width: `${Math.min(100, progressSummary.graduationProbability)}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <p><span className="block font-semibold text-sl-ink">{progressSummary.contentCompletion}%</span><span className="text-sl-muted">Content</span></p>
                <p><span className="block font-semibold text-sl-ink">{progressSummary.quizPassRate}%</span><span className="text-sl-muted">Quiz pass rate</span></p>
                <p><span className="block font-semibold text-sl-ink">{progressSummary.reflectionCount}</span><span className="text-sl-muted">Reflections</span></p>
              </div>
            </div>
          </Panel>
        )}

        {skills.length > 0 && (
          <Panel title="Skills map" id="progress-skills" sub="Coverage from each module's competency focus">
            <ul className="space-y-3 px-5 py-4">
              {skills.map((skill: any) => (
                <li key={skill.competency} className="space-y-1">
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-sl-ink">{skill.competency}</span>
                    <span className="text-sl-muted">{skill.completed}/{skill.modules} · {skill.coverage}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-sl-neutral-soft" role="progressbar" aria-valuenow={skill.coverage || 0} aria-valuemin={0} aria-valuemax={100} aria-label={skill.competency}>
                    <div className="h-2 rounded-full bg-sl-accent-strong" style={{ width: `${Math.min(100, skill.coverage || 0)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );

  // ── Reflect ──────────────────────────────────────────────────────────────────────────────────────────────────

  const reflectView = (
    <>
      <PageHeading title="Reflect" sub="Set your own goals and say how each course went." />
      <p className="rounded-xl border border-sl-line bg-sl-surface px-4 py-3 text-sm text-sl-neutral">
        Your trainer does not see reflections; the academy reads them to improve courses.
      </p>

      <Panel title="Your goals" id="reflect-goals" testId="card-reflect-goals">
        {goals.length === 0 ? (
          <Empty title="No goals yet." body="Goals you add appear here with their target dates." />
        ) : (
          <div className="px-5 py-4">
            <ul className="space-y-2">
              {goalPager.slice.map((goal: any) => (
                <GoalRow
                  key={goal.id}
                  goal={goal}
                  onStatus={(status) => updateGoalMutation.mutate({ id: goal.id, status })}
                  onRemove={() => deleteGoalMutation.mutate(goal.id)}
                />
              ))}
            </ul>
            <PageStrip page={goalPager.page} pages={goalPager.pages} setPage={goalPager.setPage} />
          </div>
        )}
        <form
          className="space-y-3 border-t border-sl-line px-5 py-4"
          aria-labelledby="add-goal"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newGoalText.trim()) return;
            createGoalMutation.mutate({ goalText: newGoalText, ...(newGoalDate ? { dueDate: newGoalDate } : {}) });
          }}
        >
          <h3 id="add-goal" className="text-base font-semibold text-sl-ink">Add a goal</h3>
          <div className="space-y-1.5">
            <label htmlFor="goal-text" className="text-sm font-medium text-sl-ink">Goal</label>
            <textarea id="goal-text" rows={3} className={FIELD} value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)} placeholder="What do you want to achieve?" />
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5">
              <label htmlFor="goal-date" className="text-sm font-medium text-sl-ink">Target date</label>
              <input id="goal-date" type="date" className={`${FIELD} min-h-[44px]`} value={newGoalDate} onChange={(e) => setNewGoalDate(e.target.value)} />
            </div>
            <button type="submit" className={BTN_PRIMARY} disabled={createGoalMutation.isPending || !newGoalText.trim()}>Save goal</button>
          </div>
        </form>
      </Panel>

      <Panel title="Course reflection" id="reflect-course">
        <form
          className="space-y-4 px-5 py-4"
          aria-labelledby="reflect-course-heading"
          onSubmit={(event) => {
            event.preventDefault();
            if (!reflectionWeekId || !reflectionContent.trim()) {
              toast({ title: "Error", description: "Please select a module and write your reflection", variant: "destructive" });
              return;
            }
            submitReflectionMutation.mutate({
              weekId: reflectionWeekId,
              batchId: reflectionBatchId,
              content: reflectionContent,
              rating: reflectionRating || null,
            });
          }}
        >
          {assignedWeeks.length > 0 && (
            <div className="max-w-md space-y-1.5">
              <label htmlFor="reflect-module" className="text-sm font-medium text-sl-ink">Course and module</label>
              <select
                id="reflect-module"
                className={`${FIELD} min-h-[44px]`}
                value={reflectionWeekId}
                onChange={(e) => {
                  setReflectionWeekId(e.target.value);
                  const week = assignedWeeks.find((w: any) => w.id === e.target.value);
                  if (week?.batchId) setReflectionBatchId(week.batchId);
                }}
              >
                <option value="">Choose a module to reflect on…</option>
                {assignedWeeks.map((week: any) => (
                  <option key={week.id} value={week.id}>{week.courseName || week.title} - Module {week.weekNumber}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="reflect-text" className="text-sm font-medium text-sl-ink">What worked, what you will change</label>
            <textarea id="reflect-text" rows={5} className={FIELD} value={reflectionContent} onChange={(e) => setReflectionContent(e.target.value)} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-sl-ink">How useful was this course? <span className="font-normal text-sl-muted">(optional)</span></legend>
            <ScaleRadios name="reflection-rating" value={reflectionRating} onChange={setReflectionRating} low="Not useful" high="Very useful" />
          </fieldset>
          <div className="flex justify-end">
            <button type="submit" className={BTN_PRIMARY} disabled={submitReflectionMutation.isPending}>
              {submitReflectionMutation.isPending ? "Saving…" : "Save reflection"}
            </button>
          </div>
        </form>
        {reflections.length > 0 && (
          <div className="border-t border-sl-line px-5 py-4">
            <h3 className="mb-2 text-base font-semibold text-sl-ink">Previous reflections</h3>
            <ul className="space-y-2">
              {reflectionPager.slice.map((r: any) => (
                <li key={r.id} className="rounded-lg border border-sl-line px-4 py-3">
                  <p className="mb-1 flex items-center justify-between text-xs text-sl-muted">
                    {r.rating ? <Chip>{r.rating}/5 useful</Chip> : <span />}
                    <span>{r.submittedAt ? fmtDay(r.submittedAt) : ""}</span>
                  </p>
                  <p className="text-[15px] text-sl-ink">{r.content}</p>
                </li>
              ))}
            </ul>
            <PageStrip page={reflectionPager.page} pages={reflectionPager.pages} setPage={reflectionPager.setPage} />
          </div>
        )}
      </Panel>

      {uniqueCourses.length > 0 && (
        <Panel title="Rate a course" id="reflect-rate" sub="Help the academy improve by rating a course you have taken">
          <form
            className="space-y-4 px-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!satisfactionCourseId || !satisfactionScore) {
                toast({ title: "Error", description: "Please select a course and give a rating", variant: "destructive" });
                return;
              }
              submitSatisfactionMutation.mutate({
                type: "fellow_rates_course",
                raterId: teacher?.id,
                raterRole: "teacher",
                targetId: satisfactionCourseId,
                targetType: "course",
                score: satisfactionScore,
              });
            }}
          >
            <div className="max-w-md space-y-1.5">
              <label htmlFor="rate-course" className="text-sm font-medium text-sl-ink">Course</label>
              <select id="rate-course" className={`${FIELD} min-h-[44px]`} value={satisfactionCourseId} onChange={(e) => setSatisfactionCourseId(e.target.value)}>
                <option value="">Choose a course to rate…</option>
                {uniqueCourses.map((course: any) => (
                  <option key={course.courseName} value={course.courseName}>{course.courseName}</option>
                ))}
              </select>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-sl-ink">Your rating</legend>
              <ScaleRadios name="course-rating" value={satisfactionScore} onChange={setSatisfactionScore} low="Poor" high="Excellent" />
            </fieldset>
            <div className="flex justify-end">
              <button type="submit" className={BTN_PRIMARY} disabled={submitSatisfactionMutation.isPending}>
                {submitSatisfactionMutation.isPending ? "Saving…" : "Save rating"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel title="Feedback to the academy" id="reflect-feedback" testId="card-feedback" sub="Tell the academy how your learning is going. This is not a quiz and not written work.">
        <div className="space-y-3 px-5 py-4">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-sl-ink">How is it going?</legend>
            <ScaleRadios name="feedback-score" value={feedbackScore} onChange={setFeedbackScore} low="Poorly" high="Very well" testId={(n) => `button-feedback-score-${n}`} />
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor="feedback-text" className="text-sm font-medium text-sl-ink">What should we keep, and what should change?</label>
            <textarea id="feedback-text" rows={4} className={FIELD} value={feedbackNote} onChange={(event) => setFeedbackNote(event.target.value)} data-testid="input-feedback" />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={feedbackScore < 1 || !feedbackNote.trim() || sendFeedback.isPending}
              onClick={() => sendFeedback.mutate()}
              data-testid="button-send-feedback"
            >
              {sendFeedback.isPending ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </div>
      </Panel>

      {tips.length > 0 && (
        <Panel title="Tips for you" id="reflect-tips" sub="Suggestions based on your attendance, quizzes and reflections">
          <ul className="divide-y divide-sl-line">
            {tips.map((tip: any, i: number) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <Chip tone={tip.priority === "high" ? "attention" : "neutral"}>{tip.priority}</Chip>
                <p className="text-[15px] text-sl-ink">{tip.text}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );

  // ── Messages ─────────────────────────────────────────────────────────────────────────────────────────────────

  const peers = deskPeers.map((peer: any) => ({ id: peer.id as string, name: peer.name as string, role: (peer.role || "trainer") as string }));
  const activePeer = peers.find((peer) => peer.id === deskPeerId) || peers[0] || null;

  const messagesView = (
    <>
      <PageHeading title="Messages" sub="Desk mail with your trainers, their feedback, and notes from the academy." />
      <Panel title="Desk mail with your trainer" id="desk-mail-panel" sub="Private: only you and that trainer read a thread.">
        <div className="flex flex-wrap">
          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1 border-sl-line px-5 py-4 md:border-r">
            <h3 className="mb-1 text-[15px] font-semibold text-sl-ink">Threads</h3>
            {peers.length === 0 ? (
              <>
                <p className="text-[15px] font-medium text-sl-ink">No threads yet.</p>
                <p className="text-sm text-sl-muted">Each trainer you write to gets one thread here.</p>
              </>
            ) : (
              <ul className="space-y-1">
                {peers.map((peer) => (
                  <li key={peer.id}>
                    <button
                      type="button"
                      aria-current={peer.id === activePeer?.id ? "true" : undefined}
                      onClick={() => setDeskPeerId(peer.id)}
                      className={`flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-[15px] ${peer.id === activePeer?.id ? "bg-sl-accent-soft font-semibold text-sl-accent" : "text-sl-ink hover:bg-sl-neutral-soft"}`}
                    >
                      {peer.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0 flex-[2_1_380px] space-y-3 px-5 py-4">
            <h3 className="text-[15px] font-semibold text-sl-ink">New message</h3>
            {peers.length > 0 && (
              <div className="max-w-sm space-y-1.5">
                <label htmlFor="desk-to" className="text-sm font-medium text-sl-ink">To</label>
                <select id="desk-to" className={`${FIELD} min-h-[44px]`} value={activePeer?.id || ""} onChange={(e) => setDeskPeerId(e.target.value)}>
                  {peers.map((peer) => (
                    <option key={peer.id} value={peer.id}>{peer.name}</option>
                  ))}
                </select>
              </div>
            )}
            <DeskMail peer={activePeer} selfLabel={teacher?.name || "Fellow"} bare />
          </div>
        </div>
      </Panel>

      <Panel title="Trainer feedback" id="trainer-feedback" sub="Comments your trainers leave on your progress. Read only.">
        {trainerComments.length === 0 ? (
          <Empty title="No feedback yet." body="Feedback appears here marked Progress, Improvement or General." />
        ) : (
          <div className="px-5 py-4">
            <ul className="space-y-2">
              {commentPager.slice.map((comment: any) => (
                <li key={comment.id} className="rounded-lg border border-sl-line px-4 py-3">
                  <p className="mb-1 flex items-center justify-between gap-2 text-xs text-sl-muted">
                    {comment.category ? <Chip>{String(comment.category).charAt(0).toUpperCase() + String(comment.category).slice(1)}</Chip> : <span />}
                    <span>{comment.createdAt ? fmtDay(comment.createdAt) : ""}</span>
                  </p>
                  <p className="text-[15px] text-sl-ink">{comment.comment}</p>
                </li>
              ))}
            </ul>
            <PageStrip page={commentPager.page} pages={commentPager.pages} setPage={commentPager.setPage} />
          </div>
        )}
      </Panel>

      <Panel title="From the academy" id="academy-notices" sub="Academy notices from your Admin and cohort notes from your trainers. Read only.">
        {deskNotices.length === 0 ? (
          <Empty title="Nothing yet." body={`Notices for every Fellow and notes to ${cohortNames || "your cohorts"} appear here, newest first.`} />
        ) : (
          <div className="px-5 py-4">
            <ul className="space-y-2">
              {noticePager.slice.map((note: any) => (
                <li key={note.id} className="rounded-lg border border-sl-line px-4 py-3">
                  <p className="text-[15px] font-medium text-sl-ink">{note.title}</p>
                  <p className="text-sm text-sl-muted">{note.message}</p>
                </li>
              ))}
            </ul>
            <PageStrip page={noticePager.page} pages={noticePager.pages} setPage={noticePager.setPage} />
          </div>
        )}
      </Panel>
    </>
  );

  return (
    <AcademyShell
      title="Silverleaf Academy"
      subtitle="Fellow desk"
      userLabel={teacher ? `${teacher.name} (Fellow ID: ${teacher.teacherId})` : undefined}
      onLogout={() => logoutMutation.mutate()}
      desk="fellow"
      current={tab}
      onNavigate={(key) => {
        if ((FELLOW_TABS as readonly string[]).includes(key)) {
          setTab(key as FellowTab);
          window.scrollTo({ top: 0 });
        }
      }}
      actions={
        <>
          <TourButton onClick={tour.replay} testId="button-teacher-tour" tone="light" />
          <ProfileSettingsDialog
            userType="teacher"
            currentEmail={teacher?.email}
            trigger={
              <Button
                variant="secondary"
                size="sm"
                data-testid="button-profile-settings"
                className="bg-transparent text-sl-ink border-sl-control hover:bg-sl-neutral-soft"
              >
                <Settings className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Settings</span>
              </Button>
            }
          />
        </>
      }
    >
      <div className="space-y-6" data-testid="fellow-desk">
        {tab === "home" && home}
        {tab === "learning" && learningView}
        {tab === "work" && workView}
        {tab === "quizzes" && quizzesView}
        {tab === "progress" && progressView}
        {tab === "reflect" && reflectView}
        {tab === "messages" && messagesView}
      </div>
      <GuidedTour
        open={tour.open}
        steps={TEACHER_TOUR}
        index={tour.index}
        onIndex={tour.setIndex}
        onClose={tour.close}
      />
    </AcademyShell>
  );
}
