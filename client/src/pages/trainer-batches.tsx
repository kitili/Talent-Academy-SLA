import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useQueries, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loading, SkeletonBar, SkeletonCard, SkeletonFigures, SkeletonRows } from "@/components/Skeletons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { QuizEditDialog } from "@/components/QuizEditDialog";
import { FileQuizEditDialog } from "@/components/FileQuizEditDialog";
import { AcademyShell } from "@/components/AcademyShell";
import { DESK_MENUS } from "@/components/deskMenu";
import { canRunOnlineSessions, audienceLabel } from "@shared/academyPeople";
import { Users, Plus, Trash2, FileText, X, CheckCircle, Upload, ChevronLeft, ChevronRight, MoreHorizontal, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { CohortMedals } from "@/components/CohortMedals";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import { TRAINER_TOUR } from "@shared/guidedTour";
import { learningStatus } from "@shared/learningStatus";
import { isWritingExam } from "@shared/trainerDesk";
import { deadlineLocalValue } from "@shared/academyPath";
import { filterByQuery } from "@/components/PageStrip";
import { TrainerMessages } from "@/components/TrainerMessages";
import { deskName } from "@shared/deskName";

/** The desk's sections, in the order of its side menu (components/deskMenu.ts). `?tab=` names one of them. */
type SectionKey = "home" | "cohorts" | "assessments" | "progress" | "attendance" | "messages" | "schedule";
// Fellows and Calendar are pages of their own (/trainer/fellows, /calendar); this page draws the other sections.
const SECTION_KEYS = DESK_MENUS.trainer.map((item) => item.key).filter((key) => key !== "fellows" && key !== "calendar") as SectionKey[];

/** The section a `?tab=` names. The old name for Home was "desk"; links that still carry it land on Home. */
function sectionFromSearch(search: string): SectionKey {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "desk") return "home";
  return SECTION_KEYS.find((key) => key === tab) ?? "home";
}

const PRIMARY_BUTTON = "min-h-11 bg-sl-accent-strong text-white hover:bg-sl-accent-strong/90";
const SECONDARY_BUTTON = "min-h-11 border-sl-control bg-sl-surface text-sl-ink hover:bg-sl-neutral-soft";
const FIELD = "min-h-11 w-full rounded-lg border border-sl-control bg-sl-surface px-3 text-sm text-sl-ink";
/** One empty list for an editor that has not loaded yet, so its reset effect does not run on every render. */
const NO_QUESTIONS: any[] = [];
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";

type Tone = "risk" | "attention" | "done" | "neutral" | "accent";
const CHIP_TONE: Record<Tone, string> = {
  risk: "bg-sl-risk-soft text-sl-risk",
  attention: "bg-sl-attention-soft text-sl-attention",
  done: "bg-sl-done-soft text-sl-done",
  neutral: "bg-sl-neutral-soft text-sl-neutral",
  accent: "bg-sl-accent-soft text-sl-accent",
};

function Chip({ tone = "neutral", children, testId }: { tone?: Tone; children: ReactNode; testId?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_TONE[tone]}`} data-testid={testId}>
      {children}
    </span>
  );
}

/** A course status as a chip, by what it means: done, started, failed or not yet. */
function statusTone(status: string): Tone {
  if (status === "Completed" || status === "Passed") return "done";
  if (status === "In Progress") return "accent";
  if (status === "Failed") return "risk";
  return "neutral";
}

function PageHead({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{title}</h1>
        {sub && <div className="mt-1 text-sm text-sl-muted">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Panel({ title, sub, action, children, testId, titleSuffix }: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  testId?: string;
  titleSuffix?: ReactNode;
}) {
  return (
    <section className={`${PANEL} p-5`} data-testid={testId} aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-sl-ink">
            {title}
            {titleSuffix !== undefined && <span className="font-normal text-sl-muted"> · {titleSuffix}</span>}
          </h2>
          {sub && <div className="mt-1 text-sm text-sl-muted">{sub}</div>}
        </div>
        {action && <div className="flex flex-wrap gap-2">{action}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Grey bars for a few lines of text that have not arrived. */
function Bars({ rows = 2, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <Loading label={label} className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => <SkeletonBar key={index} className="h-4 w-full max-w-lg" />)}
    </Loading>
  );
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const dayKey = (value: Date) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;

/** A local date and time from a form field, as the time the server stores. */
function deadlineIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function DeadlineField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Deadline</Label>
      <Input id={id} type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} data-testid={`input-${id}`} />
      <p className="text-xs text-sl-muted">Optional. Fellows see this date beside the work.</p>
    </div>
  );
}

function dueLabel(value?: string | null) {
  return value ? `Due ${new Date(value).toLocaleString()}` : "No deadline";
}

function WorkDeadlineEditor({
  current,
  onSave,
  pending,
  testId,
}: {
  current?: string | null;
  onSave: (iso: string | null) => void;
  pending?: boolean;
  testId: string;
}) {
  const [draft, setDraft] = useState(() => deadlineLocalValue(current));
  useEffect(() => {
    setDraft(deadlineLocalValue(current));
  }, [current]);
  return (
    <div className="flex flex-wrap items-end gap-2 pt-2" onClick={(event) => event.stopPropagation()}>
      <div className="min-w-[12rem] flex-1">
        <DeadlineField id={testId} value={draft} onChange={setDraft} />
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => onSave(deadlineIso(draft) || null)}
        data-testid={`button-save-${testId}`}
      >
        Save deadline
      </Button>
    </div>
  );
}

function TeacherAudience({
  teachers,
  selected,
  onChange,
  deadline,
  onDeadline,
  loading = false,
}: {
  teachers: Array<{ id: string; name?: string; email?: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  deadline?: string;
  onDeadline?: (value: string) => void;
  loading?: boolean;
}) {
  return (
    <>
    <div className="space-y-2" data-testid="quiz-audience">
      <Label>Who sits this</Label>
      <p className="text-xs text-sl-muted">Tick Fellows to assign it only to them. Leave every box empty to give it to the whole cohort.</p>
      {loading ? (
        <Bars rows={2} label="Loading Fellows" />
      ) : teachers.length === 0 ? (
        <p className="text-xs text-sl-muted" data-testid="quiz-audience-empty">
          No Fellows are in this cohort yet. <a className="font-semibold text-sl-accent underline" href="/trainer/fellows">Register a Fellow</a> and choose this cohort.
        </p>
      ) : (
        <div className="max-h-36 space-y-2 overflow-y-auto">
          {teachers.map((teacher) => (
            <label key={teacher.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(teacher.id)}
                onCheckedChange={(checked) => {
                  onChange(checked ? [...selected, teacher.id] : selected.filter((id) => id !== teacher.id));
                }}
                data-testid={`check-quiz-teacher-${teacher.id}`}
              />
              {teacher.name || teacher.email || "Fellow"}
            </label>
          ))}
        </div>
      )}
    </div>
    {onDeadline && <DeadlineField id="quiz-deadline" value={deadline || ""} onChange={onDeadline} />}
    </>
  );
}

/** The work a Trainer gave one cohort on the Fellow Work page, with its deadline. Nothing shows when there is none. */
function AssessmentDesk({ batchId, cohortName }: { batchId: string; cohortName: string }) {
  const { toast } = useToast();
  const { data: assignments = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "assignments"],
  });
  const assessments = assignments.filter((item: any) => item.kind === "assessment");
  const saveDue = useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string | null }) => {
      const res = await apiRequest("PATCH", `/api/batches/${batchId}/assignments/${id}`, { dueDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments"] });
      toast({ title: "Deadline saved" });
    },
    onError: (error: Error) => toast({ title: "Could not save the deadline", description: error.message, variant: "destructive" }),
  });
  if (assessments.length === 0) return null;
  return (
    <>
      {assessments.map((item: any) => (
        <div key={item.id} className="rounded-lg border border-sl-line p-4">
          <p className="font-semibold text-sl-ink">{item.title}</p>
          <p className="text-sm text-sl-muted">{cohortName} · Fellows open it on Work · {item.dueDate ? `Due ${new Date(item.dueDate).toLocaleString()}` : "No due date"}</p>
          <p className="text-sm text-sl-muted" data-testid={`assessment-given-to-${item.id}`}>Given to {audienceLabel(item.audience)}</p>
          {item.instructions && <p className="mt-1 text-sm text-sl-muted">{item.instructions}</p>}
          <a
            className="mt-2 inline-block text-sm font-semibold text-sl-accent underline"
            href={`/cohorts/${batchId}?tab=work&work=${item.id}`}
            data-testid={`link-mark-${item.id}`}
          >
            Mark submissions
          </a>
          <WorkDeadlineEditor
            current={item.dueDate}
            pending={saveDue.isPending}
            testId={`assignment-deadline-${item.id}`}
            onSave={(dueDate) => saveDue.mutate({ id: item.id, dueDate })}
          />
        </div>
      ))}
    </>
  );
}

export default function TrainerBatches() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const tour = useGuidedTour("sla-tour-trainer-v1");
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [assignCheckpointQuizOpen, setAssignCheckpointQuizOpen] = useState(false);
  const [assignFileQuizOpen, setAssignFileQuizOpen] = useState(false);
  const [viewQuizDetailsOpen, setViewQuizDetailsOpen] = useState(false);
  const [viewTeacherAttemptsOpen, setViewTeacherAttemptsOpen] = useState(false);
  const [editQuizOpen, setEditQuizOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<any>(null);
  const [quizAttemptsOpen, setQuizAttemptsOpen] = useState(false);
  const [selectedQuizForAttempts, setSelectedQuizForAttempts] = useState<any>(null);
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  // The section is the URL's `?tab=`: a menu click, a link from another page and a reload all land on the same place.
  const section = sectionFromSearch(useSearch());
  const goTo = (key: SectionKey) => setLocation(`/trainer/batches?tab=${key}`);
  const [reviewQuiz, setReviewQuiz] = useState<any>(null);
  const [showAllNeeds, setShowAllNeeds] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [eventBatchId, setEventBatchId] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [deadline, setDeadline] = useState("");

  const [teacherId, setTeacherId] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [numQuestions, setNumQuestions] = useState("5");
  const [ownQuestion, setOwnQuestion] = useState("");
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [disqualifyDialogOpen, setDisqualifyDialogOpen] = useState(false);
  const [commentTeacher, setCommentTeacher] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [commentCategory, setCommentCategory] = useState("general");
  const [disqualifyTeacher, setDisqualifyTeacher] = useState<any>(null);
  const [disqualifyReason, setDisqualifyReason] = useState("");

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceRecordsState, setAttendanceRecordsState] = useState<Record<string, string>>({});
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);

  // Schedule / event state
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventType, setNewEventType] = useState("session");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newMeetingUrl, setNewMeetingUrl] = useState("");
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newMaterialsUrl, setNewMaterialsUrl] = useState("");
  const [listQuery, setListQuery] = useState("");
  const [passMark, setPassMark] = useState("80");
  const [quizTeacherIds, setQuizTeacherIds] = useState<string[]>([]);
  const [paperFile, setPaperFile] = useState<File | null>(null);
  const [writeExamOpen, setWriteExamOpen] = useState(false);
  const [uploadExamOpen, setUploadExamOpen] = useState(false);
  const [examPrompt, setExamPrompt] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskKind, setTaskKind] = useState<"assessment">("assessment");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNote, setTaskNote] = useState("");
  const [taskFile, setTaskFile] = useState<File | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });
  const { data: desk, isError: deskError, isLoading: deskLoading } = useQuery<any>({
    queryKey: ["/api/trainer/desk"],
  });
  const filteredBatches = filterByQuery(batches, listQuery, (batch) => `${batch.name || ""}`);

  // Every section works on one cohort at a time; the first is open until the Trainer picks another.
  useEffect(() => {
    if (!selectedBatch && batches[0]) setSelectedBatch(batches[0]);
  }, [batches, selectedBatch]);
  const chooseBatch = (id: string) => {
    const next = batches.find((batch: any) => batch.id === id);
    if (!next || next.id === selectedBatch?.id) return;
    setSelectedBatch(next);
    setExpandedTeacherId(null);
    // Names ticked for one cohort's work must not travel to another cohort.
    setQuizTeacherIds([]);
    // Marks pick the Fellows of one cohort; they must not travel to another.
    setAttendanceRecordsState({});
  };

  const { data: weeks = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks"],
  });

  // Fetch batch details including teachers
  const { data: batchDetails, isLoading: detailsLoading } = useQuery<any>({
    queryKey: ["/api/batches", selectedBatch?.id],
    enabled: !!selectedBatch?.id,
  });
  const { data: selectedBatchCourses = [], isLoading: coursesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "courses"],
    enabled: !!selectedBatch?.id,
  });


  // Fetch progress for selected batch - auto-loads and refreshes every 30 seconds
  const { data: batchProgress = [], isLoading: isLoadingProgress } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "progress"],
    enabled: !!selectedBatch?.id,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true, // Refresh when window regains focus
  });

  // Fetch files for selected week (for file quiz generation)
  const { data: weekFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks", selectedWeek, "deck-files"],
    enabled: !!selectedWeek && assignFileQuizOpen,
  });

  // Fetch quiz details for viewing
  const { data: quizDetails } = useQuery<any>({
    queryKey: ["/api/trainer/quizzes", selectedQuizId],
    enabled: !!selectedQuizId && viewQuizDetailsOpen,
  });

  // Fetch pending open-ended reviews
  const { data: pendingReviews = [], isLoading: reviewsLoading } = useQuery<any[]>({
    queryKey: ["/api/trainer/pending-reviews"],
    enabled: !!selectedBatch,
  });

  // Fetch teacher quiz attempts
  const { data: teacherAttempts = [], isLoading: teacherAttemptsLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "teachers", selectedTeacher?.id, "quiz-attempts"],
    enabled: !!selectedBatch?.id && !!selectedTeacher?.id && viewTeacherAttemptsOpen,
  });

  // Fetch all teacher attempts for a specific quiz (to show who needs reset)
  const { data: quizTeacherAttempts = [], refetch: refetchQuizAttempts, isLoading: quizAttemptsLoading } = useQuery<any[]>({
    queryKey: ["/api/assigned-quizzes", selectedQuizForAttempts?.id, "all-attempts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assigned-quizzes/${selectedQuizForAttempts?.id}/all-teacher-attempts`);
      return res.json();
    },
    enabled: !!selectedQuizForAttempts?.id && quizAttemptsOpen,
  });

  // Fetch batch attendance summary (per teacher)
  const { data: batchAttendanceSummary = [], refetch: refetchAttendance, isLoading: summaryLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "attendance", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/attendance/summary`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && section === "attendance",
  });

  // Fetch batch attendance by date
  const { data: dailyAttendance = [], isLoading: dailyLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "attendance", attendanceDate],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/attendance?date=${attendanceDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && section === "attendance",
  });

  // Every mark of the cohort, newest first on the Attendance page
  const { data: recentMarks = [], isLoading: marksLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "attendance", "recent"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/attendance`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && section === "attendance",
  });

  // What the Home, Assessments and Schedule pages read across every cohort on the desk
  const cohortIds: string[] = batches.map((batch: any) => batch.id);
  const onHome = section === "home";
  const eventQueries = useQueries({
    queries: cohortIds.map((id) => ({
      queryKey: ["/api/batches", id, "events"],
      queryFn: async () => {
        const res = await fetch(`/api/batches/${id}/events`);
        if (!res.ok) return [];
        return res.json();
      },
      enabled: onHome || section === "schedule",
    })),
  });
  const quizQueries = useQueries({
    queries: cohortIds.map((id) => ({
      queryKey: ["/api/batches", id, "quizzes"],
      enabled: section === "assessments",
    })),
  });
  const fileQuizQueries = useQueries({
    queries: cohortIds.map((id) => ({
      queryKey: ["/api/batches", id, "file-quizzes"],
      queryFn: async () => {
        const res = await fetch(`/api/batches/${id}/file-quizzes`);
        if (!res.ok) return [];
        return res.json();
      },
      enabled: onHome || section === "assessments",
    })),
  });
  // The work given to each cohort on the Fellow Work page; AssessmentDesk reads the same answers, this one says when they are in.
  const assignmentQueries = useQueries({
    queries: cohortIds.map((id) => ({
      queryKey: ["/api/batches", id, "assignments"],
      enabled: section === "assessments",
    })),
  });
  const courseQueries = useQueries({
    queries: cohortIds.map((id) => ({
      queryKey: ["/api/batches", id, "courses"],
      enabled: onHome,
    })),
  });
  const progressQueries = useQueries({
    queries: batches.map((batch: any) => ({
      queryKey: ["/api/batches", batch.id, "progress"],
      enabled: onHome && Number(batch.teacherCount || 0) > 0,
    })),
  });
  const { data: pendingFellows = [], isLoading: pendingFellowsLoading } = useQuery<any[]>({
    queryKey: ["/api/trainer/pending-teachers"],
    enabled: onHome,
  });
  const homeCourseIds: string[] = Array.from(new Set(courseQueries.flatMap((query) => ((query.data as any[]) || []).map((course: any) => course.id))));
  const weekCourseIds: string[] = onHome ? homeCourseIds : section === "progress" ? selectedBatchCourses.map((course: any) => course.id) : [];
  const weekQueries = useQueries({
    queries: weekCourseIds.map((courseId) => ({
      queryKey: ["/api/courses", courseId, "weeks"],
    })),
  });
  const modulesByCourse: Record<string, any[]> = {};
  weekCourseIds.forEach((courseId, index) => {
    if (weekQueries[index]?.data) modulesByCourse[courseId] = weekQueries[index].data as any[];
  });
  // The quiz being reviewed, with the questions the editor opens on
  const { data: reviewQuizStatus, isLoading: isLoadingReviewQuiz } = useQuery<Record<string, any>>({
    queryKey: ["/api/training-weeks", reviewQuiz?.week_id, "quiz-status"],
    enabled: !!reviewQuiz,
    queryFn: async () => {
      const res = await fetch(`/api/training-weeks/${reviewQuiz.week_id}/quiz-status`);
      if (!res.ok) return {};
      return res.json();
    },
  });

  // Search approved teachers for bulk enrollment
  const { data: searchedTeachers = [], isLoading: searchLoading } = useQuery<any[]>({
    queryKey: ["/api/teachers/search", teacherSearch],
    queryFn: async () => {
      const url = teacherSearch.trim()
        ? `/api/teachers/search?q=${encodeURIComponent(teacherSearch.trim())}`
        : `/api/teachers/search`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: addTeacherOpen,
    placeholderData: keepPreviousData,
  });

  const addTeacherMutation = useMutation({
    mutationFn: async ({ batchId, query }: { batchId: string; query: string }) => {
      // Support ID, email, or name in a single field
      const isNumeric = /^\d+$/.test(query.trim());
      const isEmail = query.includes("@");
      const body = isNumeric
        ? { teacherId: parseInt(query) }
        : isEmail
        ? { teacherEmail: query.trim() }
        : { teacherName: query.trim() };
      const response = await apiRequest("POST", `/api/batches/${batchId}/teachers`, body);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add the Fellow");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Fellow added to the cohort" });
      posthog.capture("teacher_added_to_batch", { batchId: selectedBatch?.id });
      setTeacherId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkAddTeachersMutation = useMutation({
    mutationFn: async ({ batchId, teacherIds }: { batchId: string; teacherIds: string[] }) => {
      const response = await apiRequest("POST", `/api/batches/${batchId}/teachers/bulk`, { teacherIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: `Added ${data.added} Fellow${data.added !== 1 ? "s" : ""}${data.skipped > 0 ? `, ${data.skipped} already enrolled` : ""}` });
      setAddTeacherOpen(false);
      setSelectedTeacherIds([]);
      setTeacherSearch("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const starMutation = useMutation({
    mutationFn: async ({ teacherId, give }: { teacherId: string; give: boolean }) => {
      const path = `/api/batches/${selectedBatch?.id}/teachers/${teacherId}/star`;
      if (give) await apiRequest("POST", path, {});
      else await apiRequest("DELETE", path);
    },
    onSuccess: (_data, { give }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "progress"] });
      toast({ title: give ? "Star given" : "Star taken back" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not update the star", description: error.message, variant: "destructive" });
    },
  });

  const removeTeacherMutation = useMutation({
    mutationFn: async ({ batchId, teacherId }: { batchId: string; teacherId: string }) => {
      await apiRequest("DELETE", `/api/batches/${batchId}/teachers/${teacherId}`);
    },
    onSuccess: (_, { batchId, teacherId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Fellow removed from the cohort" });
      posthog.capture("teacher_removed_from_batch", { batchId, teacherId });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add trainer comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ teacherId, batchId, comment, category }: { teacherId: string; batchId: string; comment: string; category: string }) => {
      await apiRequest("POST", "/api/trainer/comments", { teacherId, batchId, comment, category });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Comment added successfully" });
      setCommentDialogOpen(false);
      setCommentText("");
      setCommentCategory("general");
      setCommentTeacher(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Disqualify fellow mutation
  const disqualifyMutation = useMutation({
    mutationFn: async ({ teacherId, batchId, reason }: { teacherId: string; batchId: string; reason: string }) => {
      await apiRequest("POST", `/api/fellows/${teacherId}/disqualify`, { batchId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Fellow disqualified" });
      setDisqualifyDialogOpen(false);
      setDisqualifyReason("");
      setDisqualifyTeacher(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Submit attendance for the selected date
  const submitAttendanceMutation = useMutation({
    mutationFn: async ({ batchId, date, records }: { batchId: string; date: string; records: Array<{ teacherId: string; status: string }> }) => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/attendance`, { date, records });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Attendance marked successfully" });
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "attendance"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Create scheduled event
  const createEventMutation = useMutation({
    mutationFn: async (data: { title: string; eventType: string; startDate: string; endDate?: string; description?: string; meetingUrl?: string; videoUrl?: string; materialsUrl?: string }) => {
      const res = await apiRequest("POST", `/api/batches/${eventBatchId}/events`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Added to the schedule" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", eventBatchId, "events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      setAddEventOpen(false);
      setNewEventTitle(""); setNewEventType("session"); setNewEventStart(""); setNewEventEnd(""); setNewEventDesc("");
      setNewMeetingUrl(""); setNewVideoUrl(""); setNewMaterialsUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/timetable"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/events"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete event
  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "/api/batches" && query.queryKey[2] === "events" });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      toast({ title: "Deleted", description: "Event removed" });
    },
  });

  const assignQuizMutation = useMutation({
    mutationFn: async (data: {
      batchId: string;
      weekId: string;
      title: string;
      description: string;
      numQuestions: number;
      passMark: number;
      questions?: Array<{ id: string; type: string; question: string; options: string[]; correctAnswer: string }>;
    }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-quiz`, {
        weekId: data.weekId,
        title: data.title,
        description: data.description,
        numQuestions: data.numQuestions,
        passMark: data.passMark,
        questions: data.questions,
        teacherIds: quizTeacherIds,
        dueDate: deadlineIso(deadline),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      toast({ title: "Success", description: "Module quiz assigned" });
      posthog.capture("quiz_assigned", { batchId: selectedBatch?.id, quizTitle, weekId: selectedWeek, type: "checkpoint_quiz" });
      setAssignCheckpointQuizOpen(false);
      setQuizTitle("");
      setQuizDescription("");
      setSelectedWeek("");
      setNumQuestions("5");
      setOwnQuestion("");
      setQuizTeacherIds([]);
      setDeadline("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const assignFileQuizMutation = useMutation({
    mutationFn: async (data: {
      batchId: string;
      weekId: string;
      fileId: string;
      title: string;
      description: string;
      numQuestions: number;
      passMark: number;
    }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-file-quiz`, {
        weekId: data.weekId,
        fileId: data.fileId,
        title: data.title,
        description: data.description,
        numQuestions: data.numQuestions,
        passMark: data.passMark,
        teacherIds: quizTeacherIds,
        dueDate: deadlineIso(deadline),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      toast({ title: "Success", description: "File quiz generated and assigned successfully" });
      posthog.capture("quiz_assigned", { batchId: selectedBatch?.id, quizTitle, weekId: selectedWeek, type: "file_quiz" });
      setAssignFileQuizOpen(false);
      setQuizTitle("");
      setQuizDescription("");
      setSelectedWeek("");
      setSelectedFileId("");
      setNumQuestions("5");
      setQuizTeacherIds([]);
      setDeadline("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearExamForm = () => {
    setQuizTitle("");
    setQuizDescription("");
    setExamPrompt("");
    setQuizTeacherIds([]);
    setDeadline("");
    setPaperFile(null);
  };

  const writeExamMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/batches/${selectedBatch?.id}/open-exam`, {
        title: quizTitle,
        description: quizDescription,
        prompt: examPrompt,
        teacherIds: quizTeacherIds,
        dueDate: deadlineIso(deadline),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      toast({ title: "Exam assigned", description: "Fellows can write it on their desk." });
      setWriteExamOpen(false);
      clearExamForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const uploadTaskMutation = useMutation({
    mutationFn: async () => {
      if (!taskTitle.trim()) throw new Error("Give the work a title");
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      if (taskFile) {
        const ticket = await apiRequest("POST", "/api/objects/upload");
        const { uploadURL } = await ticket.json();
        const put = await fetch(uploadURL, {
          method: "PUT",
          body: taskFile,
          credentials: "include",
          headers: taskFile.type ? { "Content-Type": taskFile.type } : undefined,
        });
        if (!put.ok) throw new Error("The file did not upload");
        fileUrl = uploadURL;
        fileName = taskFile.name;
      }
      const response = await apiRequest("POST", `/api/batches/${selectedBatch?.id}/assignments`, {
        title: taskTitle,
        instructions: taskNote,
        fileUrl,
        fileName,
        kind: "assessment",
        dueDate: deadlineIso(deadline),
        teacherIds: quizTeacherIds,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "assignments"] });
      toast({
        title: "Assessment uploaded",
        description: "Fellows open it on Work, not with their quizzes.",
      });
      setTaskOpen(false);
      setTaskTitle("");
      setTaskNote("");
      setTaskFile(null);
      setDeadline("");
      setQuizTeacherIds([]);
    },
    onError: (error: Error) => {
      toast({ title: "Could not upload", description: error.message, variant: "destructive" });
    },
  });

  const uploadExamMutation = useMutation({
    mutationFn: async () => {
      if (!paperFile) throw new Error("Choose the exam paper");
      const ticket = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = await ticket.json();
      const put = await fetch(uploadURL, {
        method: "PUT",
        body: paperFile,
        credentials: "include",
        headers: paperFile.type ? { "Content-Type": paperFile.type } : undefined,
      });
      if (!put.ok) throw new Error("The paper did not upload");
      const response = await apiRequest("POST", `/api/batches/${selectedBatch?.id}/paper-exam`, {
        title: quizTitle,
        description: quizDescription,
        prompt: examPrompt,
        paperUrl: uploadURL,
        paperName: paperFile.name,
        teacherIds: quizTeacherIds,
        dueDate: deadlineIso(deadline),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/desk"] });
      toast({ title: "Paper exam assigned", description: "Fellows open the paper beside their answers." });
      setUploadExamOpen(false);
      clearExamForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveQuizDeadlineMutation = useMutation({
    mutationFn: async ({ quizId, dueDate }: { quizId: string; dueDate: string | null }) => {
      const res = await apiRequest("PATCH", `/api/assigned-quizzes/${quizId}`, { dueDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      toast({ title: "Deadline saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save the deadline", description: error.message, variant: "destructive" });
    },
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: string) => {
      await apiRequest("DELETE", `/api/assigned-quizzes/${quizId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      toast({ title: "Success", description: "Quiz deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetTeacherAttemptsMutation = useMutation({
    mutationFn: async ({ quizId, teacherId }: { quizId: string; teacherId: string }) => {
      await apiRequest("POST", `/api/assigned-quizzes/${quizId}/reset-teacher/${teacherId}`);
    },
    onSuccess: () => {
      toast({ title: "Attempts reset", description: "The Fellow can now retake the quiz." });
      refetchQuizAttempts();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset attempts.", variant: "destructive" });
    },
  });

  const handleAddTeacher = () => {
    if (selectedBatch && teacherId) {
      addTeacherMutation.mutate({
        batchId: selectedBatch.id,
        query: teacherId,
      });
    }
  };

  const handleAssignCheckpointQuiz = () => {
    if (selectedBatch && selectedWeek && quizTitle) {
      const written = ownQuestion.trim();
      assignQuizMutation.mutate({
        batchId: selectedBatch.id,
        weekId: selectedWeek,
        title: quizTitle,
        description: quizDescription,
        numQuestions: parseInt(numQuestions),
        passMark: parseInt(passMark, 10) || 80,
        questions: written
          ? [{
              id: "q1",
              type: "true_false",
              question: written,
              options: ["True", "False"],
              correctAnswer: "True",
            }]
          : undefined,
      });
    }
  };

  const handleAssignFileQuiz = () => {
    if (selectedBatch && selectedWeek && selectedFileId && quizTitle) {
      assignFileQuizMutation.mutate({
        batchId: selectedBatch.id,
        weekId: selectedWeek,
        fileId: selectedFileId,
        title: quizTitle,
        description: quizDescription,
        numQuestions: parseInt(numQuestions),
        passMark: parseInt(passMark, 10) || 80,
      });
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    if (level === "Advanced") return "default";
    if (level === "Intermediate") return "secondary";
    return "outline";
  };


  // ---------- what every section reads ----------
  // The cohort the section works on is picked once the list has answered, so its own queries start a render later.
  const cohortPending = batchesLoading || (batches.length > 0 && !selectedBatch);
  const teachersLoading = cohortPending || detailsLoading;
  const progressLoading = cohortPending || isLoadingProgress;
  const teachers: any[] = batchDetails?.teachers || [];
  const today = new Date();
  const todayKey = dayKey(today);
  const stepsOf = (cohortId: string): Array<{ id: string; name: string }> =>
    desk?.cohorts?.find((cohort: any) => cohort.id === cohortId)?.batches || [];
  const progressFor = (teacherId: string) =>
    batchProgress.find((row: any) => (row.teacher?.id ?? row.teacherId) === teacherId);
  const fellowTotal = desk?.teacherCount ?? batches.reduce((sum: number, batch: any) => sum + Number(batch.teacherCount || 0), 0);
  const openMail = (cohort: any, fellowId: string) => {
    setSelectedBatch(cohort);
    setAttendanceRecordsState({});
    setExpandedTeacherId(fellowId);
    goTo("messages");
  };
  const openAddEvent = () => {
    setEventBatchId(selectedBatch?.id || batches[0]?.id || "");
    setAddEventOpen(true);
  };

  const events: any[] = eventQueries.flatMap((query, index) =>
    ((query.data as any[]) || []).map((event: any) => ({ ...event, cohortId: cohortIds[index], cohortName: batches[index]?.name || "Cohort" })));

  // A lesson quiz is one row per lesson file, even when the course sits on several cohorts.
  const fileQuizById = new Map<string, any>();
  fileQuizQueries.forEach((query, index) => {
    ((query.data as any[]) || []).forEach((row: any) => {
      const seen = fileQuizById.get(row.id);
      if (seen) seen.cohorts.push(batches[index]?.name);
      else fileQuizById.set(row.id, { ...row, cohorts: [batches[index]?.name] });
    });
  });
  const fileQuizzes = Array.from(fileQuizById.values());
  const draftQuizzes = fileQuizzes.filter((quiz) => !quiz.approved);
  const approvedFileQuizzes = fileQuizzes.filter((quiz) => quiz.approved);
  const fileQuizzesLoading = batchesLoading || fileQuizQueries.some((query) => query.isLoading);

  const draftRow = (quiz: any) => (
    <li key={quiz.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-sl-control p-4" data-testid={`draft-quiz-${quiz.id}`}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sl-ink">Quiz for {quiz.file_name || "a lesson file"}</p>
        <p className="text-sm text-sl-muted">
          {quiz.course_name} · Module {quiz.week_number} · {plural(Number(quiz.question_count || 0), "question")} · drafted by AI {quiz.created_at ? new Date(quiz.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}
        </p>
        <div className="mt-1"><Chip tone="attention">Draft · Fellows cannot see it</Chip></div>
      </div>
      <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setReviewQuiz(quiz)} data-testid={`button-edit-draft-${quiz.id}`}>Edit</Button>
      <Button className={PRIMARY_BUTTON} onClick={() => setReviewQuiz(quiz)} data-testid={`button-approve-draft-${quiz.id}`}>Review and approve</Button>
    </li>
  );

  const cohortSelect = (id: string, withCount = false) => batchesLoading ? <SkeletonBar className="h-11 w-full rounded-lg" /> : (
    <select
      id={id}
      className={FIELD}
      value={selectedBatch?.id || ""}
      onChange={(event) => chooseBatch(event.target.value)}
      data-testid={`select-${id}`}
    >
      {batches.map((batch: any) => (
        <option key={batch.id} value={batch.id}>
          {batch.name}{withCount ? ` · ${plural(Number(batch.teacherCount || 0), "Fellow")}` : ""}
        </option>
      ))}
    </select>
  );
  // A dialog that acts on a cohort says which one, and lets the Trainer change it.
  const cohortField = (id: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>Cohort</Label>
      {cohortSelect(id)}
    </div>
  );

  // ---------- Home ----------
  type Need = { key: string; chip: string; tone: Tone; title: string; detail: string; action: ReactNode };
  const needs: Need[] = [];
  if (pendingFellows.length > 0) {
    needs.push({
      key: "approvals",
      chip: "Waiting",
      tone: "attention",
      title: `${plural(pendingFellows.length, "Fellow")} waiting for approval`,
      detail: "Approve or decline them. After approval, each Fellow sets their own password.",
      action: (
        <Button asChild variant="outline" className={SECONDARY_BUTTON}>
          <Link href="/approvals" data-testid="button-trainer-approvals">Review approvals</Link>
        </Button>
      ),
    });
  }
  courseQueries.forEach((query, index) => {
    ((query.data as any[]) || []).forEach((course: any) => {
      (modulesByCourse[course.id] || []).filter((mod: any) => !(mod.deckFiles?.length)).forEach((mod: any) => {
        needs.push({
          key: `file-${cohortIds[index]}-${mod.id}`,
          chip: "No lesson file",
          tone: "attention",
          title: `${course.name}: Module ${mod.weekNumber} has no lesson file`,
          detail: `Add a lesson file, then approve its quiz. Fellows in ${batches[index]?.name} are not held up meanwhile.`,
          action: (
            <Button asChild variant="outline" className={SECONDARY_BUTTON}>
              <Link href={`/courses/${course.id}`} data-testid={`link-add-lesson-file-${mod.id}`}>Add a lesson file</Link>
            </Button>
          ),
        });
      });
    });
  });
  progressQueries.forEach((query, index) => {
    ((query.data as any[]) || []).forEach((row: any) => {
      if ((row.overallPercentage || 0) > 0 || row.inProgressCount || row.completedCount) return;
      const fellowId = row.teacher?.id ?? row.teacherId;
      needs.push({
        key: `quiet-${cohortIds[index]}-${fellowId}`,
        chip: "Not started",
        tone: "neutral",
        title: `${row.teacher?.name ?? row.teacherName} has not started ${batches[index]?.name}`,
        detail: "No module opened yet.",
        action: (
          <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => openMail(batches[index], fellowId)} data-testid={`button-note-${fellowId}`}>
            Send a note
          </Button>
        ),
      });
    });
  });
  const homeLoading = batchesLoading || pendingFellowsLoading || courseQueries.some((query) => query.isLoading) || weekQueries.some((query) => query.isLoading) || progressQueries.some((query) => query.isLoading);
  const eventsLoading = batchesLoading || eventQueries.some((query) => query.isLoading);
  const shownNeeds = showAllNeeds ? needs : needs.slice(0, 6);
  const sessionsToday = events.filter((event) => event.eventType === "session" && dayKey(new Date(event.startDate)) === todayKey);

  const renderHome = () => (
    <div className="space-y-6">
      <PageHead
        title="Home"
        sub={batchesLoading
          ? <SkeletonBar className="h-4 w-72 max-w-full" />
          : `${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · ${plural(batches.length, "cohort")} · ${plural(fellowTotal, "Fellow")}`}
        action={<Button className={PRIMARY_BUTTON} onClick={openAddEvent} data-testid="button-add-session">Add a session</Button>}
      />
      {deskLoading && <SkeletonBar className="h-4 w-80 max-w-full" />}
      {(desk?.encouragement || deskError) && (
        <p className="text-sm text-sl-muted" data-testid="trainer-encouragement">
          {desk?.encouragement || "You make it safe for a Fellow to try again."}
        </p>
      )}

      <section className={PANEL} aria-label="Needs you today" data-testid="trainer-needs">
        <h2 className="px-5 pt-5 text-lg font-semibold text-sl-ink">
          Needs you today{!homeLoading && <span className="font-normal text-sl-muted"> · {needs.length}</span>}
        </h2>
        {homeLoading ? (
          <SkeletonRows label="Loading what needs you" rows={3} />
        ) : needs.length === 0 ? (
          <p className="px-5 pb-4 pt-2 text-sm text-sl-muted">Nothing needs you today. Missing lesson files, Fellows who have not started and approvals appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-sl-line border-t border-sl-line">
            {shownNeeds.map((need) => (
              <li key={need.key} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <Chip tone={need.tone}>{need.chip}</Chip>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sl-ink">{need.title}</p>
                  <p className="text-sm text-sl-muted">{need.detail}</p>
                </div>
                {need.action}
              </li>
            ))}
          </ul>
        )}
        {needs.length > shownNeeds.length && (
          <div className="border-t border-sl-line px-5 py-3">
            <button type="button" className="min-h-11 text-sm font-semibold text-sl-accent underline" onClick={() => setShowAllNeeds(true)}>
              Show all {needs.length}
            </button>
          </div>
        )}
        {homeLoading || eventsLoading || cohortPending || reviewsLoading ? (
          <div className="border-t border-sl-line px-5 py-3.5"><SkeletonBar className="h-4 w-2/3" /></div>
        ) : (
          <p className="border-t border-sl-line px-5 py-3 text-sm text-sl-muted" data-testid="trainer-today-line">
            Quiz answers to mark: {pendingReviews.length === 0 ? "none" : pendingReviews.length}
            <span className="ml-5">Sessions today: {sessionsToday.length === 0 ? "none scheduled" : sessionsToday.length}</span>
            <span className="ml-5">
              <Link href="/approvals" className="text-sl-accent underline" data-testid="link-trainer-approvals">
                Approvals: {pendingFellows.length === 0 ? "none waiting" : `${pendingFellows.length} waiting`}
              </Link>
            </span>
          </p>
        )}
      </section>

      <Panel title="Quizzes waiting for your approval" testId="trainer-drafts">
        {fileQuizzesLoading ? (
          <SkeletonRows label="Loading quizzes" rows={2} className="-mx-5" />
        ) : draftQuizzes.length === 0 ? (
          <p className="text-sm text-sl-muted">None yet. When you upload a lesson file, its AI-drafted quiz waits here; Fellows see it only after you approve it.</p>
        ) : (
          <>
            <ul className="space-y-3">{draftQuizzes.slice(0, 3).map(draftRow)}</ul>
            {draftQuizzes.length > 3 && (
              <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-sl-accent underline" onClick={() => goTo("assessments")}>
                See all {draftQuizzes.length} in Assessments
              </button>
            )}
          </>
        )}
      </Panel>

      <section className={`${PANEL} overflow-hidden`} aria-label="Your cohorts">
        <h2 className="px-5 pt-5 text-lg font-semibold text-sl-ink">Your cohorts{!batchesLoading && <span className="font-normal text-sl-muted"> · {batches.length}</span>}</h2>
        {batchesLoading ? (
          <SkeletonRows label="Loading cohorts" rows={3} className="mt-3 border-t border-sl-line" />
        ) : batches.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-sl-muted">No cohorts on this desk yet. Your Admin adds them.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-y border-sl-line text-sl-muted">
                  <th scope="col" className="px-5 py-3 font-normal">Cohort</th>
                  <th scope="col" className="px-3 py-3 font-normal">Fellows</th>
                  <th scope="col" className="px-3 py-3 font-normal">Steps</th>
                  <th scope="col" className="px-5 py-3 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.slice(0, 4).map((batch: any) => {
                  const steps = stepsOf(batch.id);
                  return (
                    <tr key={batch.id} className="border-b border-sl-line last:border-b-0">
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          className="font-semibold text-sl-accent underline-offset-2 hover:underline"
                          onClick={() => { chooseBatch(batch.id); goTo("cohorts"); }}
                          data-testid={`link-home-cohort-${batch.id}`}
                        >
                          {batch.name}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sl-ink">{batch.teacherCount || 0}</td>
                      <td className="px-3 py-3 text-sl-ink">{deskLoading ? <SkeletonBar className="h-4 w-16" /> : steps.length === 0 ? "No steps yet" : plural(steps.length, "step")}</td>
                      <td className="px-5 py-3 text-sl-ink">
                        {batch.status === "closed" ? "Closed" : batch.quizzesStatus === "stopped" ? "Open · quizzes stopped" : "Open · quizzes on"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-sl-line px-5 py-3 text-sm text-sl-muted">
          {!batchesLoading && <>Showing {Math.min(4, batches.length)} of {batches.length}.{" "}</>}
          <button type="button" className="font-semibold text-sl-accent underline" onClick={() => goTo("cohorts")}>See all cohorts</button>
        </p>
      </section>

      <section aria-label="This term" data-testid="trainer-kpis">
        <h2 className="mb-3 text-lg font-semibold text-sl-ink">This term</h2>
        {deskLoading ? (
          <SkeletonFigures label="Loading this term's figures" line />
        ) : (
          <p className={`${PANEL} flex flex-wrap gap-x-7 gap-y-1 px-5 py-4 text-sl-muted`}>
            <span>Fellows <b className="text-sl-ink">{desk?.teacherCount ?? "—"}</b></span>
            <span>Quizzes open <b className="text-sl-ink">{desk?.openQuizzes ?? "—"}</b></span>
            <span>Assessments <b className="text-sl-ink">{desk?.assessments ?? desk?.paperExams ?? "—"}</b></span>
            <span>Written answers to mark <b className="text-sl-ink">{desk?.toMark ?? "—"}</b></span>
            <span>Sessions coming up <b className="text-sl-ink">{desk?.upcomingEvents ?? "—"}</b></span>
            <span>Attendance <b className="text-sl-ink">{desk?.attendanceRate == null ? "—" : `${desk.attendanceRate}%`}</b></span>
          </p>
        )}
      </section>
    </div>
  );

  // ---------- Cohorts ----------
  const fellowRow = (teacher: any) => {
    const row = progressFor(teacher.id);
    const status = learningStatus({ percentage: row?.overallPercentage || 0 });
    return (
      <li key={teacher.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-sl-line p-3" data-testid={`row-fellow-${teacher.id}`}>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-sl-ink">
            {teacher.name}
            {row && <Chip tone={statusTone(status)}>{status}</Chip>}
          </p>
          <p className="text-sm text-sl-muted">{row ? `${row.overallPercentage || 0}% of courses complete` : teacher.email}</p>
        </div>
        <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => openMail(selectedBatch, teacher.id)} data-testid={`button-message-teacher-${teacher.id}`}>
          Message
        </Button>
        <Button
          variant="outline"
          className={SECONDARY_BUTTON}
          onClick={() => { setCommentTeacher(teacher); setCommentDialogOpen(true); }}
          data-testid={`button-comment-teacher-${teacher.id}`}
        >
          Feedback
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className={`${SECONDARY_BUTTON} w-11 px-0`} aria-label={`More actions for ${teacher.name}`} data-testid={`button-more-teacher-${teacher.id}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => {
                const detail = row || {};
                setSelectedTeacher({ ...detail, teacherName: teacher.name, teacherEmail: teacher.email, id: teacher.id, teacherId: teacher.id });
                setViewTeacherAttemptsOpen(true);
              }}
              data-testid={`button-view-attempts-${teacher.id}`}
            >
              View details
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              disabled={starMutation.isPending}
              onSelect={() => starMutation.mutate({ teacherId: teacher.id, give: !row?.trainerStar })}
              data-testid={`button-give-star-${teacher.id}`}
            >
              {row?.trainerStar ? "Take the star back" : "Give a star"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11 text-sl-risk focus:text-sl-risk"
              onSelect={() => { setDisqualifyTeacher(teacher); setDisqualifyDialogOpen(true); }}
              data-testid={`button-disqualify-teacher-${teacher.id}`}
            >
              Disqualify…
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11 text-sl-risk focus:text-sl-risk"
              onSelect={() => { if (confirm(`Remove ${teacher.name} from this cohort?`)) removeTeacherMutation.mutate({ batchId: selectedBatch.id, teacherId: teacher.id }); }}
              data-testid={`button-remove-teacher-${teacher.id}`}
            >
              Remove from cohort…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  };

  const renderCohorts = () => {
    const steps = selectedBatch ? stepsOf(selectedBatch.id) : [];
    return (
      <div className="space-y-6" data-tour="trainer-batches">
        <PageHead
          title="Cohorts"
          sub={batchesLoading
            ? <SkeletonBar className="h-4 w-96 max-w-full" />
            : `The ${plural(batches.length, "cohort")} you run. Admins create, close and delete cohorts and place courses on them.`}
        />
        {batchesLoading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] lg:items-start">
            <div className={`${PANEL} overflow-hidden`}>
              <div className="p-4"><SkeletonBar className="h-11 w-full" /></div>
              <SkeletonRows label="Loading cohorts" rows={4} className="border-t border-sl-line" />
            </div>
            <SkeletonCard label="Loading the cohort" lines={6} className="p-6" />
          </div>
        ) : batches.length === 0 ? (
          <Panel title="No cohorts on this desk yet">
            <p className="text-sm text-sl-muted">Your Admin adds a cohort and places you on it. It then appears here.</p>
          </Panel>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)] lg:items-start">
            <div className={`${PANEL} overflow-hidden`}>
              <div className="space-y-1 p-4">
                <Label htmlFor="cohort-search" className="text-sm font-normal text-sl-muted">Find a cohort</Label>
                <Input
                  id="cohort-search"
                  className="min-h-11 border-sl-control bg-sl-surface"
                  value={listQuery}
                  onChange={(event) => setListQuery(event.target.value)}
                  placeholder="Cohort name"
                  data-testid="input-list-search"
                />
              </div>
              <ul className="border-t border-sl-line">
                {filteredBatches.length === 0 && <li className="p-4 text-sm text-sl-muted">No cohort matches that name.</li>}
                {filteredBatches.map((batch: any) => {
                  const selected = selectedBatch?.id === batch.id;
                  const count = stepsOf(batch.id).length;
                  return (
                    <li key={batch.id} className="border-b border-sl-line last:border-b-0">
                      <button
                        type="button"
                        onClick={() => chooseBatch(batch.id)}
                        aria-current={selected ? "true" : undefined}
                        className={`block min-h-11 w-full px-4 py-3 text-left ${selected ? "bg-sl-accent-soft" : "hover:bg-sl-neutral-soft"}`}
                        data-testid={`button-batch-${batch.id}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sl-ink">{batch.name}</span>
                          {batch.status === "closed" && <Chip>Closed</Chip>}
                        </span>
                        <span className="text-sm text-sl-muted">
                          {plural(Number(batch.teacherCount || 0), "Fellow")}{!deskLoading && ` · ${count === 0 ? "no steps yet" : plural(count, "step")}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {!selectedBatch && <SkeletonCard label="Loading the cohort" lines={6} className="p-6" />}
            {selectedBatch && (
              <section className={`${PANEL} space-y-6 p-6`} aria-label={selectedBatch.name} data-testid="trainer-cohort-detail">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold text-sl-ink">{selectedBatch.name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip tone={selectedBatch.status === "closed" ? "neutral" : "done"}>{selectedBatch.status === "closed" ? "Closed" : "Open"}</Chip>
                      <Chip tone={selectedBatch.quizzesStatus === "stopped" ? "neutral" : "done"}>
                        {selectedBatch.quizzesStatus === "stopped" ? "Quizzes stopped" : "Quizzes on"}
                      </Chip>
                    </div>
                    {selectedBatch.description && <p className="mt-2 text-sm text-sl-muted">{selectedBatch.description}</p>}
                  </div>
                  <Button className={PRIMARY_BUTTON} onClick={() => setLocation(`/cohorts/${selectedBatch.id}`)} data-testid="button-open-cohort-room">
                    Open cohort room
                  </Button>
                </div>

                <div>
                  <h3 className="font-semibold text-sl-ink">Finishing</h3>
                  <p className="text-sm text-sl-muted">A Fellow finishes the academy after the number of cohorts your Admin sets.</p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-sl-ink">Steps <span className="font-normal text-sl-muted">· run in order</span></h3>
                  {deskLoading ? (
                    <SkeletonRows label="Loading steps" rows={2} className="rounded-lg border border-sl-line" />
                  ) : steps.length === 0 ? (
                    <p className="text-sm text-sl-muted">No steps yet. Your Admin adds the steps of a cohort.</p>
                  ) : steps.map((step, index) => (
                    <div key={step.id} className="rounded-lg border border-sl-line p-4" data-testid={`step-${step.id}`}>
                      <p className="font-semibold text-sl-ink">Step {index + 1} · {step.name}</p>
                      {coursesLoading ? (
                        <SkeletonBar className="mt-2 h-6 w-40 rounded-full" />
                      ) : selectedBatchCourses.length === 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-sl-muted">
                          <Chip>No course yet</Chip> Ask your Admin to place one.
                        </p>
                      )}
                    </div>
                  ))}
                  {!coursesLoading && selectedBatchCourses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-sl-muted">Courses on this cohort, placed on its steps by your Admin:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedBatchCourses.map((course: any) => (
                          <Link
                            key={course.id}
                            href={`/courses/${course.id}`}
                            className="inline-flex min-h-11 items-center rounded-lg border border-sl-control bg-sl-accent-soft px-3 text-sm font-medium text-sl-accent"
                            data-testid={`link-batch-course-${course.id}`}
                          >
                            {course.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-sl-ink">Fellows{!teachersLoading && <span className="font-normal text-sl-muted"> · {teachers.length}</span>}</h3>
                    <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setAddTeacherOpen(true)} data-testid="button-add-teacher">
                      Add a Fellow
                    </Button>
                  </div>
                  {teachersLoading ? (
                    <SkeletonRows label="Loading Fellows" rows={3} className="rounded-lg border border-sl-line" />
                  ) : teachers.length === 0 ? (
                    <p className="text-sm text-sl-muted">No Fellows in this cohort yet. Add one by Fellow ID, name or email.</p>
                  ) : (
                    <ul className="space-y-3">{teachers.map(fellowRow)}</ul>
                  )}
                  <p className="text-sm text-sl-muted">Message opens desk mail with the Fellow. Feedback adds a comment they can read but not reply to.</p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---------- Assessments ----------
  const cohortQuizzes: any[] = quizQueries.flatMap((query, index) =>
    ((query.data as any[]) || []).map((quiz: any) => ({ ...quiz, cohortName: batches[index]?.name || "Cohort" })));
  const examList = cohortQuizzes.filter((quiz) => isWritingExam(quiz));
  const lessonQuizList = cohortQuizzes.filter((quiz) => !isWritingExam(quiz));
  const quizzesLoading = batchesLoading || quizQueries.some((query) => query.isLoading);
  const examsLoading = quizzesLoading || assignmentQueries.some((query) => query.isLoading);
  const givenTo = (quiz: any) => audienceLabel(quiz.audience);

  const renderAssessments = () => (
    <div className="space-y-6">
      <PageHead
        title="Assessments"
        sub={batchesLoading
          ? <SkeletonBar className="h-4 w-96 max-w-full" />
          : `Quizzes to approve, exams you set, and lesson quizzes on your ${plural(batches.length, "cohort")} · pass mark 80% · 3 tries`}
      />

      <Panel
        title="Quizzes waiting for your approval"
        testId="trainer-drafts"
        sub={draftQuizzes.length === 0 && !fileQuizzesLoading
          ? "None waiting. When a lesson file is uploaded to a course on your cohorts, AI drafts its quiz and the draft waits here. Fellows see it only after you approve it."
          : undefined}
      >
        {fileQuizzesLoading ? <SkeletonRows label="Loading quizzes" rows={2} className="-mx-5" /> : draftQuizzes.length > 0 && <ul className="space-y-3">{draftQuizzes.map(draftRow)}</ul>}
      </Panel>

      <div data-testid="trainer-assessments">
      <Panel
        title="Exams"
        sub="Give an exam to a whole cohort or only to the Fellows you tick. Fellows see the correct answers after their last try."
        action={
          <>
            <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => { setTaskKind("assessment"); setTaskOpen(true); }} data-testid="button-upload-assessment">
              Upload an assessment
            </Button>
            <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setUploadExamOpen(true)} data-testid="button-upload-exam">
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              Upload a paper exam
            </Button>
            <Button className={PRIMARY_BUTTON} onClick={() => setWriteExamOpen(true)} data-testid="button-write-exam">
              Write an exam
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {examsLoading ? <SkeletonRows label="Loading exams" rows={2} className="-mx-5" /> : examList.length === 0 && (
            <p className="text-sm text-sl-muted">No exams yet.</p>
          )}
          {examList.map((quiz: any) => (
            <div key={quiz.id} className="rounded-lg border border-sl-line p-4" data-testid={`card-assessment-${quiz.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sl-ink">{quiz.title}</p>
                  <p className="text-sm text-sl-muted">
                    {quiz.cohortName} · {quiz.paperUrl ? "Uploaded paper" : "Written exam"} · {dueLabel(quiz.dueDate)} · Given to {givenTo(quiz)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className={`${SECONDARY_BUTTON} w-11 px-0 text-sl-risk`}
                  aria-label={`Delete ${quiz.title}`}
                  onClick={() => deleteQuizMutation.mutate(quiz.id)}
                  data-testid={`button-delete-quiz-${quiz.id}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              <WorkDeadlineEditor
                current={quiz.dueDate}
                pending={saveQuizDeadlineMutation.isPending}
                testId={`quiz-deadline-${quiz.id}`}
                onSave={(dueDate) => saveQuizDeadlineMutation.mutate({ quizId: quiz.id, dueDate })}
              />
            </div>
          ))}
          {batches.map((batch: any) => <AssessmentDesk key={batch.id} batchId={batch.id} cohortName={batch.name} />)}
        </div>
      </Panel>
      </div>

      <div data-testid="trainer-quizzes">
      <Panel
        title="Lesson quizzes on your cohorts"
        sub={approvedFileQuizzes.length === 0 && lessonQuizList.length === 0 && !quizzesLoading && !fileQuizzesLoading
          ? "None yet. Each quiz you approve appears here with its course, module and lesson file."
          : undefined}
        action={
          <>
            <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setAssignCheckpointQuizOpen(true)} data-testid="button-assign-checkpoint-quiz">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Checkpoint quiz
            </Button>
            <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setAssignFileQuizOpen(true)} data-testid="button-assign-file-quiz">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              File quiz
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(quizzesLoading || fileQuizzesLoading) && <SkeletonRows label="Loading lesson quizzes" rows={2} className="-mx-5" />}
          {approvedFileQuizzes.map((quiz: any) => (
            <div key={quiz.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-sl-line p-4" data-testid={`file-quiz-${quiz.id}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sl-ink">Quiz for {quiz.file_name || "a lesson file"}</p>
                <p className="text-sm text-sl-muted">{quiz.course_name} · Module {quiz.week_number} · {plural(Number(quiz.question_count || 0), "question")} · {quiz.cohorts.join(", ")}</p>
              </div>
              <Chip tone="done">Approved</Chip>
              <Button variant="outline" className={SECONDARY_BUTTON} onClick={() => setReviewQuiz(quiz)} data-testid={`button-edit-file-quiz-${quiz.id}`}>Edit</Button>
            </div>
          ))}
          {lessonQuizList.map((quiz: any) => (
            <div
              key={quiz.id}
              role="button"
              tabIndex={0}
              className="cursor-pointer rounded-lg border border-sl-line p-4 hover:bg-sl-neutral-soft"
              onClick={() => { setSelectedQuizId(quiz.id); setViewQuizDetailsOpen(true); }}
              onKeyDown={(event) => { if (event.key === "Enter") { setSelectedQuizId(quiz.id); setViewQuizDetailsOpen(true); } }}
              data-testid={`card-quiz-${quiz.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-sl-ink">
                    {quiz.title}
                    <Chip>{quiz.paperUrl ? "Paper" : quiz.weekId ? "Module" : "Written"}</Chip>
                    <Chip>{givenTo(quiz)}</Chip>
                  </p>
                  <p className="mt-1 text-sm text-sl-muted">{quiz.cohortName} · {quiz.description || "No description"} · {dueLabel(quiz.dueDate)}</p>
                  <WorkDeadlineEditor
                    current={quiz.dueDate}
                    pending={saveQuizDeadlineMutation.isPending}
                    testId={`quiz-deadline-${quiz.id}`}
                    onSave={(dueDate) => saveQuizDeadlineMutation.mutate({ quizId: quiz.id, dueDate })}
                  />
                </div>
                <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                  <Button
                    variant="outline"
                    className={`${SECONDARY_BUTTON} w-11 px-0`}
                    aria-label={`Fellow attempts for ${quiz.title}`}
                    title="View Fellow attempts"
                    onClick={() => { setSelectedQuizForAttempts(quiz); setQuizAttemptsOpen(true); }}
                    data-testid={`button-quiz-attempts-${quiz.id}`}
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    className={`${SECONDARY_BUTTON} w-11 px-0`}
                    aria-label={`Edit questions of ${quiz.title}`}
                    title="Edit questions"
                    onClick={() => { setEditingQuiz({ ...quiz, batchId: quiz.batchId }); setEditQuizOpen(true); }}
                    data-testid={`button-edit-quiz-${quiz.id}`}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    className={`${SECONDARY_BUTTON} w-11 px-0 text-sl-risk`}
                    aria-label={`Delete ${quiz.title}`}
                    onClick={() => deleteQuizMutation.mutate(quiz.id)}
                    data-testid={`button-delete-quiz-${quiz.id}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      </div>

      {pendingReviews.length > 0 && (
        <Panel title="Quiz answers to mark" titleSuffix={pendingReviews.length} testId="trainer-open-reviews">
          <ul className="space-y-3">
            {pendingReviews.map((review: any) => {
              const mark = async (passed: boolean) => {
                await apiRequest("POST", `/api/quiz-attempts/${review.attemptId}/review-open-ended`, {
                  reviews: [{
                    questionId: review.questionId,
                    assignedQuizId: review.assignedQuizId,
                    teacherId: review.teacherId,
                    questionText: review.questionText,
                    teacherAnswer: review.teacherAnswer,
                    passed,
                  }],
                });
                queryClient.invalidateQueries({ queryKey: ["/api/trainer/pending-reviews"] });
                toast({ title: passed ? "Marked as passed" : "Marked as failed" });
              };
              return (
                <li key={review.id} className="rounded-lg border border-sl-line p-4">
                  <p className="text-sm font-medium text-sl-ink">{review.questionText}</p>
                  <p className="mt-1 text-sm italic text-sl-muted">{review.teacherAnswer || "(no answer)"}</p>
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" className={`${SECONDARY_BUTTON} border-sl-done text-sl-done`} onClick={() => mark(true)}>
                      <CheckCircle className="mr-1 h-4 w-4" aria-hidden="true" /> Pass
                    </Button>
                    <Button variant="outline" className={`${SECONDARY_BUTTON} border-sl-risk text-sl-risk`} onClick={() => mark(false)}>
                      <X className="mr-1 h-4 w-4" aria-hidden="true" /> Fail
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );

  // ---------- Progress ----------
  const progressCourseCell = (row: any, course: any) => {
    const mods = modulesByCourse[course.id];
    if (!mods) return <SkeletonBar className="h-6 w-24 rounded-full" />;
    if (mods.length === 0) return <Chip>No modules yet</Chip>;
    if (!mods.some((mod: any) => mod.deckFiles?.length)) return <Chip tone="attention">No lesson files yet</Chip>;
    const done = (row.courseCompletions || []).find((item: any) => item.courseId === course.id);
    const status = learningStatus({
      percentage: done?.percentage || 0,
      passed: done?.status === "completed" ? true : undefined,
    });
    return <Chip tone={statusTone(status)}>{status}{done?.percentage && status === "In Progress" ? ` · ${done.percentage}%` : ""}</Chip>;
  };
  const progressAverage = batchProgress.length
    ? Math.round(batchProgress.reduce((sum: number, row: any) => sum + (row.overallPercentage || 0), 0) / batchProgress.length)
    : 0;
  const quizzesPassed = batchProgress.reduce((sum: number, row: any) => sum + (row.reportCard?.totalQuizzesPassed || 0), 0);
  const needSupport = batchProgress.filter((row: any) => (row.overallPercentage || 0) > 0 && (row.overallPercentage || 0) < 30).length;

  const renderProgress = () => (
    <div className="space-y-6">
      <PageHead
        title="Progress"
        sub="Where each Fellow is in each course of a cohort"
        action={selectedBatch && (
          <a
            href={`/api/batches/${selectedBatch.id}/gradebook.csv`}
            download
            className="inline-flex min-h-11 items-center text-sm font-semibold text-sl-accent underline"
            data-testid="link-download-csv"
          >
            Download CSV
          </a>
        )}
      />
      {batchesLoading ? (
        <>
          <div className="max-w-md space-y-1">
            <Label htmlFor="progress-cohort">Cohort</Label>
            <SkeletonBar className="h-11 w-full rounded-lg" />
          </div>
          <SkeletonCard label="Loading progress" lines={5} />
          <SkeletonFigures label="Loading the cohort in figures" line />
        </>
      ) : batches.length === 0 ? (
        <Panel title="No cohorts on this desk yet" />
      ) : (
        <>
          <div className="max-w-md space-y-1">
            <Label htmlFor="progress-cohort">Cohort</Label>
            {cohortSelect("progress-cohort")}
          </div>
          <Panel
            title={cohortPending || coursesLoading || selectedBatchCourses.length === 0 ? "Courses" : `Courses on ${selectedBatch?.name}`}
            testId="trainer-progress-matrix"
            sub={cohortPending || coursesLoading
              ? undefined
              : selectedBatchCourses.length === 0
              ? "No course has been placed on this cohort yet, so there are no columns. Your Admin places courses on a step."
              : "Your Admin places courses on a step. A step with no course has no columns."}
          >
            {progressLoading ? (
              <div>
                <p className="border-b border-sl-line py-3 text-sm text-sl-muted">Fellow</p>
                <SkeletonRows label="Loading progress" rows={3} className="-mx-5" />
              </div>
            ) : batchProgress.length === 0 ? (
              <p className="text-sm text-sl-muted">No Fellows in this cohort yet. Add one on Cohorts and their progress fills in here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-sl-line align-bottom text-sl-muted">
                      <th scope="col" className="py-3 pr-4 font-normal">Fellow</th>
                      {selectedBatchCourses.map((course: any) => (
                        <th key={course.id} scope="col" className="px-3 py-3 font-normal">
                          <Link href={`/courses/${course.id}`} className="text-sl-muted hover:text-sl-accent" data-testid={`link-batch-course-${course.id}`}>{course.name}</Link>
                        </th>
                      ))}
                      <th scope="col" className="px-3 py-3 font-normal">Medals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchProgress.map((row: any) => {
                      const fellow = row.teacher || { id: row.teacherId, name: row.teacherName, email: row.teacherEmail };
                      const earned = (row.medals || []).filter((medal: any) => medal.earned);
                      return (
                        <tr key={fellow.id} className="border-b border-sl-line last:border-b-0">
                          <td className="py-3 pr-4">
                            <button
                              type="button"
                              className="min-h-11 text-left font-semibold text-sl-accent hover:underline"
                              onClick={() => {
                                setSelectedTeacher({ ...row, teacherName: fellow.name, teacherEmail: fellow.email, id: fellow.id, teacherId: fellow.id });
                                setViewTeacherAttemptsOpen(true);
                              }}
                              data-testid={`button-view-attempts-${fellow.id}`}
                            >
                              {fellow.name}
                            </button>
                          </td>
                          {selectedBatchCourses.map((course: any) => (
                            <td key={course.id} className="px-3 py-3">{progressCourseCell(row, course)}</td>
                          ))}
                          <td className="px-3 py-3 text-sl-muted">
                            <span className="font-semibold text-sl-ink">{earned.length} of {(row.medals || []).length}</span>
                            {earned.length > 0 && <span className="block">{earned.map((medal: any) => medal.title).join(", ")}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!progressLoading && !coursesLoading && selectedBatchCourses.length > 0 && batchProgress.length > 0 && (
              <p className="mt-3 text-sm text-sl-muted">A course with no modules does not hold a Fellow up. A course needs at least one lesson file before it can be complete.</p>
            )}
          </Panel>
          <section aria-label="Cohort in figures" data-testid="trainer-progress-figures">
            <h2 className="mb-3 text-lg font-semibold text-sl-ink">{selectedBatch?.name ?? "Cohort"} in figures</h2>
            {progressLoading ? (
              <SkeletonFigures label="Loading the cohort in figures" line />
            ) : (
              <p className={`${PANEL} flex flex-wrap gap-x-7 gap-y-1 px-5 py-4 text-sl-muted`}>
                <span>Fellows <b className="text-sl-ink">{batchProgress.length}</b></span>
                <span>Average completion <b className="text-sl-ink">{progressAverage}%</b></span>
                <span>Quizzes passed <b className="text-sl-ink">{quizzesPassed}</b></span>
                <span>Needs support <b className="text-sl-ink">{needSupport}</b></span>
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );

  // ---------- Attendance ----------
  const MARKS = [
    { value: "present", label: "Present", on: "border-sl-done bg-sl-done-soft text-sl-done" },
    { value: "late", label: "Late", on: "border-sl-attention bg-sl-attention-soft text-sl-attention" },
    { value: "absent", label: "Absent", on: "border-sl-risk bg-sl-risk-soft text-sl-risk" },
    { value: "excused", label: "Excused", on: "border-sl-neutral bg-sl-neutral-soft text-sl-neutral" },
  ] as const;
  const markTone: Record<string, Tone> = { present: "done", late: "attention", absent: "risk", excused: "neutral" };
  const todayValue = new Date().toISOString().split("T")[0];
  const attendanceDayWord = attendanceDate === todayValue ? "today" : new Date(`${attendanceDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  const nameOf = (id: string) => teachers.find((teacher: any) => teacher.id === id)?.name || "Fellow";
  const marksByNewest = [...recentMarks].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const markTotal = batchAttendanceSummary.reduce((sum: number, row: any) => sum + Number(row.total_days || 0), 0);
  const markPresent = batchAttendanceSummary.reduce((sum: number, row: any) => sum + Number(row.present_days || 0), 0);
  const markCounted = batchAttendanceSummary.reduce((sum: number, row: any) => sum + Number(row.present_days || 0) + Number(row.late_days || 0), 0);

  const renderAttendance = () => (
    <div className="space-y-6">
      <PageHead title="Attendance" sub="Mark who came, one cohort and one day at a time" />
      {batchesLoading ? (
        <>
          <SkeletonCard label="Loading attendance" lines={5} />
          <SkeletonCard label="Loading recent marks" lines={3} />
          <SkeletonFigures label="Loading attendance in figures" count={3} />
        </>
      ) : batches.length === 0 ? (
        <Panel title="No cohorts on this desk yet" />
      ) : (
        <>
          <Panel title={`Mark attendance for ${attendanceDayWord}`} testId="trainer-mark-attendance">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <div className="space-y-1">
                <Label htmlFor="attendance-cohort">Cohort</Label>
                {cohortSelect("attendance-cohort")}
              </div>
              <div className="space-y-1">
                <Label htmlFor="attendance-date">Date</Label>
                <input
                  id="attendance-date"
                  type="date"
                  value={attendanceDate}
                  onChange={(event) => setAttendanceDate(event.target.value)}
                  className={FIELD}
                  max={todayValue}
                  data-testid="input-attendance-date"
                />
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-sl-ink">Fellows in {selectedBatch?.name ?? "the cohort"}{!teachersLoading && <span className="font-normal text-sl-muted"> · {teachers.length}</span>}</h3>
                {teachersLoading || dailyLoading ? (
                  <SkeletonBar className="h-4 w-52" />
                ) : (
                  <p className="text-sm text-sl-muted" data-testid="text-attendance-status">
                    {dailyAttendance.length === 0 ? "Nobody is marked for this date yet" : `${dailyAttendance.length} of ${teachers.length} marked for this date`}
                  </p>
                )}
              </div>
              {teachersLoading ? (
                <SkeletonRows label="Loading Fellows" rows={3} />
              ) : teachers.length === 0 ? (
                <p className="text-sm text-sl-muted">No Fellows enrolled in this cohort.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-sl-muted">Set everyone:</span>
                    {MARKS.map((mark) => (
                      <Button
                        key={mark.value}
                        variant="outline"
                        className={`${SECONDARY_BUTTON} text-sm`}
                        onClick={() => {
                          const all: Record<string, string> = {};
                          teachers.forEach((teacher: any) => { all[teacher.id] = mark.value; });
                          setAttendanceRecordsState(all);
                        }}
                      >
                        All {mark.value}
                      </Button>
                    ))}
                  </div>
                  <ul className="space-y-3">
                    {teachers.map((teacher: any) => (
                      <li key={teacher.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sl-line p-3">
                        <span className="font-semibold text-sl-ink">{teacher.name}</span>
                        <div role="radiogroup" aria-label={`Attendance for ${teacher.name}`} className="flex flex-wrap gap-2">
                          {MARKS.map((mark) => {
                            const picked = attendanceRecordsState[teacher.id] === mark.value;
                            return (
                              <button
                                key={mark.value}
                                type="button"
                                role="radio"
                                aria-checked={picked}
                                onClick={() => setAttendanceRecordsState((prev) => ({ ...prev, [teacher.id]: mark.value }))}
                                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm ${picked ? `${mark.on} font-semibold` : "border-sl-control bg-sl-surface text-sl-ink"}`}
                                data-testid={`mark-${mark.value}-${teacher.id}`}
                              >
                                <span aria-hidden="true" className={`h-4 w-4 rounded-full border-2 ${picked ? "border-current bg-current" : "border-sl-control"}`} />
                                {mark.label}
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={PRIMARY_BUTTON}
                    disabled={submitAttendanceMutation.isPending || Object.keys(attendanceRecordsState).length === 0}
                    onClick={() => {
                      const records = Object.entries(attendanceRecordsState).map(([teacherId, status]) => ({ teacherId, status }));
                      submitAttendanceMutation.mutate({ batchId: selectedBatch.id, date: attendanceDate, records });
                    }}
                    data-testid="button-save-attendance"
                  >
                    {submitAttendanceMutation.isPending ? "Saving..." : "Save attendance"}
                  </Button>
                </>
              )}
            </div>
          </Panel>

          <section className={`${PANEL} overflow-hidden`} aria-label="Recent marks" data-testid="trainer-recent-marks">
            <div className="p-5 pb-3">
              <h2 className="text-lg font-semibold text-sl-ink">Recent marks</h2>
              {cohortPending || marksLoading
                ? <SkeletonBar className="mt-1 h-4 w-40" />
                : <p className="text-sm text-sl-muted">{selectedBatch?.name} · {plural(recentMarks.length, "mark")}</p>}
            </div>
            {cohortPending || marksLoading ? (
              <SkeletonRows label="Loading recent marks" rows={3} className="border-t border-sl-line" />
            ) : recentMarks.length === 0 ? (
              <p className="border-t border-sl-line px-5 py-4 text-sm text-sl-muted">No marks yet. Marks you save above appear here, newest first.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left text-sm">
                  <thead>
                    <tr className="border-y border-sl-line text-sl-muted">
                      <th scope="col" className="px-5 py-3 font-normal">Date</th>
                      <th scope="col" className="px-3 py-3 font-normal">Fellow</th>
                      <th scope="col" className="px-5 py-3 font-normal">Mark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksByNewest.slice(0, 10).map((mark: any) => (
                      <tr key={mark.id || `${mark.teacherId}-${mark.date}`} className="border-b border-sl-line last:border-b-0">
                        <td className="px-5 py-3 text-sl-muted">{new Date(mark.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td>
                        <td className="px-3 py-3 font-semibold text-sl-ink">{nameOf(mark.teacherId)}</td>
                        <td className="px-5 py-3"><Chip tone={markTone[mark.status] || "neutral"}>{String(mark.status).charAt(0).toUpperCase() + String(mark.status).slice(1)}</Chip></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Attendance in figures" data-testid="trainer-attendance-figures">
            <h2 className="mb-3 text-lg font-semibold text-sl-ink">Attendance in figures</h2>
            {cohortPending || summaryLoading ? (
              <SkeletonFigures label="Loading attendance in figures" count={3} />
            ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={`${PANEL} p-4`}>
                <p className="text-sm text-sl-muted">Attendance rate</p>
                <p className="text-3xl font-semibold text-sl-ink">{markTotal === 0 ? "—" : `${Math.round((markCounted / markTotal) * 100)}%`}</p>
                <p className="text-sm text-sl-muted">{selectedBatch?.name}</p>
              </div>
              <div className={`${PANEL} p-4`}>
                <p className="text-sm text-sl-muted">Marks</p>
                <p className="text-3xl font-semibold text-sl-ink">{markTotal}</p>
                <p className="text-sm text-sl-muted">{markPresent} Present</p>
              </div>
              <div className={`${PANEL} p-4`}>
                <p className="text-sm text-sl-muted">Fellows marked</p>
                <p className="text-3xl font-semibold text-sl-ink">{batchAttendanceSummary.length}</p>
                <p className="text-sm text-sl-muted">of {teachers.length}</p>
              </div>
            </div>
            )}
            <p className="mt-3 text-sm text-sl-muted">Only Fellows are marked; trainers are not.</p>
          </section>
        </>
      )}
    </div>
  );

  // ---------- Messages ----------
  const renderMessages = () => (
    <div className="space-y-6">
      <PageHead title="Messages" sub="Desk mail with your Fellows, cohort notes, and feedback comments" />
      <div data-testid="trainer-messages">
        <TrainerMessages
          batches={batches}
          selectedBatchId={selectedBatch?.id || ""}
          onSelectBatch={chooseBatch}
          teachers={teachers}
          loading={teachersLoading}
          expandedId={expandedTeacherId}
          onPick={setExpandedTeacherId}
          selfLabel={user ? deskName(user) : "Trainer"}
        />
      </div>
    </div>
  );

  // ---------- Schedule ----------
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7) + weekOffset * 7);
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index));
  const weekTitle = `${weekDays[0].toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })} – ${weekDays[6].toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}`;
  const eventTime = (event: any) => {
    const clock = (value: string) => new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${clock(event.startDate)}${event.endDate ? ` – ${clock(event.endDate)}` : ""}`;
  };

  const renderSchedule = () => (
    <div className="space-y-6">
      <PageHead
        title="Schedule"
        sub={batchesLoading ? <SkeletonBar className="h-4 w-72 max-w-full" /> : `Sessions and deadlines on your ${plural(batches.length, "cohort")}`}
        action={<Button className={PRIMARY_BUTTON} onClick={openAddEvent} data-testid="button-add-session">Add a session</Button>}
      />
      <section className={`${PANEL} overflow-hidden`} aria-label="This week" data-testid="trainer-week">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="text-lg font-semibold text-sl-ink">{weekTitle}</h2>
          <div className="flex gap-2">
            <Button variant="outline" className={`${SECONDARY_BUTTON} w-11 px-0`} aria-label="Previous week" onClick={() => setWeekOffset((value) => value - 1)} data-testid="button-week-previous">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="outline" className={SECONDARY_BUTTON} disabled={weekOffset === 0} onClick={() => setWeekOffset(0)} data-testid="button-week-current">This week</Button>
            <Button variant="outline" className={`${SECONDARY_BUTTON} w-11 px-0`} aria-label="Next week" onClick={() => setWeekOffset((value) => value + 1)} data-testid="button-week-next">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        {eventsLoading ? (
          <SkeletonRows label="Loading the week" rows={5} className="border-t border-sl-line" />
        ) : (
          <ol className="border-t border-sl-line">
            {weekDays.map((day) => {
              const isToday = dayKey(day) === todayKey;
              const dayEvents = events
                .filter((event) => dayKey(new Date(event.startDate)) === dayKey(day))
                .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
              return (
                <li key={dayKey(day)} className={`flex flex-wrap gap-x-6 gap-y-2 border-b border-sl-line px-5 py-3 last:border-b-0 ${isToday ? "bg-sl-neutral-soft" : ""}`} aria-current={isToday ? "date" : undefined}>
                  <p className="w-36 shrink-0 font-semibold text-sl-ink">{day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" })}</p>
                  <div className="min-w-0 flex-1 space-y-2">
                    {isToday && <Chip tone="accent">Today</Chip>}
                    {dayEvents.length === 0 && <span className={`text-sm text-sl-muted ${isToday ? "ml-3" : ""}`}>Nothing scheduled</span>}
                    {dayEvents.map((event) => (
                      <div key={event.id} className="flex items-start justify-between gap-3 rounded-lg border border-sl-line bg-sl-surface p-3" data-testid={`event-${event.id}`}>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-semibold text-sl-ink">
                            <Chip>{String(event.eventType).charAt(0).toUpperCase() + String(event.eventType).slice(1)}</Chip>
                            {event.title}
                          </p>
                          <p className="mt-1 text-sm text-sl-muted">{event.cohortName} · {eventTime(event)}</p>
                          {event.description && <p className="text-sm text-sl-muted">{event.description}</p>}
                        </div>
                        <Button
                          variant="outline"
                          className={`${SECONDARY_BUTTON} w-11 shrink-0 px-0 text-sl-risk`}
                          aria-label={`Remove ${event.title}`}
                          onClick={() => deleteEventMutation.mutate(event.id)}
                          data-testid={`button-delete-event-${event.id}`}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );

  const SECTIONS: Record<SectionKey, () => ReactNode> = {
    home: renderHome,
    cohorts: renderCohorts,
    assessments: renderAssessments,
    progress: renderProgress,
    attendance: renderAttendance,
    messages: renderMessages,
    schedule: renderSchedule,
  };

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : ""}
      onLogout={() => logoutMutation.mutate()}
      actions={<TourButton onClick={tour.replay} testId="button-trainer-tour" tone="light" />}
      desk="trainer"
      current={section}
      onNavigate={(key) => goTo(key as SectionKey)}
    >
      {SECTIONS[section]()}

                <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload an assessment</DialogTitle>
                      <DialogDescription>This goes to the Fellow Work page. It is not a quiz.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
{cohortField("task-cohort")}
                      <div className="space-y-2">
                        <Label htmlFor="task-title">Title</Label>
                        <Input id="task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} data-testid="input-task-title" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="task-note">What they should do</Label>
                        <Textarea id="task-note" value={taskNote} onChange={(event) => setTaskNote(event.target.value)} data-testid="input-task-note" />
                      </div>
                      <TeacherAudience teachers={batchDetails?.teachers || []} loading={teachersLoading} selected={quizTeacherIds} onChange={setQuizTeacherIds} />
                      <DeadlineField id="task-deadline" value={deadline} onChange={setDeadline} />
                      <div className="space-y-2">
                        <Label htmlFor="task-file">File</Label>
                        <Input id="task-file" type="file" onChange={(event) => setTaskFile(event.target.files?.[0] || null)} data-testid="input-task-file" />
                      </div>
                      <Button
                        onClick={() => uploadTaskMutation.mutate()}
                        disabled={!taskTitle.trim() || uploadTaskMutation.isPending}
                        data-testid="button-submit-task"
                      >
                        {uploadTaskMutation.isPending ? "Uploading..." : "Give it to the cohort"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                    <Dialog open={writeExamOpen} onOpenChange={(open) => { setWriteExamOpen(open); if (!open) clearExamForm(); }}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Write an exam</DialogTitle>
                          <DialogDescription>Fellows open this as a document and write their answers beside it.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
{cohortField("write-exam-cohort")}
                          <div className="space-y-2">
                            <Label htmlFor="open-exam-title">Title</Label>
                            <Input id="open-exam-title" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} data-testid="input-open-exam-title" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="open-exam-prompt">Exam paper</Label>
                            <Textarea id="open-exam-prompt" value={examPrompt} onChange={(e) => setExamPrompt(e.target.value)} placeholder="Write the questions they will see." data-testid="input-open-exam-prompt" />
                          </div>
                          <TeacherAudience teachers={batchDetails?.teachers || []} loading={teachersLoading} selected={quizTeacherIds} onChange={setQuizTeacherIds} deadline={deadline} onDeadline={setDeadline} />
                          <Button
                            onClick={() => writeExamMutation.mutate()}
                            disabled={!quizTitle.trim() || !examPrompt.trim() || writeExamMutation.isPending}
                            data-testid="button-submit-open-exam"
                          >
                            {writeExamMutation.isPending ? "Assigning..." : "Assign exam"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog open={uploadExamOpen} onOpenChange={(open) => { setUploadExamOpen(open); if (!open) clearExamForm(); }}>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Upload a paper exam</DialogTitle>
                          <DialogDescription>Fellows see the paper on one side and write answers on the other.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
{cohortField("paper-exam-cohort")}
                          <div className="space-y-2">
                            <Label htmlFor="paper-exam-title">Title</Label>
                            <Input id="paper-exam-title" value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} data-testid="input-paper-exam-title" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="paper-exam-file">Paper</Label>
                            <Input
                              id="paper-exam-file"
                              type="file"
                              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.webp"
                              onChange={(e) => setPaperFile(e.target.files?.[0] || null)}
                              data-testid="input-exam-file"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="paper-exam-prompt">Note on the paper (optional)</Label>
                            <Textarea id="paper-exam-prompt" value={examPrompt} onChange={(e) => setExamPrompt(e.target.value)} placeholder="Leave blank to ask them to answer the uploaded paper." />
                          </div>
                          <TeacherAudience teachers={batchDetails?.teachers || []} loading={teachersLoading} selected={quizTeacherIds} onChange={setQuizTeacherIds} deadline={deadline} onDeadline={setDeadline} />
                          <Button
                            onClick={() => uploadExamMutation.mutate()}
                            disabled={!quizTitle.trim() || !paperFile || uploadExamMutation.isPending}
                            data-testid="button-submit-paper-exam"
                          >
                            {uploadExamMutation.isPending ? "Uploading..." : "Assign paper"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                      <Dialog open={assignCheckpointQuizOpen} onOpenChange={setAssignCheckpointQuizOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign module quiz</DialogTitle>
                            <DialogDescription>Generate and assign a new module quiz</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
{cohortField("checkpoint-cohort")}
                            <div className="space-y-2">
                              <Label htmlFor="quiz-title">Quiz Title</Label>
                              <Input
                                id="quiz-title"
                                data-testid="input-quiz-title"
                                placeholder="e.g., Module 1 quiz"
                                value={quizTitle}
                                onChange={(e) => setQuizTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="quiz-description">Description (Optional)</Label>
                              <Textarea
                                id="quiz-description"
                                data-testid="input-quiz-description"
                                placeholder="Quiz description..."
                                value={quizDescription}
                                onChange={(e) => setQuizDescription(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="week-select">Select module</Label>
                              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                                <SelectTrigger id="week-select" data-testid="select-week">
                                  <SelectValue placeholder="Choose a module..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weeks.map((week: any) => (
                                    <SelectItem key={week.id} value={week.id}>
                                      Module {week.weekNumber} - {week.competencyFocus}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="num-questions">Number of Questions</Label>
                              <Input
                                id="num-questions"
                                data-testid="input-num-questions"
                                type="number"
                                min="1"
                                max="20"
                                value={numQuestions}
                                onChange={(e) => setNumQuestions(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="pass-mark">Pass mark (%)</Label>
                              <Input
                                id="pass-mark"
                                type="number"
                                min="1"
                                max="100"
                                value={passMark}
                                onChange={(e) => setPassMark(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="own-question">Your own question</Label>
                              <Textarea
                                id="own-question"
                                data-testid="input-own-question"
                                placeholder="Leave blank to build the quiz from the lesson. A true/false statement here is assigned with no AI."
                                value={ownQuestion}
                                onChange={(e) => setOwnQuestion(e.target.value)}
                              />
                              <p className="text-xs text-sl-muted">Correct answer is True. Works even when no model key is set.</p>
                            </div>
                            <TeacherAudience
                              teachers={batchDetails?.teachers || []}
                              loading={teachersLoading}
                              selected={quizTeacherIds}
                              onChange={setQuizTeacherIds}
                              deadline={deadline}
                              onDeadline={setDeadline}
                            />
                            <Button
                              onClick={handleAssignCheckpointQuiz}
                              disabled={!selectedWeek || !quizTitle || assignQuizMutation.isPending}
                              data-testid="button-submit-checkpoint-quiz"
                            >
                              {assignQuizMutation.isPending ? "Assigning..." : "Assign Quiz"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={assignFileQuizOpen} onOpenChange={setAssignFileQuizOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign File Quiz</DialogTitle>
                            <DialogDescription>Generate a quiz from presentation files</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
{cohortField("file-quiz-cohort")}
                            <div className="space-y-2">
                              <Label htmlFor="file-quiz-title">Quiz Title</Label>
                              <Input
                                id="file-quiz-title"
                                data-testid="input-file-quiz-title"
                                placeholder="e.g., File Quiz 1"
                                value={quizTitle}
                                onChange={(e) => setQuizTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-quiz-description">Description (Optional)</Label>
                              <Textarea
                                id="file-quiz-description"
                                data-testid="input-file-quiz-description"
                                placeholder="Quiz description..."
                                value={quizDescription}
                                onChange={(e) => setQuizDescription(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-week-select">Select module</Label>
                              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                                <SelectTrigger id="file-week-select" data-testid="select-file-week">
                                  <SelectValue placeholder="Choose a module..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weeks.map((week: any) => (
                                    <SelectItem key={week.id} value={week.id}>
                                      Module {week.weekNumber} - {week.competencyFocus}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-select">Select File</Label>
                              <Select value={selectedFileId} onValueChange={setSelectedFileId}>
                                <SelectTrigger id="file-select" data-testid="select-file">
                                  <SelectValue placeholder="Choose a file..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weekFiles.map((file: any) => (
                                    <SelectItem key={file.id} value={file.id}>
                                      {file.fileName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-num-questions">Number of Questions</Label>
                              <Input
                                id="file-num-questions"
                                data-testid="input-file-num-questions"
                                type="number"
                                min="1"
                                max="20"
                                value={numQuestions}
                                onChange={(e) => setNumQuestions(e.target.value)}
                              />
                            </div>
                            <TeacherAudience
                              teachers={batchDetails?.teachers || []}
                              loading={teachersLoading}
                              selected={quizTeacherIds}
                              onChange={setQuizTeacherIds}
                              deadline={deadline}
                              onDeadline={setDeadline}
                            />
                            <Button
                              onClick={handleAssignFileQuiz}
                              disabled={!selectedWeek || !selectedFileId || !quizTitle || assignFileQuizMutation.isPending}
                              data-testid="button-submit-file-quiz"
                            >
                              {assignFileQuizMutation.isPending ? "Assigning..." : "Assign Quiz"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    <Dialog open={addTeacherOpen} onOpenChange={setAddTeacherOpen}>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add Fellows to {selectedBatch?.name}</DialogTitle>
                          <DialogDescription>Search by Fellow ID, name, or email. Select one or more Fellows to add at once.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          {/* Quick add by ID/email/name */}
                          <div className="space-y-2">
                            <Label htmlFor="teacher-id">Quick Add by ID, Name, or Email</Label>
                            <div className="flex gap-2">
                              <Input
                                id="teacher-id"
                                data-testid="input-teacher-id"
                                type="text"
                                placeholder="e.g., 7101, Ali Hassan, ali@school.com"
                                value={teacherId}
                                onChange={(e) => setTeacherId(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddTeacher()}
                              />
                              <Button
                                type="button"
                                onClick={handleAddTeacher}
                                disabled={!teacherId || addTeacherMutation.isPending}
                                data-testid="button-submit-teacher"
                                size="sm"
                              >
                                {addTeacherMutation.isPending ? "..." : "Add"}
                              </Button>
                            </div>
                          </div>

                          <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-sl-muted">or select multiple</span></div>
                          </div>

                          {/* Bulk select */}
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-sl-muted" />
                              <Input
                                placeholder="Search Fellows..."
                                value={teacherSearch}
                                onChange={(e) => setTeacherSearch(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                            <ScrollArea className="h-48 border rounded-md">
                              <div className="p-2 space-y-1">
                                {searchLoading ? (
                                  <SkeletonRows label="Searching Fellows" rows={3} />
                                ) : searchedTeachers.length === 0 ? (
                                  <p className="text-sm text-sl-muted text-center py-4">No Fellows found</p>
                                ) : (
                                  searchedTeachers.map((t: any) => {
                                    const alreadyEnrolled = batchDetails?.teachers?.some((bt: any) => bt.id === t.id);
                                    const checked = selectedTeacherIds.includes(t.id);
                                    return (
                                      <label key={t.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-sl-neutral-soft ${alreadyEnrolled ? "opacity-50" : ""}`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={alreadyEnrolled}
                                          onChange={(e) => {
                                            setSelectedTeacherIds(prev =>
                                              e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                                            );
                                          }}
                                          className="h-4 w-4"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{t.name}</div>
                                          <div className="text-xs text-sl-muted">ID: {t.teacherId} · {t.email}</div>
                                        </div>
                                        {alreadyEnrolled && <Badge variant="secondary" className="text-xs">Enrolled</Badge>}
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </ScrollArea>
                            {selectedTeacherIds.length > 0 && (
                              <Button
                                type="button"
                                className="w-full"
                                onClick={() => bulkAddTeachersMutation.mutate({ batchId: selectedBatch.id, teacherIds: selectedTeacherIds })}
                                disabled={bulkAddTeachersMutation.isPending}
                              >
                                {bulkAddTeachersMutation.isPending ? "Adding..." : `Add Selected (${selectedTeacherIds.length})`}
                              </Button>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
      {/* Quiz Teacher Attempts Dialog */}
      <Dialog open={quizAttemptsOpen} onOpenChange={setQuizAttemptsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fellow attempts — {selectedQuizForAttempts?.title}</DialogTitle>
            <DialogDescription>
              Reset a Fellow's attempts to let them retake the quiz.
            </DialogDescription>
          </DialogHeader>
          {quizAttemptsLoading ? (
            <SkeletonRows label="Loading attempts" rows={3} />
          ) : quizTeacherAttempts.length === 0 ? (
            <p className="text-center py-6 text-sl-muted text-sm">No Fellows have attempted this quiz yet.</p>
          ) : (
            <div className="space-y-2">
              {quizTeacherAttempts.map((t: any) => (
                <div key={t.teacherId} className="flex items-center justify-between border rounded px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{t.teacherName}</p>
                    <p className="text-xs text-sl-muted">{t.teacherEmail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={t.passed ? "default" : t.exhausted ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {t.passed ? "Passed" : t.exhausted ? "Exhausted (3/3)" : `${t.attempts}/3 attempts`}
                      </Badge>
                      {t.latestScore !== null && (
                        <span className="text-xs text-sl-muted">Latest: {t.latestScore}%</span>
                      )}
                    </div>
                  </div>
                  {(t.exhausted || (t.attempts > 0 && !t.passed)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetTeacherAttemptsMutation.mutate({ quizId: selectedQuizForAttempts.id, teacherId: t.teacherId })}
                      disabled={resetTeacherAttemptsMutation.isPending}
                    >
                      Reset Attempts
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Edit Dialog */}
      {editingQuiz && (
        <QuizEditDialog
          open={editQuizOpen}
          onClose={() => { setEditQuizOpen(false); setEditingQuiz(null); }}
          quizId={editingQuiz.id}
          quizTitle={editingQuiz.title}
          initialQuestions={editingQuiz.questions ?? []}
          batchId={selectedBatch?.id}
        />
      )}

      {/* View Quiz Details Dialog */}
      <Dialog open={viewQuizDetailsOpen} onOpenChange={setViewQuizDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{quizDetails?.title || "Quiz Details"}</DialogTitle>
            <DialogDescription>
              {quizDetails ? `${quizDetails.description || ""} • ${quizDetails.questions?.length || 0} questions` : ""}
            </DialogDescription>
          </DialogHeader>
          {!quizDetails ? (
            <div className="space-y-4">
              <SkeletonCard label="Loading quiz details" lines={4} />
              <SkeletonCard label="Loading quiz details" lines={4} />
            </div>
          ) : (
            <div className="space-y-4">
              {quizDetails.questions?.map((question: any, index: number) => (
                <Card key={question.id || index}>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold text-base">
                          Question {index + 1}: {question.question}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          {question.type === "true_false" ? "True/False" : "Multiple Choice"}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-sl-muted">Options:</p>
                        <div className="space-y-2">
                          {question.options?.map((option: string, optionIndex: number) => (
                            <div
                              key={optionIndex}
                              className={`p-3 rounded-lg border ${
                                option === question.correctAnswer
                                  ? "bg-sl-done-soft border-sl-done"
                                  : "bg-sl-neutral-soft border-sl-line"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {option === question.correctAnswer && (
                                  <CheckCircle className="h-4 w-4 text-sl-done flex-shrink-0" />
                                )}
                                <span className={option === question.correctAnswer ? "font-semibold text-sl-done" : ""}>
                                  {option}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-sm">
                          <span className="font-semibold text-sl-muted">Correct Answer: </span>
                          <span className="text-sl-done font-semibold">{question.correctAnswer}</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher Attempts Dialog */}
      <Dialog open={viewTeacherAttemptsOpen} onOpenChange={setViewTeacherAttemptsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTeacher?.teacherName} - Quiz Attempts</DialogTitle>
            <DialogDescription>{selectedTeacher?.teacherEmail}</DialogDescription>
          </DialogHeader>
          {(selectedTeacher?.medals || []).length > 0 && <CohortMedals medals={selectedTeacher.medals} />}
          {teacherAttemptsLoading ? (
            <div className="space-y-4">
              <SkeletonCard label="Loading quiz attempts" lines={2} />
              <SkeletonCard label="Loading quiz attempts" lines={2} />
            </div>
          ) : teacherAttempts.length === 0 ? (
            <div className="text-center py-8 text-sl-muted">
              No quiz attempts yet
            </div>
          ) : (
            <div className="space-y-4">
              {teacherAttempts.map((attempt: any) => {
                const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                const passed = attempt.passed === "yes";
                return (
                  <Card key={attempt.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">{attempt.quizTitle}</CardTitle>
                          <CardDescription>
                            {new Date(attempt.completedAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge variant={passed ? "default" : "destructive"}>
                          {percentage}% - {passed ? "Passed" : "Failed"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-sl-muted">Score:</span>
                          <span className="ml-2 font-semibold">{attempt.score}/{attempt.totalQuestions}</span>
                        </div>
                        <div>
                          <span className="text-sl-muted">Attempt:</span>
                          <span className="ml-2 font-semibold">{attempt.attemptNumber}</span>
                        </div>
                      </div>
                      {attempt.quiz?.weekId && selectedTeacher?.id && (
                        <Link
                          href={`/trainer/teachers/${selectedTeacher.id}/weeks/${attempt.quiz.weekId}/content-history`}
                          className="mt-3 inline-block text-sm font-medium text-sl-accent underline"
                          data-testid={`link-content-history-${attempt.id}`}
                        >
                          Lesson file history for this module
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Comment Dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment for {commentTeacher?.name}</DialogTitle>
            <DialogDescription>Provide feedback on this fellow's progress</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={commentCategory} onValueChange={setCommentCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comment</Label>
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Enter your feedback..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!commentText.trim()) {
                    toast({ title: "Error", description: "Comment cannot be empty", variant: "destructive" });
                    return;
                  }
                  addCommentMutation.mutate({
                    teacherId: commentTeacher.id,
                    batchId: selectedBatch.id,
                    comment: commentText,
                    category: commentCategory,
                  });
                }}
                disabled={addCommentMutation.isPending}
              >
                {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disqualify Fellow Dialog */}
      <Dialog open={disqualifyDialogOpen} onOpenChange={setDisqualifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sl-risk">Disqualify {disqualifyTeacher?.name}</DialogTitle>
            <DialogDescription>This action will mark the Fellow as disqualified from this cohort. Please provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for Disqualification</Label>
              <Textarea
                value={disqualifyReason}
                onChange={(e) => setDisqualifyReason(e.target.value)}
                placeholder="Enter the reason for disqualification..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDisqualifyDialogOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!disqualifyReason.trim()) {
                    toast({ title: "Error", description: "Reason is required", variant: "destructive" });
                    return;
                  }
                  disqualifyMutation.mutate({
                    teacherId: disqualifyTeacher.id,
                    batchId: selectedBatch.id,
                    reason: disqualifyReason,
                  });
                }}
                disabled={disqualifyMutation.isPending}
              >
                {disqualifyMutation.isPending ? "Disqualifying..." : "Disqualify Fellow"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add a session */}
      <Dialog open={addEventOpen} onOpenChange={setAddEventOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a session</DialogTitle>
            <DialogDescription>A session is a calendar meeting. Fellows of the cohort see it on their calendar. Deadlines and holidays go here too.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-cohort">Cohort</Label>
              <select id="event-cohort" className={FIELD} value={eventBatchId} onChange={(event) => setEventBatchId(event.target.value)} data-testid="select-event-cohort">
                {batches.map((batch: any) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-title">Title</Label>
              <Input id="event-title" value={newEventTitle} onChange={(e) => setNewEventTitle(e.target.value)} placeholder="e.g. Session 3" data-testid="input-event-title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-type">Type</Label>
              <select id="event-type" className={FIELD} value={newEventType} onChange={(e) => setNewEventType(e.target.value)} data-testid="select-event-type">
                <option value="session">Session</option>
                <option value="assessment">Assessment</option>
                <option value="deadline">Deadline</option>
                <option value="holiday">Holiday</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="event-start">Start date and time</Label>
                <input id="event-start" type="datetime-local" className={FIELD} value={newEventStart} onChange={(e) => setNewEventStart(e.target.value)} data-testid="input-event-start" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="event-end">End date and time (optional)</Label>
                <input id="event-end" type="datetime-local" className={FIELD} value={newEventEnd} onChange={(e) => setNewEventEnd(e.target.value)} data-testid="input-event-end" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-description">Description (optional)</Label>
              <Input id="event-description" value={newEventDesc} onChange={(e) => setNewEventDesc(e.target.value)} placeholder="Additional details..." data-testid="input-event-description" />
            </div>
            {canRunOnlineSessions(user as any) && (
              <fieldset className="space-y-3 rounded-lg border border-sl-line p-3" data-testid="online-session-fields">
                <legend className="px-1 text-sm font-semibold text-sl-ink">Online session</legend>
                <p className="text-[13px] text-sl-muted">As an instructional Trainer you can teach online. Paste a Google Meet or Zoom link, a recorded video, or a materials link. Fellows open them from the timetable.</p>
                <div className="space-y-2">
                  <Label htmlFor="event-meeting">Meeting link (Google Meet, Zoom)</Label>
                  <Input id="event-meeting" type="url" inputMode="url" value={newMeetingUrl} onChange={(e) => setNewMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" data-testid="input-event-meeting" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-video">Video link</Label>
                  <Input id="event-video" type="url" inputMode="url" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} placeholder="https://youtu.be/…" data-testid="input-event-video" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-materials">Materials link</Label>
                  <Input id="event-materials" type="url" inputMode="url" value={newMaterialsUrl} onChange={(e) => setNewMaterialsUrl(e.target.value)} placeholder="https://drive.google.com/…" data-testid="input-event-materials" />
                </div>
              </fieldset>
            )}
            <Button
              className={PRIMARY_BUTTON}
              disabled={createEventMutation.isPending || !eventBatchId || !newEventTitle.trim() || !newEventStart}
              onClick={() => createEventMutation.mutate({
                title: newEventTitle,
                eventType: newEventType,
                // The browser's clock zone travels with the time, so Fellows in another zone see the same moment.
                startDate: new Date(newEventStart).toISOString(),
                endDate: newEventEnd ? new Date(newEventEnd).toISOString() : undefined,
                description: newEventDesc || undefined,
                ...(canRunOnlineSessions(user as any)
                  ? { meetingUrl: newMeetingUrl.trim() || undefined, videoUrl: newVideoUrl.trim() || undefined, materialsUrl: newMaterialsUrl.trim() || undefined }
                  : {}),
              })}
              data-testid="button-submit-event"
            >
              {createEventMutation.isPending ? "Adding..." : "Add to the schedule"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review and approve a lesson file's quiz */}
      {reviewQuiz && isLoadingReviewQuiz && (
        <Dialog open onOpenChange={(open) => { if (!open) setReviewQuiz(null); }}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{reviewQuiz.file_name || "Lesson file"}</DialogTitle>
              <DialogDescription>Review the questions, then approve the quiz.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <SkeletonCard label="Loading the quiz" lines={3} />
              <SkeletonCard label="Loading the quiz" lines={3} />
            </div>
          </DialogContent>
        </Dialog>
      )}
      {reviewQuiz && !isLoadingReviewQuiz && (
        <FileQuizEditDialog
          open
          onClose={() => setReviewQuiz(null)}
          weekId={reviewQuiz.week_id}
          fileId={reviewQuiz.deck_file_id}
          fileName={reviewQuiz.file_name || "Lesson file"}
          initialQuestions={reviewQuizStatus?.[reviewQuiz.deck_file_id]?.questions ?? NO_QUESTIONS}
          approved={Boolean(reviewQuiz.approved)}
          onQuizStatusChange={() => {
            queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "/api/batches" && query.queryKey[2] === "file-quizzes" });
            queryClient.invalidateQueries({ queryKey: ["/api/training-weeks", reviewQuiz.week_id, "quiz-status"] });
          }}
        />
      )}

      <GuidedTour
        open={tour.open}
        steps={TRAINER_TOUR}
        index={tour.index}
        onIndex={tour.setIndex}
        onClose={tour.close}
      />
    </AcademyShell>
  );
}
