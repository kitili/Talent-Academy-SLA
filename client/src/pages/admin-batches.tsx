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
import { BookOpen, Layers, ArrowLeft, Plus, Trash2, Pencil, Users } from "lucide-react";
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
import { AcademyShell } from "@/components/AcademyShell";
import { ACADEMY_TERMS } from "@shared/academyPath";

type CourseRow = { id: string; name: string; description?: string | null; publishStatus?: string };
type StepRow = { id: string; name: string; description?: string | null; courses: CourseRow[] };
type CohortRow = {
  id: string;
  name: string;
  description?: string | null;
  track?: string | null;
  trainerId?: string | null;
  batches: StepRow[];
};
type TrainerRow = { id: string; username: string; email?: string | null };
type PathPayload = {
  cohortsRequired: number;
  cohorts: CohortRow[];
  courses: CourseRow[];
  trainers: TrainerRow[];
};

export default function AdminBatches() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [requiredInput, setRequiredInput] = useState("");
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

  const { data, isLoading, isError, error } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/academy-path"] });
    queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
  };

  const fail = (error: Error, title: string) => {
    toast({ title, description: error.message, variant: "destructive" });
  };

  const saveRequired = useMutation({
    mutationFn: async (cohortsRequired: number) => {
      const res = await apiRequest("PUT", "/api/admin/academy-path", { cohortsRequired });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "That is how many cohorts a teacher finishes." });
      setRequiredInput("");
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not save"),
  });

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

  const assignTrainer = useMutation({
    mutationFn: async ({ cohortId, trainerId }: { cohortId: string; trainerId: string | null }) => {
      await apiRequest("PUT", `/api/batches/${cohortId}/trainer`, { trainerId });
    },
    onSuccess: () => {
      toast({ title: "Trainer updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not assign the trainer"),
  });

  const createBatch = useMutation({
    mutationFn: async (cohortId: string) => {
      const name = (batchName[cohortId] || "").trim();
      const res = await apiRequest("POST", `/api/admin/academy-path/cohorts/${cohortId}/batches`, { name });
      return res.json();
    },
    onSuccess: (_data, cohortId) => {
      setBatchName((current) => ({ ...current, [cohortId]: "" }));
      toast({ title: "Batch added" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the batch"),
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
      toast({ title: "Batch updated" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not update the batch"),
  });

  const removeBatch = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/academy-path/batches/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Batch removed" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not remove the batch"),
  });

  const addCourseToBatch = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      await apiRequest("POST", `/api/admin/academy-path/batches/${batchId}/courses`, { courseId });
    },
    onSuccess: () => {
      toast({ title: "Course placed on the batch" });
      refresh();
    },
    onError: (error: Error) => fail(error, "Could not add the course"),
  });

  const removeCourseFromBatch = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      await apiRequest("DELETE", `/api/admin/academy-path/batches/${batchId}/courses/${courseId}`);
    },
    onSuccess: () => {
      toast({ title: "Course removed from the batch" });
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

  const requiredShown = requiredInput || String(data?.cohortsRequired ?? "");
  const cohortCount = data?.cohorts.length ?? 0;

  return (
    <AcademyShell scene="hall" title="Silverleaf Academy" subtitle="Academy path" userLabel={user?.username}>
      <div className="mb-6">
        <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back-admin">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to admin desk
        </Button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold mb-2">Cohorts, batches, and courses</h1>
            <p className="text-muted-foreground max-w-2xl">
              One place to add all three. You add cohorts and the batches inside them. You and a trainer can add courses. A trainer cannot add a cohort or a batch.
            </p>
          </div>
          <Button onClick={() => setCohortOpen(true)} data-testid="button-add-cohort">
            <Plus className="h-4 w-4 mr-2" />
            Add cohort
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {(["cohort", "batch", "course"] as const).map((key) => (
          <Card key={key} data-testid={`card-term-${key}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{ACADEMY_TERMS[key].title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{ACADEMY_TERMS[key].body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Cohorts to finish</CardTitle>
          <CardDescription>
            A teacher is done after this many cohorts. You currently have {cohortCount}. Cohorts do not have to contain the same batches.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="cohorts-required">Number of cohorts</Label>
            <Input
              id="cohorts-required"
              type="number"
              min={1}
              max={50}
              value={requiredShown}
              onChange={(event) => setRequiredInput(event.target.value)}
              className="w-32"
              data-testid="input-cohorts-required"
            />
          </div>
          <Button
            data-testid="button-save-cohorts-required"
            disabled={saveRequired.isPending || !requiredShown}
            onClick={() => saveRequired.mutate(Number(requiredShown))}
          >
            Save
          </Button>
        </CardContent>
      </Card>

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
                <p className="text-sm text-muted-foreground mb-4">Add the first group of teachers. Then add the batches they will go through.</p>
                <Button onClick={() => setCohortOpen(true)}>Add cohort</Button>
              </Card>
            ) : data?.cohorts.map((cohort) => (
              <Card key={cohort.id} data-testid={`card-cohort-${cohort.id}`}>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2 flex-wrap">
                        {cohort.name}
                        {cohort.track && (
                          <Badge variant="secondary">{cohort.track === "secondary" ? "Secondary" : "Primary"}</Badge>
                        )}
                        <Badge variant="outline" data-testid={`badge-batch-count-${cohort.id}`}>
                          {cohort.batches.length} {cohort.batches.length === 1 ? "batch" : "batches"}
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
                        if (window.confirm(`Remove the cohort "${cohort.name}"? Teachers in it lose that room.`)) removeCohort.mutate(cohort.id);
                      }} data-testid={`button-delete-cohort-${cohort.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={cohort.trainerId || "none"}
                      onValueChange={(value) => assignTrainer.mutate({
                        cohortId: cohort.id,
                        trainerId: value === "none" ? null : value,
                      })}
                    >
                      <SelectTrigger className="w-[240px]" data-testid={`select-trainer-${cohort.id}`}>
                        <SelectValue placeholder="Assign a trainer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No trainer</SelectItem>
                        {(data?.trainers || []).map((trainer) => (
                          <SelectItem key={trainer.id} value={trainer.id}>
                            {trainer.username}{trainer.email ? ` (${trainer.email})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {cohort.batches.length === 0 && (
                    <p className="text-sm text-muted-foreground">No batches in this cohort yet. Add as many as this group needs.</p>
                  )}
                  {cohort.batches.map((batch, index) => (
                    <div key={batch.id} className="rounded-lg border p-3 space-y-2" data-testid={`card-batch-${batch.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">Batch {index + 1}: {batch.name}</p>
                          {batch.description && <p className="text-sm text-muted-foreground">{batch.description}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditingBatch(batch)} data-testid={`button-edit-batch-${batch.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => {
                            if (window.confirm(`Remove batch "${batch.name}" from this cohort?`)) removeBatch.mutate(batch.id);
                          }} data-testid={`button-delete-batch-${batch.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {batch.courses.map((course) => (
                          <Badge key={course.id} variant="secondary" className="gap-1">
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
                          <span className="text-xs text-muted-foreground">No course on this batch yet.</span>
                        )}
                      </div>
                      {(() => {
                        const available = (data?.courses || []).filter((course) => !batch.courses.some((placed) => placed.id === course.id));
                        if (available.length === 0) return null;
                        return (
                          <Select
                            key={`${batch.id}-${batch.courses.map((course) => course.id).join(",")}`}
                            onValueChange={(courseId) => addCourseToBatch.mutate({ batchId: batch.id, courseId })}
                          >
                            <SelectTrigger data-testid={`select-course-${batch.id}`}>
                              <SelectValue placeholder="Add a course to this batch" />
                            </SelectTrigger>
                            <SelectContent>
                              {available.map((course) => (
                                <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      })()}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Name the next batch"
                      value={batchName[cohort.id] || ""}
                      onChange={(event) => setBatchName((current) => ({ ...current, [cohort.id]: event.target.value }))}
                      data-testid={`input-batch-name-${cohort.id}`}
                    />
                    <Button
                      variant="outline"
                      disabled={!(batchName[cohort.id] || "").trim() || createBatch.isPending}
                      onClick={() => createBatch.mutate(cohort.id)}
                      data-testid={`button-add-batch-${cohort.id}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add batch
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Courses
              </CardTitle>
              <CardDescription>
                Add a course here, then place it on a batch. Trainers can also add courses from the Courses page.
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
            <DialogDescription>This is the group. You will add its batches next. They do not have to match any other cohort.</DialogDescription>
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
            <DialogTitle>Edit batch</DialogTitle>
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
