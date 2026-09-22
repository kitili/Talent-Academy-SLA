import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Layers, User, ArrowLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";

interface Batch {
  id: string;
  name: string;
  description: string | null;
  createdBy: string;
  trainerId: string | null;
  createdAt: string;
}

interface Trainer {
  id: string;
  username: string;
  email: string;
  role: string;
}

export default function AdminBatches() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [assigningBatchId, setAssigningBatchId] = useState<string | null>(null);

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/batches"],
  });

  const { data: trainers = [] } = useQuery<Trainer[]>({
    queryKey: ["/api/trainers"],
    enabled: user?.role === "admin",
  });

  const assignTrainerMutation = useMutation({
    mutationFn: async ({ batchId, trainerId }: { batchId: string; trainerId: string | null }) => {
      return apiRequest("PUT", `/api/batches/${batchId}/trainer`, { trainerId });
    },
    onSuccess: () => {
      toast({ title: "Trainer assigned successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      setAssigningBatchId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign trainer",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const getTrainerName = (trainerId: string | null) => {
    if (!trainerId) return null;
    const trainer = trainers.find((t) => t.id === trainerId);
    return trainer ? trainer.username : "Unknown";
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            Only administrators can access this page.
          </p>
          <Button onClick={() => navigate("/")} variant="outline" data-testid="button-go-home">
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin")}
            className="mb-4"
            data-testid="button-back-admin"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Trainer Dashboard
          </Button>
          <h1 className="text-3xl font-bold mb-2">Batch Management</h1>
          <p className="text-muted-foreground">
            View all batches and assign trainers to manage them
          </p>
        </div>

        {batchesLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading batches...</div>
        ) : batches.length === 0 ? (
          <Card className="p-8 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Batches Yet</h3>
            <p className="text-muted-foreground">
              Trainers can create batches from the Batch Management page.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {batches.map((batch) => (
              <Card
                key={batch.id}
                className="p-4 sm:p-6"
                data-testid={`card-batch-${batch.id}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-lg font-semibold" data-testid={`text-batch-name-${batch.id}`}>{batch.name}</h3>
                    </div>
                    {batch.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {batch.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Assigned Trainer:</span>
                        {batch.trainerId ? (
                          <Badge variant="secondary" data-testid={`badge-trainer-${batch.id}`}>
                            {getTrainerName(batch.trainerId)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Not Assigned
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {assigningBatchId === batch.id ? (
                      <div className="flex items-center gap-2">
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
                          <SelectTrigger className="w-[200px]" data-testid={`select-trainer-${batch.id}`}>
                            <SelectValue placeholder="Select trainer..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" data-testid={`select-trainer-none-${batch.id}`}>No Trainer</SelectItem>
                            {trainers.map((trainer) => (
                              <SelectItem key={trainer.id} value={trainer.id} data-testid={`select-trainer-${trainer.id}-${batch.id}`}>
                                {trainer.username} ({trainer.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAssigningBatchId(null)}
                          disabled={assignTrainerMutation.isPending}
                          data-testid={`button-cancel-assign-${batch.id}`}
                        >
                          {assignTrainerMutation.isPending ? "Saving..." : "Cancel"}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAssigningBatchId(batch.id)}
                          data-testid={`button-assign-trainer-${batch.id}`}
                        >
                          {batch.trainerId ? "Change Trainer" : "Assign Trainer"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/trainer/batches?view=${batch.id}`)}
                          data-testid={`button-view-batch-${batch.id}`}
                        >
                          <ChevronRight className="h-5 w-5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
