import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Layers, User, ArrowLeft, Plus, Pencil, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AcademyShell } from "@/components/AcademyShell";
import { BatchApprovalHistory } from "@/components/BatchApprovalHistory";
import { PageStrip, usePager } from "@/components/PageStrip";
import { LEARNING_STAGES } from "@shared/tanzaniaPath";

interface Batch {
  id: string;
  name: string;
  description: string | null;
  stage?: string | null;
  track?: string | null;
  createdBy: string;
  trainerId: string | null;
  status?: string | null;
  quizzesStatus?: string | null;
  teacherCount?: number;
  createdAt: string;
}

interface Trainer {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AssignedQuiz {
  id: string;
  title: string;
  description?: string | null;
  status?: string | null;
}

const emptyForm = {
  name: "",
  description: "",
  stage: "",
  track: "",
  trainerId: "none",
};

export default function AdminBatches() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [assigningBatchId, setAssigningBatchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/batches"],
  });

  const { data: trainers = [] } = useQuery<Trainer[]>({
    queryKey: ["/api/trainers"],
    enabled: user?.role === "admin",
  });

  const { data: quizzes = [] } = useQuery<AssignedQuiz[]>({
    queryKey: ["/api/batches", selectedId || "none", "quizzes"],
    enabled: !!selectedId,
  });

  const batchPager = usePager(batches);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    if (selectedId) queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedId, "quizzes"] });
  };

  const assignTrainerMutation = useMutation({
    mutationFn: async ({ batchId, trainerId }: { batchId: string; trainerId: string | null }) => {
      return apiRequest("PUT", `/api/batches/${batchId}/trainer`, { trainerId });
    },
    onSuccess: () => {
      toast({ title: "Trainer assignment saved" });
      refresh();
      setAssigningBatchId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Could not assign trainer", description: error.message, variant: "destructive" });
    },
  });

  const saveBatchMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        stage: form.stage || null,
        track: form.track || null,
        trainerId: form.trainerId === "none" ? null : form.trainerId,
      };
      if (editing) {
        await apiRequest("PATCH", `/api/batches/${editing.id}`, body);
        await apiRequest("PUT", `/api/batches/${editing.id}/trainer`, { trainerId: body.trainerId });
        return;
      }
      await apiRequest("POST", "/api/batches", body);
    },
    onSuccess: () => {
      toast({ title: editing ? "Cohort updated" : "Cohort added" });
      setEditorOpen(false);
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Could not save cohort", description: error.message, variant: "destructive" });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => apiRequest("DELETE", `/api/batches/${batchId}`),
    onSuccess: () => {
      toast({ title: "Cohort removed" });
      if (batchToDelete?.id === selectedId) setSelectedId(null);
      setBatchToDelete(null);
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Could not remove cohort", description: error.message, variant: "destructive" });
    },
  });

  const accessMutation = useMutation({
    mutationFn: async ({ batchId, patch }: { batchId: string; patch: { status?: string; quizzesStatus?: string } }) => {
      await apiRequest("PATCH", `/api/batches/${batchId}/access`, patch);
    },
    onSuccess: () => {
      toast({ title: "Cohort access updated" });
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Could not update cohort", description: error.message, variant: "destructive" });
    },
  });

  const quizStatusMutation = useMutation({
    mutationFn: async ({ quizId, status }: { quizId: string; status: "open" | "stopped" }) => {
      await apiRequest("PATCH", `/api/assigned-quizzes/${quizId}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Quiz updated" });
      refresh();
    },
    onError: (error: Error) => {
      toast({ title: "Could not update quiz", description: error.message, variant: "destructive" });
    },
  });

  const getTrainerName = (trainerId: string | null) => {
    if (!trainerId) return null;
    const trainer = trainers.find((item) => item.id === trainerId);
    return trainer ? trainer.username : "Unknown";
  };

  const openEditor = (batch?: Batch) => {
    setEditing(batch || null);
    setForm(batch ? {
      name: batch.name,
      description: batch.description || "",
      stage: batch.stage || "",
      track: batch.track || "",
      trainerId: batch.trainerId || "none",
    } : emptyForm);
    setEditorOpen(true);
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-muted-foreground mb-6">Only administrators can access this page.</p>
          <Button onClick={() => navigate("/")} variant="outline" data-testid="button-go-home">Go Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <AcademyShell scene="hall" title="Silverleaf Academy" subtitle="Cohorts" userLabel={user?.username} showAdminNav>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-4" data-testid="button-back-admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to admin desk
          </Button>
          <h1 className="text-3xl font-bold mb-2">Cohorts</h1>
          <p className="text-muted-foreground">
            Add or remove a batch, put a trainer on it, and open or close the cohort and its quizzes.
          </p>
        </div>
        <Button onClick={() => openEditor()} data-testid="button-add-batch">
          <Plus className="h-4 w-4 mr-2" />
          Add cohort
        </Button>
      </div>

      {batchesLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading cohorts...</div>
      ) : batches.length === 0 ? (
        <Card className="p-8 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No cohorts yet</h3>
          <p className="text-muted-foreground mb-4">Add the first batch, then assign the trainer who will coach it.</p>
          <Button onClick={() => openEditor()} data-testid="button-add-first-batch">Add cohort</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {batchPager.slice.map((batch) => {
            const closed = (batch.status || "open") === "closed";
            const quizzesStopped = (batch.quizzesStatus || "open") === "stopped";
            return (
              <Card key={batch.id} className="p-4 sm:p-6 sl-stat-card sl-rise" data-testid={`card-batch-${batch.id}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Layers className="h-5 w-5 text-muted-foreground" />
                        <h3 className="text-lg font-semibold" data-testid={`text-batch-name-${batch.id}`}>{batch.name}</h3>
                        {batch.track && (
                          <Badge variant="secondary">{batch.track === "secondary" ? "Secondary" : "Primary"}</Badge>
                        )}
                        <Badge variant={closed ? "destructive" : "outline"} data-testid={`badge-cohort-status-${batch.id}`}>
                          {closed ? "Closed" : "Open"}
                        </Badge>
                        <Badge variant={quizzesStopped ? "destructive" : "outline"} data-testid={`badge-quiz-status-${batch.id}`}>
                          {quizzesStopped ? "Quizzes stopped" : "Quizzes open"}
                        </Badge>
                      </div>
                      {batch.description && <p className="text-sm text-muted-foreground mb-3">{batch.description}</p>}
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Trainer:</span>
                        {batch.trainerId ? (
                          <Badge variant="secondary" data-testid={`badge-trainer-${batch.id}`}>{getTrainerName(batch.trainerId)}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Not assigned</Badge>
                        )}
                        {typeof batch.teacherCount === "number" && (
                          <span className="text-sm text-muted-foreground">{batch.teacherCount} teachers</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/cohorts/${batch.id}`)} data-testid={`button-open-cohort-${batch.id}`}>
                        Open room
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEditor(batch)} data-testid={`button-edit-batch-${batch.id}`}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setBatchToDelete(batch)} data-testid={`button-delete-batch-${batch.id}`}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>

                  {assigningBatchId === batch.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={batch.trainerId || "none"}
                        onValueChange={(value) => {
                          assignTrainerMutation.mutate({
                            batchId: batch.id,
                            trainerId: value === "none" ? null : value,
                          });
                        }}
                        disabled={assignTrainerMutation.isPending}
                      >
                        <SelectTrigger className="w-[240px]" data-testid={`select-trainer-${batch.id}`}>
                          <SelectValue placeholder="Select trainer..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Remove trainer</SelectItem>
                          {trainers.map((trainer) => (
                            <SelectItem key={trainer.id} value={trainer.id}>
                              {trainer.username} ({trainer.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => setAssigningBatchId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setAssigningBatchId(batch.id)} data-testid={`button-assign-trainer-${batch.id}`}>
                        {batch.trainerId ? "Reassign trainer" : "Assign trainer"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accessMutation.isPending}
                        onClick={() => accessMutation.mutate({ batchId: batch.id, patch: { status: closed ? "open" : "closed" } })}
                        data-testid={`button-toggle-cohort-${batch.id}`}
                      >
                        {closed ? "Open cohort" : "Close cohort"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={accessMutation.isPending}
                        onClick={() => accessMutation.mutate({ batchId: batch.id, patch: { quizzesStatus: quizzesStopped ? "open" : "stopped" } })}
                        data-testid={`button-toggle-quizzes-${batch.id}`}
                      >
                        {quizzesStopped ? "Open quizzes" : "Stop quizzes"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedId(selectedId === batch.id ? null : batch.id)} data-testid={`button-manage-quizzes-${batch.id}`}>
                        {selectedId === batch.id ? "Hide quizzes" : "Quiz list"}
                      </Button>
                    </div>
                  )}

                  {selectedId === batch.id && (
                    <div className="border rounded-lg p-3 space-y-2" data-testid={`quiz-list-${batch.id}`}>
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
                </div>
                <BatchApprovalHistory batchId={batch.id} />
              </Card>
            );
          })}
          <PageStrip page={batchPager.page} pages={batchPager.pages} setPage={batchPager.setPage} />
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit cohort" : "Add cohort"}</DialogTitle>
            <DialogDescription>Name the batch, choose its stage, and assign the trainer who coaches it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cohort-name">Name</Label>
              <Input id="cohort-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-cohort-name" />
            </div>
            <div>
              <Label htmlFor="cohort-description">Description</Label>
              <Textarea id="cohort-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage || "none"} onValueChange={(value) => {
                const stage = LEARNING_STAGES.find((item) => item.id === value);
                setForm({ ...form, stage: value === "none" ? "" : value, track: stage?.track || form.track });
              }}>
                <SelectTrigger data-testid="select-cohort-stage"><SelectValue placeholder="Stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No stage</SelectItem>
                  {LEARNING_STAGES.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Track</Label>
              <Select value={form.track || "none"} onValueChange={(value) => setForm({ ...form, track: value === "none" ? "" : value })}>
                <SelectTrigger data-testid="select-cohort-track"><SelectValue placeholder="Track" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No track</SelectItem>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trainer</Label>
              <Select value={form.trainerId} onValueChange={(value) => setForm({ ...form, trainerId: value })}>
                <SelectTrigger data-testid="select-cohort-trainer"><SelectValue placeholder="Trainer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No trainer</SelectItem>
                  {trainers.map((trainer) => (
                    <SelectItem key={trainer.id} value={trainer.id}>{trainer.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.name.trim() || saveBatchMutation.isPending}
              onClick={() => saveBatchMutation.mutate()}
              data-testid="button-save-cohort"
            >
              {saveBatchMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!batchToDelete} onOpenChange={(open) => !open && setBatchToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this cohort?</AlertDialogTitle>
            <AlertDialogDescription>
              {batchToDelete ? `${batchToDelete.name} and its roster links will be removed.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => batchToDelete && deleteBatchMutation.mutate(batchToDelete.id)}
              data-testid="button-confirm-delete-cohort"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AcademyShell>
  );
}
