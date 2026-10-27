import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";
import { AcademyShell } from "@/components/AcademyShell";
import { BatchApprovalHistory } from "@/components/BatchApprovalHistory";
import {
  AccessDenied,
  Chip,
  MoreActions,
  PageHeader,
  SkeletonRows,
  TabBar,
  cardClass,
  cohortFellows,
  cohortHasTrainer,
  emptyStepNumbers,
  inputClass,
  linkClass,
  orderedSteps,
  plural,
  primaryButton,
  secondaryButton,
  type PathCohort,
  type PathCourse,
  type PathPayload,
  type PathStep,
} from "@/components/AdminParts";
import { ACADEMY_TERMS, batchHoldingCourse, nextBatchName } from "@shared/academyPath";
import { deskName } from "@shared/deskName";

type CourseRow = PathCourse;
type StepRow = PathStep;
type CohortRow = PathCohort;
type AssignedQuiz = { id: string; title: string; status?: string | null };

const DESCRIPTION_CUT = 180;

export default function AdminBatches() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const [tab, setTab] = useState<"cohorts" | "courses">("cohorts");
  const [cohortOpen, setCohortOpen] = useState(false);
  const [cohortName, setCohortName] = useState("");
  const [cohortDescription, setCohortDescription] = useState("");
  const [cohortTrack, setCohortTrack] = useState("primary");
  const [editingCohort, setEditingCohort] = useState<CohortRow | null>(null);
  const [courseName, setCourseName] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [editingCourse, setEditingCourse] = useState<CourseRow | null>(null);
  const [batchName, setBatchName] = useState<Record<string, string>>({});
  const [editingBatch, setEditingBatch] = useState<StepRow | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [cohortQuery, setCohortQuery] = useState("");
  const [quizListFor, setQuizListFor] = useState<string | null>(null);
  const [trainersFor, setTrainersFor] = useState<string | null>(null);
  const [rosterFor, setRosterFor] = useState<string | null>(null);
  const [addStepFor, setAddStepFor] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishValue, setFinishValue] = useState("1");
  const [termsOpen, setTermsOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });

  const { data: quizzes = [] } = useQuery<AssignedQuiz[]>({
    queryKey: ["/api/batches", quizListFor || "none", "quizzes"],
    enabled: !!quizListFor,
  });

  // Links from Home and the people pages arrive as /admin/batches?cohort=<id> or ?add=1; react when they change.
  const params = new URLSearchParams(search);
  const wantedCohort = params.get("cohort");
  const wantsAdd = params.get("add") === "1";
  useEffect(() => {
    if (wantedCohort) setPickedId(wantedCohort);
  }, [wantedCohort]);
  useEffect(() => {
    if (wantsAdd) {
      setCohortOpen(true);
      navigate("/admin/batches", { replace: true });
    }
  }, [wantsAdd, navigate]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/academy-path"] });
    queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
    if (quizListFor) queryClient.invalidateQueries({ queryKey: ["/api/batches", quizListFor, "quizzes"] });
  };

  const fail = (error: Error, title: string) => {
    toast({ title, description: error.message, variant: "destructive" });
  };

  const createCohort = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/batches", {
        name: cohortName.trim(),
        description: cohortDescription.trim(),
        track: cohortTrack,
      });
      return res.json();
    },
    onSuccess: () => {
      setCohortOpen(false);
      setCohortName("");
      setCohortDescription("");
      toast({ title: "Cohort added" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the cohort"),
  });

  const updateCohort = useMutation({
    mutationFn: async (cohort: CohortRow) => {
      await apiRequest("PATCH", `/api/batches/${cohort.id}`, {
        name: cohort.name,
        description: cohort.description,
      });
    },
    onSuccess: () => {
      setEditingCohort(null);
      toast({ title: "Cohort updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the cohort"),
  });

  const removeCohort = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/batches/${id}`);
    },
    onSuccess: () => {
      setPickedId(null);
      toast({ title: "Cohort removed" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not remove the cohort"),
  });

  const saveTrainers = useMutation({
    mutationFn: async ({ cohortId, trainerIds }: { cohortId: string; trainerIds: string[] }) => {
      await apiRequest("PUT", `/api/admin/academy-path/cohorts/${cohortId}/trainers`, { trainerIds });
    },
    onSuccess: () => {
      toast({ title: "Trainers updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not save the trainers"),
  });

  const saveBatchTeachers = useMutation({
    mutationFn: async ({ batchId, teacherIds }: { batchId: string; teacherIds: string[] }) => {
      await apiRequest("PUT", `/api/admin/academy-path/batches/${batchId}/teachers`, { teacherIds });
    },
    onSuccess: () => {
      toast({ title: "Fellows updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not save the Fellows"),
  });

  // How many cohorts a Fellow finishes (the academy setting the server already keeps).
  const saveRequired = useMutation({
    mutationFn: async (cohortsRequired: number) => {
      await apiRequest("PUT", "/api/admin/academy-path", { cohortsRequired });
    },
    onSuccess: () => {
      setFinishOpen(false);
      toast({ title: "Finishing rule updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not save how many cohorts a Fellow finishes"),
  });

  const accessMutation = useMutation({
    mutationFn: async ({ batchId, patch }: { batchId: string; patch: { status?: string; quizzesStatus?: string } }) => {
      await apiRequest("PATCH", `/api/batches/${batchId}/access`, patch);
    },
    onSuccess: () => {
      toast({ title: "Cohort access updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the cohort"),
  });

  const quizStatusMutation = useMutation({
    mutationFn: async ({ quizId, status }: { quizId: string; status: "open" | "stopped" }) => {
      await apiRequest("PATCH", `/api/assigned-quizzes/${quizId}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Quiz updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the quiz"),
  });

  const createBatch = useMutation({
    mutationFn: async ({ cohortId, name }: { cohortId: string; name: string }) => {
      const res = await apiRequest("POST", `/api/admin/academy-path/cohorts/${cohortId}/batches`, { name });
      return res.json();
    },
    onSuccess: (_data, { cohortId }) => {
      setBatchName((current) => ({ ...current, [cohortId]: "" }));
      setAddStepFor(null);
      toast({ title: "Step added" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the step"),
  });

  const moveBatch = useMutation({
    mutationFn: async ({ batchId, direction }: { batchId: string; direction: "earlier" | "later" }) => {
      await apiRequest("PATCH", `/api/admin/academy-path/batches/${batchId}/order`, { direction });
    },
    onSuccess: () => refresh(),
    onError: (error: Error) => fail(error, "Could not reorder the step"),
  });

  const updateBatch = useMutation({
    mutationFn: async (batch: StepRow) => {
      await apiRequest("PATCH", `/api/admin/academy-path/batches/${batch.id}`, {
        name: batch.name,
        description: batch.description,
      });
    },
    onSuccess: () => {
      setEditingBatch(null);
      toast({ title: "Step updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the step"),
  });

  const removeBatch = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/academy-path/batches/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Step removed" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not remove the step"),
  });

  const addCourseToBatch = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      await apiRequest("POST", `/api/admin/academy-path/batches/${batchId}/courses`, { courseId });
    },
    onSuccess: () => {
      toast({ title: "Course placed on the step" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the course"),
  });

  const removeCourseFromBatch = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      await apiRequest("DELETE", `/api/admin/academy-path/batches/${batchId}/courses/${courseId}`);
    },
    onSuccess: () => {
      toast({ title: "Course removed from the step" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not remove the course"),
  });

  const createCourse = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/courses", {
        name: courseName.trim(),
        description: courseDescription.trim(),
        publishStatus: "published",
        orderIndex: data?.courses.length || 0,
      });
      return res.json();
    },
    onSuccess: () => {
      setCourseName("");
      setCourseDescription("");
      toast({ title: "Course added" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the course"),
  });

  const updateCourse = useMutation({
    mutationFn: async (course: CourseRow) => {
      await apiRequest("PATCH", `/api/courses/${course.id}`, {
        name: course.name,
        description: course.description,
      });
    },
    onSuccess: () => {
      setEditingCourse(null);
      toast({ title: "Course updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the course"),
  });

  const removeCourse = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/courses/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Course removed" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not remove the course"),
  });

  if (user?.role !== "admin") {
    return (
      <AccessDenied>
        <button type="button" className={`${secondaryButton} mt-6`} onClick={() => navigate("/")}>
          Go home
        </button>
      </AccessDenied>
    );
  }

  const cohorts = data?.cohorts ?? [];
  const courses = data?.courses ?? [];
  const trainerName = (id: string) => data?.trainers.find((trainer) => trainer.id === id)?.username || "";
  const trainerNames = (cohort: CohortRow) => (cohort.trainerIds || []).map(trainerName).filter(Boolean);
  const needle = cohortQuery.trim().toLowerCase();
  const shown = cohorts.filter((cohort) => !needle || `${cohort.name} ${trainerNames(cohort).join(" ")}`.toLowerCase().includes(needle));
  const selected = cohorts.find((cohort) => cohort.id === pickedId) ?? cohorts[0];

  // The one chip a cohort in the list wears: the worst thing the Admin can fix.
  const listChip = (cohort: CohortRow) => {
    if (!cohortHasTrainer(cohort)) return <Chip tone="risk">No trainer</Chip>;
    const empty = emptyStepNumbers(cohort).length;
    if (empty > 0) return <Chip tone="attention">{empty === 1 ? "1 step without a course" : `${empty} steps without a course`}</Chip>;
    if (cohort.batches.length === 0) return <Chip>No steps yet</Chip>;
    return null;
  };

  const renderCohort = (cohort: CohortRow) => {
    const closed = (cohort.status || "open") === "closed";
    const quizzesStopped = (cohort.quizzesStatus || "open") === "stopped";
    const batches = orderedSteps(cohort);
    const fellows = cohortFellows(cohort);
    const names = trainerNames(cohort);
    const description = cohort.description || "";
    const long = description.length > DESCRIPTION_CUT;
    return (
      <section aria-labelledby="cohort-title" className={`${cardClass} relative flex min-w-0 flex-col gap-6 p-6`} data-testid={`detail-cohort-${cohort.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3.5">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="cohort-title" className="text-[22px] font-semibold leading-tight text-sl-ink">{cohort.name}</h2>
            <div className="flex flex-wrap gap-2">
              <Chip tone={closed ? "neutral" : "done"} testId={`badge-cohort-status-${cohort.id}`}>{closed ? "Closed" : "Open"}</Chip>
              <Chip tone={quizzesStopped ? "neutral" : "done"} testId={`badge-quiz-status-${cohort.id}`}>{quizzesStopped ? "Quizzes stopped" : "Quizzes on"}</Chip>
              {cohort.track && <Chip>{cohort.track === "secondary" ? "Secondary" : "Primary"}</Chip>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={primaryButton} onClick={() => navigate(`/cohorts/${cohort.id}`)} data-testid={`button-open-cohort-${cohort.id}`}>
              Open cohort room
            </button>
            <button type="button" className={secondaryButton} onClick={() => setEditingCohort(cohort)} data-testid={`button-edit-cohort-${cohort.id}`}>
              Edit details
            </button>
            <MoreActions
              testId={`button-more-actions-${cohort.id}`}
              actions={[
                {
                  label: quizzesStopped ? "Open quizzes" : "Stop quizzes…",
                  disabled: accessMutation.isPending,
                  testId: `button-toggle-quizzes-${cohort.id}`,
                  onSelect: () => {
                    if (quizzesStopped || window.confirm(`Stop the quizzes in "${cohort.name}"? Fellows cannot take them until you open them again.`)) {
                      accessMutation.mutate({ batchId: cohort.id, patch: { quizzesStatus: quizzesStopped ? "open" : "stopped" } });
                    }
                  },
                },
                {
                  label: closed ? "Open cohort" : "Close cohort…",
                  disabled: accessMutation.isPending,
                  testId: `button-toggle-cohort-${cohort.id}`,
                  onSelect: () => {
                    if (closed || window.confirm(`Close the cohort "${cohort.name}"? You can open it again.`)) {
                      accessMutation.mutate({ batchId: cohort.id, patch: { status: closed ? "open" : "closed" } });
                    }
                  },
                },
                {
                  label: "Delete cohort…",
                  danger: true,
                  testId: `button-delete-cohort-${cohort.id}`,
                  onSelect: () => {
                    if (window.confirm(`Remove the cohort "${cohort.name}"? Fellows in it lose that room.`)) removeCohort.mutate(cohort.id);
                  },
                },
              ]}
            />
          </div>
        </div>

        {description && (
          <p className="max-w-[560px] text-sm leading-relaxed text-sl-muted">
            {long && !descriptionOpen ? `${description.slice(0, DESCRIPTION_CUT).trimEnd()}… ` : `${description} `}
            {long && (
              <button type="button" className={linkClass} onClick={() => setDescriptionOpen(!descriptionOpen)}>
                {descriptionOpen ? "Show less" : "Show more"}
              </button>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-6">
          <div className="flex flex-1 basis-56 flex-col gap-1.5" data-testid={`trainers-${cohort.id}`}>
            <h3 className="text-[15px] font-semibold text-sl-ink">Trainers</h3>
            {names.length === 0 ? (
              <span className="self-start"><Chip tone="risk">No trainer</Chip></span>
            ) : (
              names.map((name) => <span key={name} className="text-sm text-sl-ink">{name}</span>)
            )}
            <button type="button" className={`${linkClass} w-fit min-h-[44px] text-left text-sm`} onClick={() => setTrainersFor(cohort.id)}>
              Change trainers
            </button>
          </div>
          <div className="flex flex-1 basis-56 flex-col gap-1.5">
            <h3 className="text-[15px] font-semibold text-sl-ink">Fellows</h3>
            <span className="text-sm text-sl-ink">
              {fellows.length === 0
                ? "No Fellows enrolled yet"
                : `${fellows.length} enrolled · ${fellows.slice(0, 3).map((fellow) => fellow.name).join(", ")}${fellows.length > 3 ? ` and ${fellows.length - 3} more` : ""}`}
            </span>
            <button type="button" className={`${linkClass} w-fit min-h-[44px] text-left text-sm`} onClick={() => setRosterFor(cohort.id)} disabled={batches.length === 0}>
              Manage the roster
            </button>
          </div>
          <div className="flex flex-1 basis-56 flex-col gap-1.5">
            <h3 className="text-[15px] font-semibold text-sl-ink">Finishing</h3>
            <span className="text-sm text-sl-ink">A Fellow finishes after {plural(data?.cohortsRequired ?? 1, "cohort")}</span>
            <button
              type="button"
              className={`${linkClass} w-fit min-h-[44px] text-left text-sm`}
              onClick={() => {
                setFinishValue(String(data?.cohortsRequired ?? 1));
                setFinishOpen(true);
              }}
            >
              Change
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[17px] font-semibold text-sl-ink">
              Steps <span className="font-medium text-sl-muted">· run in order</span>
            </h3>
            <button
              type="button"
              className={`${secondaryButton} text-sm text-sl-accent`}
              onClick={() => setAddStepFor(cohort.id)}
              data-testid={`button-open-add-step-${cohort.id}`}
            >
              Add a step
            </button>
          </div>
          {batches.length === 0 ? (
            <p className="text-sm text-sl-muted">No steps in this cohort yet. The first one will be {nextBatchName(0)}.</p>
          ) : (
            <p className="text-sm text-sl-muted" data-testid={`cohort-week-note-${cohort.id}`}>
              One cohort, {plural(batches.length, "step")}. Each step carries the courses a Fellow works through, in this order.
            </p>
          )}
          <ol className="flex flex-col gap-2.5" data-testid={`batch-order-${cohort.id}`}>
            {batches.map((batch, index) => {
              const available = courses.filter((course) => !batchHoldingCourse(batches, course.id));
              return (
                <li key={batch.id} className="flex flex-col gap-2.5 rounded-[10px] border border-sl-line px-4 py-3.5" data-testid={`card-batch-${batch.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2" data-testid={`week-batch-${batch.id}`}>
                    <div className="min-w-0">
                      <span className="text-[15px] font-semibold text-sl-ink">
                        <span>{ACADEMY_TERMS.step.title} {index + 1}</span> · {batch.name}
                      </span>
                      {batch.description && <p className="text-sm text-sl-muted">{batch.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-sl-muted">
                        {batch.courses.length > 0 ? `${plural(batch.courses.length, "course")} · ` : ""}{plural((batch.teachers || []).length, "Fellow")}
                      </span>
                      <MoreActions
                        label="Step actions"
                        actions={[
                          { label: "Move earlier", disabled: index === 0 || moveBatch.isPending, testId: `button-batch-earlier-${batch.id}`, onSelect: () => moveBatch.mutate({ batchId: batch.id, direction: "earlier" }) },
                          { label: "Move later", disabled: index === batches.length - 1 || moveBatch.isPending, testId: `button-batch-later-${batch.id}`, onSelect: () => moveBatch.mutate({ batchId: batch.id, direction: "later" }) },
                          { label: "Edit step", testId: `button-edit-batch-${batch.id}`, onSelect: () => setEditingBatch(batch) },
                          {
                            label: "Remove step…",
                            danger: true,
                            testId: `button-delete-batch-${batch.id}`,
                            onSelect: () => {
                              if (window.confirm(`Remove step "${batch.name}" from this cohort?`)) removeBatch.mutate(batch.id);
                            },
                          },
                        ]}
                      />
                    </div>
                  </div>
                  {batch.courses.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {batch.courses.map((course) => (
                        <span key={course.id} className="inline-flex items-center gap-1 rounded-lg border border-sl-line bg-sl-ground px-2.5 py-1 text-[13px] text-sl-ink">
                          {course.name}
                          <button
                            type="button"
                            className="ml-1 min-h-[24px] min-w-[24px] text-sl-muted hover:text-sl-risk"
                            aria-label={`Remove ${course.name}`}
                            onClick={() => removeCourseFromBatch.mutate({ batchId: batch.id, courseId: course.id })}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {batch.courses.length === 0 && <Chip tone="attention">No course yet</Chip>}
                    {available.length > 0 ? (
                      <Select
                        key={`${batch.id}-${batch.courses.map((course) => course.id).join(",")}`}
                        onValueChange={(courseId) => addCourseToBatch.mutate({ batchId: batch.id, courseId })}
                      >
                        <SelectTrigger
                          className="h-auto min-h-[44px] w-auto gap-1.5 border-0 bg-transparent p-0 text-sm font-semibold text-sl-accent shadow-none focus:ring-sl-accent"
                          data-testid={`select-course-${batch.id}`}
                          aria-label={`Place a course on ${ACADEMY_TERMS.step.title} ${index + 1}`}
                        >
                          <SelectValue placeholder="Place a course" />
                        </SelectTrigger>
                        <SelectContent>
                          {available.map((course) => (
                            <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      batch.courses.length === 0 && <span className="text-sm text-sl-muted">Every course is already placed on a step. Add a course on the Courses tab.</span>
                    )}
                  </div>
                  <p className="text-xs text-sl-muted">These courses sit in step {index + 1}, and in no other step.</p>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-2.5 border-t border-sl-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-sl-ink">Quizzes</h3>
            <button
              type="button"
              className={`${secondaryButton} text-sm`}
              onClick={() => setQuizListFor(quizListFor === cohort.id ? null : cohort.id)}
              data-testid={`button-manage-quizzes-${cohort.id}`}
            >
              {quizListFor === cohort.id ? "Hide quizzes" : "Quiz list"}
            </button>
          </div>
          {quizListFor === cohort.id && (
            <div className="space-y-2 rounded-lg border border-sl-line p-3" data-testid={`quiz-list-${cohort.id}`}>
              {quizzes.length === 0 ? (
                <p className="text-sm text-sl-muted">No assigned quizzes in this cohort yet. Open the room to assign one.</p>
              ) : quizzes.map((quiz) => {
                const stopped = (quiz.status || "open") === "stopped";
                return (
                  <div key={quiz.id} className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-sl-ink">{quiz.title}</p>
                      <p className="text-xs text-sl-muted">{stopped ? "Stopped" : "Open"}</p>
                    </div>
                    <button
                      type="button"
                      className={`${secondaryButton} text-sm`}
                      disabled={quizStatusMutation.isPending}
                      onClick={() => quizStatusMutation.mutate({ quizId: quiz.id, status: stopped ? "open" : "stopped" })}
                      data-testid={`button-quiz-status-${quiz.id}`}
                    >
                      {stopped ? "Open quiz" : "Stop quiz"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <BatchApprovalHistory batchId={cohort.id} />
        </div>
      </section>
    );
  };

  const trainersCohort = cohorts.find((cohort) => cohort.id === trainersFor);
  const rosterCohort = cohorts.find((cohort) => cohort.id === rosterFor);
  const addStepCohort = cohorts.find((cohort) => cohort.id === addStepFor);

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      showAdminNav
      desk="admin"
      current="cohorts"
      onLogout={() => logoutMutation.mutate()}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">Cohorts</h1>
            <TabBar
              label="Cohorts and courses"
              active={tab}
              onSelect={(id) => setTab(id as "cohorts" | "courses")}
              tabs={[
                { id: "cohorts", label: "Cohorts", count: data ? cohorts.length : undefined, testId: "cohorts-tab-cohorts" },
                { id: "courses", label: "Courses", count: data ? courses.length : undefined, testId: "cohorts-tab-courses" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className={`${linkClass} min-h-[44px] text-sm`} onClick={() => setTermsOpen(true)} data-testid="button-how-it-fits">
              How cohorts, steps and courses fit
            </button>
            <button type="button" className={primaryButton} onClick={() => setCohortOpen(true)} data-testid="button-add-cohort">
              Add a cohort
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className={cardClass}><SkeletonRows rows={5} /></div>
        ) : isError ? (
          <div className={`${cardClass} p-6`}>
            <p className="font-semibold text-sl-ink">The cohorts did not load.</p>
            <p className="mt-1 text-sm text-sl-muted">{error instanceof Error ? error.message : "Try again in a moment."}</p>
          </div>
        ) : tab === "cohorts" ? (
          cohorts.length === 0 ? (
            <div className={`${cardClass} flex flex-col items-start gap-3 p-6`}>
              <h2 className="text-lg font-semibold text-sl-ink">No cohorts yet</h2>
              <p className="text-sm text-sl-muted">Add the first group of Fellows. Then add the steps they will go through.</p>
              <button type="button" className={primaryButton} onClick={() => setCohortOpen(true)}>Add a cohort</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <section aria-labelledby="cohort-list" className={`${cardClass} min-w-0 flex-[1_1_300px] overflow-hidden`}>
                <h2 id="cohort-list" className="sr-only">Cohorts</h2>
                <div className="flex flex-col gap-1.5 border-b border-sl-line p-4">
                  <label htmlFor="cohort-search" className="text-[13px] text-sl-muted">Find a cohort</label>
                  <input
                    id="cohort-search"
                    type="search"
                    className={inputClass}
                    placeholder="Name or trainer"
                    value={cohortQuery}
                    onChange={(event) => setCohortQuery(event.target.value)}
                  />
                </div>
                <ul>
                  {shown.map((cohort) => {
                    const trainerCount = (cohort.trainerIds || []).length;
                    const isCurrent = selected?.id === cohort.id;
                    return (
                      <li key={cohort.id} className="border-b border-sl-line last:border-b-0">
                        <button
                          type="button"
                          aria-current={isCurrent ? "true" : undefined}
                          onClick={() => setPickedId(cohort.id)}
                          data-testid={`card-cohort-${cohort.id}`}
                          className={`flex w-full flex-col items-start gap-1.5 px-4 py-3 text-left ${isCurrent ? "bg-sl-accent-soft" : "hover:bg-sl-neutral-soft"}`}
                        >
                          <span className="text-[15px] font-semibold text-sl-ink">{cohort.name}</span>
                          <span className="text-[13px] text-sl-muted">
                            {trainerCount === 0 ? "No trainer" : plural(trainerCount, "trainer")} · {plural(cohortFellows(cohort).length, "Fellow")} ·{" "}
                            <span data-testid={`badge-batch-count-${cohort.id}`}>{plural(cohort.batches.length, "step")}</span>
                          </span>
                          {listChip(cohort)}
                        </button>
                      </li>
                    );
                  })}
                  {shown.length === 0 && <li className="px-4 py-4 text-sm text-sl-muted">No cohort matches “{cohortQuery.trim()}”.</li>}
                </ul>
              </section>
              <div className="min-w-0 flex-[2_1_520px]">{selected && renderCohort(selected)}</div>
            </div>
          )
        ) : (
          <section aria-labelledby="courses-title" className="flex flex-col gap-4">
            <div className={`${cardClass} flex flex-col gap-3 p-5`}>
              <h2 id="courses-title" className="text-lg font-semibold text-sl-ink">New course</h2>
              <p className="text-sm text-sl-muted">Add a course here, then place it on a step. A step can hold more than one Fellow.</p>
              <Label htmlFor="new-course-name" className="sr-only">New course</Label>
              <input
                id="new-course-name"
                className={inputClass}
                placeholder="Course name"
                value={courseName}
                onChange={(event) => setCourseName(event.target.value)}
                data-testid="input-new-course-name"
              />
              <Textarea
                placeholder="What this course teaches"
                value={courseDescription}
                onChange={(event) => setCourseDescription(event.target.value)}
                data-testid="input-new-course-description"
              />
              <button
                type="button"
                className={`${primaryButton} w-fit`}
                disabled={!courseName.trim() || createCourse.isPending}
                onClick={() => createCourse.mutate()}
                data-testid="button-add-course"
              >
                Add course
              </button>
            </div>
            <div className={`${cardClass} overflow-hidden`}>
              {courses.length === 0 ? (
                <p className="px-5 py-4 text-[15px] text-sl-muted">No courses yet. Add one above.</p>
              ) : (
                <ul>
                  {courses.map((course) => {
                    const placed = cohorts.flatMap((cohort) =>
                      orderedSteps(cohort).flatMap((step, index) => (step.courses.some((item) => item.id === course.id) ? [`${cohort.name} · Step ${index + 1}`] : [])),
                    );
                    return (
                      <li key={course.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-line px-5 py-3.5 last:border-b-0" data-testid={`card-course-${course.id}`}>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-sl-ink">
                            {course.name}
                            {course.publishStatus === "draft" && <Chip>Draft</Chip>}
                          </p>
                          <p className="text-sm text-sl-muted">{placed.length > 0 ? placed.join(", ") : "Not placed on a step yet"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" className={secondaryButton} onClick={() => navigate(`/courses/${course.id}`)} data-testid={`button-open-course-${course.id}`}>
                            Open lessons
                          </button>
                          <MoreActions
                            actions={[
                              { label: "Edit details", testId: `button-edit-course-${course.id}`, onSelect: () => setEditingCourse(course) },
                              {
                                label: "Delete course…",
                                danger: true,
                                testId: `button-delete-course-${course.id}`,
                                onSelect: () => {
                                  if (window.confirm(`Remove the course "${course.name}"?`)) removeCourse.mutate(course.id);
                                },
                              },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>

      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How cohorts, steps and courses fit</DialogTitle>
            <DialogDescription>A cohort holds steps that run in order. A step holds courses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(["cohort", "step", "course"] as const).map((key) => (
              <div key={key} className={`${cardClass} p-4`} data-testid={`card-term-${key}`}>
                <p className="mb-1 font-semibold text-sl-ink">{ACADEMY_TERMS[key].title}</p>
                <p className="text-sm text-sl-muted">{ACADEMY_TERMS[key].body}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cohortOpen} onOpenChange={setCohortOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a cohort</DialogTitle>
            <DialogDescription>This is the group. You will add its steps next. They do not have to match any other cohort.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="cohort-name">Name</Label>
              <Input id="cohort-name" value={cohortName} onChange={(event) => setCohortName(event.target.value)} data-testid="input-cohort-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cohort-description">Description</Label>
              <Textarea id="cohort-description" value={cohortDescription} onChange={(event) => setCohortDescription(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Track</Label>
              <Select value={cohortTrack} onValueChange={setCohortTrack}>
                <SelectTrigger data-testid="select-cohort-track">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCohortOpen(false)}>Cancel</Button>
            <Button disabled={!cohortName.trim() || createCohort.isPending} onClick={() => createCohort.mutate()} data-testid="button-save-cohort">
              Add cohort
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCohort} onOpenChange={(open) => !open && setEditingCohort(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit cohort</DialogTitle>
          </DialogHeader>
          {editingCohort && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-cohort-name">Name</Label>
                <Input
                  id="edit-cohort-name"
                  value={editingCohort.name}
                  onChange={(event) => setEditingCohort({ ...editingCohort, name: event.target.value })}
                  data-testid="input-edit-cohort-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cohort-description">Description</Label>
                <Textarea
                  id="edit-cohort-description"
                  value={editingCohort.description || ""}
                  onChange={(event) => setEditingCohort({ ...editingCohort, description: event.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCohort(null)}>Cancel</Button>
            <Button
              disabled={!editingCohort?.name.trim() || updateCohort.isPending}
              onClick={() => editingCohort && updateCohort.mutate(editingCohort)}
              data-testid="button-update-cohort"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!trainersCohort} onOpenChange={(open) => !open && setTrainersFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trainers on {trainersCohort?.name}</DialogTitle>
            <DialogDescription>Tick each trainer who runs this cohort. Each tick is saved at once.</DialogDescription>
          </DialogHeader>
          {trainersCohort && (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {(data?.trainers || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No active trainers yet.</p>
              ) : (data?.trainers || []).map((trainer) => {
                const selectedTrainer = (trainersCohort.trainerIds || []).includes(trainer.id);
                return (
                  <label key={trainer.id} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedTrainer}
                      disabled={saveTrainers.isPending}
                      onCheckedChange={(checked) => {
                        const current = trainersCohort.trainerIds || [];
                        const trainerIds = checked
                          ? [...current, trainer.id]
                          : current.filter((id) => id !== trainer.id);
                        saveTrainers.mutate({ cohortId: trainersCohort.id, trainerIds });
                      }}
                      data-testid={`check-trainer-${trainersCohort.id}-${trainer.id}`}
                    />
                    {trainer.username}
                  </label>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrainersFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rosterCohort} onOpenChange={(open) => !open && setRosterFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Fellows in {rosterCohort?.name}</DialogTitle>
            <DialogDescription>Tick the Fellows on each step. Each tick is saved at once.</DialogDescription>
          </DialogHeader>
          {rosterCohort && orderedSteps(rosterCohort).map((batch, index) => (
            <div key={batch.id} className="space-y-1" data-testid={`teachers-${batch.id}`}>
              <p className="text-sm font-semibold text-sl-ink">{ACADEMY_TERMS.step.title} {index + 1} · {batch.name}</p>
              <p className="mb-2 text-xs text-sl-muted" data-testid={`step-roster-note-${batch.id}`}>
                Ticking a Fellow also adds them to the cohort. Unticking takes them off this step only; they stay in the cohort. To take a Fellow out of the cohort, use Remove on the cohort roster in Analytics.
              </p>
              <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                {(data?.teachers || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active Fellows yet.</p>
                ) : (data?.teachers || []).map((teacher) => {
                  const ticked = (batch.teachers || []).some((row) => row.id === teacher.id);
                  return (
                    <label key={teacher.id} className="flex min-h-[44px] items-center gap-2 text-sm">
                      <Checkbox
                        checked={ticked}
                        disabled={saveBatchTeachers.isPending}
                        onCheckedChange={(checked) => {
                          const current = (batch.teachers || []).map((row) => row.id);
                          const teacherIds = checked
                            ? [...current, teacher.id]
                            : current.filter((id) => id !== teacher.id);
                          saveBatchTeachers.mutate({ batchId: batch.id, teacherIds });
                        }}
                        data-testid={`check-teacher-${batch.id}-${teacher.id}`}
                      />
                      {teacher.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRosterFor(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How many cohorts does a Fellow finish?</DialogTitle>
            <DialogDescription>A Fellow is done after this many cohorts. The Fellowship and Advanced certificates wait for it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cohorts-required">Cohorts</Label>
            <Input id="cohorts-required" type="number" min={1} max={50} value={finishValue} onChange={(event) => setFinishValue(event.target.value)} data-testid="input-cohorts-required" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinishOpen(false)}>Cancel</Button>
            <Button
              disabled={saveRequired.isPending || !(Number(finishValue) >= 1)}
              onClick={() => saveRequired.mutate(Math.floor(Number(finishValue)))}
              data-testid="button-save-cohorts-required"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addStepCohort} onOpenChange={(open) => !open && setAddStepFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a step to {addStepCohort?.name}</DialogTitle>
            <DialogDescription>The new step runs after the last one.</DialogDescription>
          </DialogHeader>
          {addStepCohort && (
            <div className="space-y-2">
              <Label htmlFor="new-step-name">Step name</Label>
              <Input
                id="new-step-name"
                placeholder={nextBatchName(addStepCohort.batches.length)}
                value={batchName[addStepCohort.id] || ""}
                onChange={(event) => setBatchName((current) => ({ ...current, [addStepCohort.id]: event.target.value }))}
                data-testid={`input-batch-name-${addStepCohort.id}`}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStepFor(null)}>Cancel</Button>
            {addStepCohort && (
              <Button
                disabled={createBatch.isPending}
                onClick={() => createBatch.mutate({
                  cohortId: addStepCohort.id,
                  name: (batchName[addStepCohort.id] || "").trim() || nextBatchName(addStepCohort.batches.length),
                })}
                data-testid={`button-add-batch-${addStepCohort.id}`}
              >
                Add {nextBatchName(addStepCohort.batches.length)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBatch} onOpenChange={(open) => !open && setEditingBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit step</DialogTitle>
          </DialogHeader>
          {editingBatch && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-batch-name">Name</Label>
                <Input
                  id="edit-batch-name"
                  value={editingBatch.name}
                  onChange={(event) => setEditingBatch({ ...editingBatch, name: event.target.value })}
                  data-testid="input-edit-batch-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-batch-description">Description</Label>
                <Textarea
                  id="edit-batch-description"
                  value={editingBatch.description || ""}
                  onChange={(event) => setEditingBatch({ ...editingBatch, description: event.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBatch(null)}>Cancel</Button>
            <Button
              disabled={!editingBatch?.name.trim() || updateBatch.isPending}
              onClick={() => editingBatch && updateBatch.mutate(editingBatch)}
              data-testid="button-update-batch"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCourse} onOpenChange={(open) => !open && setEditingCourse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit course</DialogTitle>
          </DialogHeader>
          {editingCourse && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-course-name">Name</Label>
                <Input
                  id="edit-course-name"
                  value={editingCourse.name}
                  onChange={(event) => setEditingCourse({ ...editingCourse, name: event.target.value })}
                  data-testid="input-edit-course-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-course-description">Description</Label>
                <Textarea
                  id="edit-course-description"
                  value={editingCourse.description || ""}
                  onChange={(event) => setEditingCourse({ ...editingCourse, description: event.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCourse(null)}>Cancel</Button>
            <Button
              disabled={!editingCourse?.name.trim() || updateCourse.isPending}
              onClick={() => editingCourse && updateCourse.mutate(editingCourse)}
              data-testid="button-update-course"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AcademyShell>
  );
}
