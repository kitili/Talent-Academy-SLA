import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { BookOpen, Layers, ArrowLeft, Plus, Trash2, Pencil, Users, ChevronUp, ChevronDown } from "lucide-react";
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
import { ACADEMY_TERMS, batchHoldingCourse, nextBatchName } from "@shared/academyPath";
import { deskName } from "@shared/deskName";

const STEP_TONES = [
  { chip: "bg-[#1d4e89]", wash: "bg-[#e7f0fa]", edge: "border-[#1d4e89]/30" },
  { chip: "bg-[#c47b2b]", wash: "bg-[#fff3e4]", edge: "border-[#c47b2b]/35" },
  { chip: "bg-[#0f7a6c]", wash: "bg-[#e5f5f2]", edge: "border-[#0f7a6c]/30" },
  { chip: "bg-[#9b3d55]", wash: "bg-[#fdecef]", edge: "border-[#9b3d55]/30" },
  { chip: "bg-[#3d6b2f]", wash: "bg-[#eef6ea]", edge: "border-[#3d6b2f]/30" },
];

function stepTone(index: number) {
  return STEP_TONES[index % STEP_TONES.length];
}

type CourseRow = { id: string; name: string; description?: string | null; publishStatus?: string };
type PersonRow = { id: string; name: string; email?: string | null };
type StepRow = { id: string; name: string; description?: string | null; orderIndex?: number; courses: CourseRow[]; teachers?: PersonRow[] };
type CohortRow = {
  id: string;
  name: string;
  description?: string | null;
  track?: string | null;
  trainerId?: string | null;
  trainerIds?: string[];
  status?: string | null;
  quizzesStatus?: string | null;
  batches: StepRow[];
};
type AssignedQuiz = { id: string; title: string; status?: string | null };
type TrainerRow = { id: string; username: string; email?: string | null };
type PathPayload = {
  cohortsRequired: number;
  cohorts: CohortRow[];
  courses: CourseRow[];
  trainers: TrainerRow[];
  teachers?: PersonRow[];
};

export default function AdminBatches() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });

  const { data: quizzes = [] } = useQuery<AssignedQuiz[]>({
    queryKey: ["/api/batches", selectedId || "none", "quizzes"],
    enabled: !!selectedId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/academy-path"] });
    queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedId, "quizzes"] });
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
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access denied</h2>
          <p className="text-muted-foreground mb-6">Only an admin can set cohorts, batches, and the path.</p>
          <Button onClick={() => navigate("/")} variant="outline">Go home</Button>
        </Card>
      </div>
    );
  }

  const cohortCount = data?.cohorts.length ?? 0;

  return (
    <AcademyShell scene="hall" title="Silverleaf Academy" subtitle="Academy path" userLabel={user ? deskName(user) : undefined} showAdminNav>
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back-admin">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to admin desk
        </Button>
        <div className="overflow-hidden rounded-2xl bg-[#102448] text-white shadow-md">
          <div className="h-1.5 bg-gradient-to-r from-[#1d4e89] via-[#c47b2b] to-[#0f7a6c]" />
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-5 sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3d7b0]">Academy path</p>
              <h1 className="text-3xl font-bold mt-1 mb-2">Cohorts, steps, and courses</h1>
              <p className="text-white/80 max-w-2xl">
                Steps follow each other: Step One, then Step Two, and onward. You add the cohorts, the steps, and the courses.
              </p>
            </div>
            <Button onClick={() => setCohortOpen(true)} className="bg-[#c47b2b] text-white hover:bg-[#a86722]" data-testid="button-add-cohort">
              <Plus className="h-4 w-4 mr-2" />
              Add cohort
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {([
          ["cohort", "border-t-[#1d4e89]", "bg-[#e7f0fa] text-[#1d4e89]"],
          ["step", "border-t-[#c47b2b]", "bg-[#fff3e4] text-[#8a5414]"],
          ["course", "border-t-[#0f7a6c]", "bg-[#e5f5f2] text-[#0f7a6c]"],
        ] as const).map(([key, edge, chip]) => (
          <Card key={key} className={`border-t-4 ${edge}`} data-testid={`card-term-${key}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chip}`}>{ACADEMY_TERMS[key].title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ACADEMY_TERMS[key].body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground py-8">Loading the path...</p>
      ) : isError ? (
        <Card className="p-6">
          <p className="font-medium">The path did not load.</p>
          <p className="text-sm text-muted-foreground mt-1">{error instanceof Error ? error.message : "Try again in a moment."}</p>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
          <div className="space-y-4">
            {cohortCount === 0 ? (
              <Card className="p-8 text-center">
                <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold mb-1">No cohorts yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Add the first group of Fellows. Then add the steps they will go through.</p>
                <Button onClick={() => setCohortOpen(true)}>Add cohort</Button>
              </Card>
            ) : data?.cohorts.map((cohort) => {
              const closed = (cohort.status || "open") === "closed";
              const quizzesStopped = (cohort.quizzesStatus || "open") === "stopped";
              const batches = [...cohort.batches].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
              return (
              <Card key={cohort.id} className="overflow-hidden border-[#102448]/10 shadow-sm" data-testid={`card-cohort-${cohort.id}`}>
                <div className={`h-1.5 ${closed ? "bg-[#9b3d55]" : "bg-[#0f7a6c]"}`} />
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                        {cohort.name}
                        {cohort.track && (
                          <Badge className={cohort.track === "secondary" ? "bg-[#c47b2b] text-white hover:bg-[#c47b2b]" : "bg-[#1d4e89] text-white hover:bg-[#1d4e89]"}>
                            {cohort.track === "secondary" ? "Secondary" : "Primary"}
                          </Badge>
                        )}
                        <Badge className="bg-[#102448] text-white hover:bg-[#102448]" data-testid={`badge-batch-count-${cohort.id}`}>
                          {batches.length} {batches.length === 1 ? "batch" : "batches"}
                        </Badge>
                        <Badge className={closed ? "bg-[#9b3d55] text-white hover:bg-[#9b3d55]" : "bg-[#0f7a6c] text-white hover:bg-[#0f7a6c]"} data-testid={`badge-cohort-status-${cohort.id}`}>
                          {closed ? "Closed" : "Open"}
                        </Badge>
                        <Badge className={quizzesStopped ? "bg-[#9b3d55] text-white hover:bg-[#9b3d55]" : "bg-[#1d4e89] text-white hover:bg-[#1d4e89]"} data-testid={`badge-quiz-status-${cohort.id}`}>
                          {quizzesStopped ? "Quizzes stopped" : "Quizzes open"}
                        </Badge>
                      </CardTitle>
                      {cohort.description && <CardDescription className="mt-1">{cohort.description}</CardDescription>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate(`/cohorts/${cohort.id}`)} data-testid={`button-open-cohort-${cohort.id}`}>
                        Open room
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingCohort(cohort)} data-testid={`button-edit-cohort-${cohort.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        if (window.confirm(`Remove the cohort "${cohort.name}"? Fellows in it lose that room.`)) removeCohort.mutate(cohort.id);
                      }} data-testid={`button-delete-cohort-${cohort.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={accessMutation.isPending}
                        onClick={() => accessMutation.mutate({ batchId: cohort.id, patch: { status: closed ? "open" : "closed" } })}
                        data-testid={`button-toggle-cohort-${cohort.id}`}
                      >
                        {closed ? "Open cohort" : "Close cohort"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={accessMutation.isPending}
                        onClick={() => accessMutation.mutate({ batchId: cohort.id, patch: { quizzesStatus: quizzesStopped ? "open" : "stopped" } })}
                        data-testid={`button-toggle-quizzes-${cohort.id}`}
                      >
                        {quizzesStopped ? "Open quizzes" : "Stop quizzes"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedId(selectedId === cohort.id ? null : cohort.id)} data-testid={`button-manage-quizzes-${cohort.id}`}>
                        {selectedId === cohort.id ? "Hide quizzes" : "Quiz list"}
                      </Button>
                    </div>
                  </div>
                  <div className="pt-2" data-testid={`trainers-${cohort.id}`}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      Trainers on this cohort
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {(data?.trainers || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No active trainers yet.</p>
                      ) : (data?.trainers || []).map((trainer) => {
                        const selected = (cohort.trainerIds || []).includes(trainer.id);
                        return (
                          <label key={trainer.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected}
                              disabled={saveTrainers.isPending}
                              onCheckedChange={(checked) => {
                                const current = cohort.trainerIds || [];
                                const trainerIds = checked
                                  ? [...current, trainer.id]
                                  : current.filter((id) => id !== trainer.id);
                                saveTrainers.mutate({ cohortId: cohort.id, trainerIds });
                              }}
                              data-testid={`check-trainer-${cohort.id}-${trainer.id}`}
                            />
                            {trainer.username}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {batches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No steps in this cohort yet. The first one will be {nextBatchName(0)}.</p>
                  ) : (
                    <>
                    <p className="text-sm text-[#243044]" data-testid={`cohort-week-note-${cohort.id}`}>
                      One cohort, {batches.length} {batches.length === 1 ? "step" : "steps"}. Each step carries the courses a Fellow works through, in this order.
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl bg-[#102448]/[0.04] px-3 py-3" data-testid={`batch-order-${cohort.id}`}>
                      {batches.map((batch, index) => (
                        <div key={batch.id} className="flex items-center gap-2">
                          <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-semibold text-white ${stepTone(index).chip}`}>
                            {index + 1}
                          </span>
                          <span className="text-sm font-medium text-[#102448]">{batch.name}</span>
                          {index < batches.length - 1 && <span className="px-1 text-lg leading-none font-bold text-[#c47b2b]" aria-hidden="true">→</span>}
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                  <div className="space-y-3">
                    {batches.map((batch, index) => {
                      const tone = stepTone(index);
                      const available = (data?.courses || []).filter((course) => !batchHoldingCourse(batches, course.id));
                      return (
                        <div key={batch.id} className="relative pl-14" data-testid={`card-batch-${batch.id}`}>
                          {index < batches.length - 1 && (
                            <span className={`absolute left-[18px] top-11 bottom-[-12px] w-1 rounded-full ${tone.chip} opacity-70`} aria-hidden="true" />
                          )}
                          <span className={`absolute left-0 top-3 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${tone.chip}`}>
                            {index + 1}
                          </span>
                          <div className={`rounded-xl border p-3 space-y-2 ${tone.wash} ${tone.edge}`} data-testid={`week-batch-${batch.id}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-[#c47b2b]">{ACADEMY_TERMS.step.title} {index + 1}</p>
                                <p className="font-medium text-[#102448]">{batch.name}</p>
                                <p className="text-xs text-[#3a4a60]">These courses sit in step {index + 1}, and in no other step.</p>
                                {batch.description && <p className="text-sm text-muted-foreground">{batch.description}</p>}
                              </div>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" disabled={index === 0 || moveBatch.isPending} aria-label={`Move ${batch.name} earlier`} onClick={() => moveBatch.mutate({ batchId: batch.id, direction: "earlier" })} data-testid={`button-batch-earlier-${batch.id}`}>
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" disabled={index === batches.length - 1 || moveBatch.isPending} aria-label={`Move ${batch.name} later`} onClick={() => moveBatch.mutate({ batchId: batch.id, direction: "later" })} data-testid={`button-batch-later-${batch.id}`}>
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setEditingBatch(batch)} data-testid={`button-edit-batch-${batch.id}`}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => {
                                  if (window.confirm(`Remove step "${batch.name}" from this cohort?`)) removeBatch.mutate(batch.id);
                                }} data-testid={`button-delete-batch-${batch.id}`}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {batch.courses.map((course) => (
                                <Badge key={course.id} className="gap-1 bg-white text-[#102448] hover:bg-white border border-[#102448]/10">
                                  {course.name}
                                  <button
                                    type="button"
                                    className="ml-1"
                                    aria-label={`Remove ${course.name}`}
                                    onClick={() => removeCourseFromBatch.mutate({ batchId: batch.id, courseId: course.id })}
                                  >
                                    ×
                                  </button>
                                </Badge>
                              ))}
                              {batch.courses.length === 0 && (
                                <span className="text-xs text-muted-foreground">No course on this step yet.</span>
                              )}
                            </div>
                            {available.length > 0 && (
                              <Select
                                key={`${batch.id}-${batch.courses.map((course) => course.id).join(",")}`}
                                onValueChange={(courseId) => addCourseToBatch.mutate({ batchId: batch.id, courseId })}
                              >
                                <SelectTrigger className="bg-white" data-testid={`select-course-${batch.id}`}>
                                  <SelectValue placeholder="Add a course to this step" />
                                </SelectTrigger>
                                <SelectContent>
                                  {available.map((course) => (
                                    <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <div className="pt-1" data-testid={`teachers-${batch.id}`}>
                              <p className="mb-1 text-sm font-medium">Fellows in this step</p>
                              <p className="mb-2 text-xs text-[#3a4a60]" data-testid={`step-roster-note-${batch.id}`}>
                                Ticking a Fellow also adds them to the cohort. Unticking takes them off this step only; they stay in the cohort. To take a Fellow out of the cohort, use Remove on the cohort roster in Analytics.
                              </p>
                              <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
                                {(data?.teachers || []).length === 0 ? (
                                  <p className="text-sm text-muted-foreground">No active Fellows yet.</p>
                                ) : (data?.teachers || []).map((teacher) => {
                                  const selected = (batch.teachers || []).some((row) => row.id === teacher.id);
                                  return (
                                    <label key={teacher.id} className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={selected}
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={nextBatchName(batches.length)}
                      value={batchName[cohort.id] || ""}
                      onChange={(event) => setBatchName((current) => ({ ...current, [cohort.id]: event.target.value }))}
                      data-testid={`input-batch-name-${cohort.id}`}
                    />
                    <Button
                      className="bg-[#1d4e89] text-white hover:bg-[#163a66]"
                      disabled={createBatch.isPending}
                      onClick={() => createBatch.mutate({
                        cohortId: cohort.id,
                        name: (batchName[cohort.id] || "").trim() || nextBatchName(batches.length),
                      })}
                      data-testid={`button-add-batch-${cohort.id}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add {nextBatchName(batches.length)}
                    </Button>
                  </div>
                  {selectedId === cohort.id && (
                    <div className="border rounded-lg p-3 space-y-2" data-testid={`quiz-list-${cohort.id}`}>
                      {quizzes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No assigned quizzes in this cohort yet. Open the room to assign one.</p>
                      ) : quizzes.map((quiz) => {
                        const stopped = (quiz.status || "open") === "stopped";
                        return (
                          <div key={quiz.id} className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-sm">{quiz.title}</p>
                              <p className="text-xs text-muted-foreground">{stopped ? "Stopped" : "Open"}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={quizStatusMutation.isPending}
                              onClick={() => quizStatusMutation.mutate({ quizId: quiz.id, status: stopped ? "open" : "stopped" })}
                              data-testid={`button-quiz-status-${quiz.id}`}
                            >
                              {stopped ? "Open quiz" : "Stop quiz"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <BatchApprovalHistory batchId={cohort.id} />
                </CardContent>
              </Card>
              );
            })}
          </div>

          <Card className="h-fit border-t-4 border-t-[#0f7a6c]">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Courses
              </CardTitle>
              <CardDescription>
                Add a course here, then place it on a step. A step can hold more than one Fellow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-course-name">New course</Label>
                <Input
                  id="new-course-name"
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
                <Button
                  disabled={!courseName.trim() || createCourse.isPending}
                  onClick={() => createCourse.mutate()}
                  data-testid="button-add-course"
                >
                  Add course
                </Button>
              </div>
              <div className="space-y-2">
                {(data?.courses || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">No courses yet.</p>
                )}
                {(data?.courses || []).map((course) => (
                  <div key={course.id} className="flex items-start justify-between gap-2 rounded-md border p-3" data-testid={`card-course-${course.id}`}>
                    <div>
                      <p className="font-medium text-sm">{course.name}</p>
                      {course.publishStatus === "draft" && <Badge variant="outline" className="mt-1">Draft</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/courses/${course.id}`)} data-testid={`button-open-course-${course.id}`} title="Open lessons">
                        <BookOpen className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingCourse(course)} data-testid={`button-edit-course-${course.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (window.confirm(`Remove the course "${course.name}"?`)) removeCourse.mutate(course.id);
                      }} data-testid={`button-delete-course-${course.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
