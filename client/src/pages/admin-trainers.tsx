import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Trainer {
  id: string;
  username: string;
  email?: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  progress?: number;
  filesCompleted?: number;
}

export default function AdminTrainers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Guard: only admins can access this page
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const { data: trainers, isLoading } = useQuery<Trainer[]>({
    queryKey: ["/api/admin/trainers"],
  });

  const createTrainerMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users/create", { ...data, role: "trainer" });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trainer Created",
        description: "The trainer has been added successfully.",
      });
      setIsDialogOpen(false);
      setFormData({ name: "", email: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trainers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create trainer",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    if (formData.password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    createTrainerMutation.mutate(formData);
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-muted-foreground">
            Only administrators can access this page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/admin")}
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Trainers</h1>
              <p className="text-muted-foreground">
                Manage all trainers in the system
              </p>
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-trainer">
                <Plus className="h-4 w-4 mr-2" />
                Add Trainer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Trainer</DialogTitle>
                <DialogDescription>
                  Create a new trainer account. The trainer will be automatically approved.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-trainer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-trainer-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password (min 6 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    data-testid="input-trainer-password"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel-trainer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTrainerMutation.isPending}
                    data-testid="button-submit-trainer"
                  >
                    {createTrainerMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Trainer"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-24" />
            ))}
          </div>
        ) : trainers && trainers.length > 0 ? (
          <div className="space-y-4">
            {trainers.map((trainer) => (
              <Card
                key={trainer.id}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/trainers/${trainer.id}`)}
                data-testid={`card-trainer-${trainer.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold">{trainer.username}</h3>
                        <p className="text-sm text-muted-foreground">
                          {trainer.email || "No email"}
                        </p>
                      </div>
                      <Badge
                        variant={
                          trainer.approvalStatus === "approved"
                            ? "default"
                            : trainer.approvalStatus === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {trainer.approvalStatus}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Progress
                        </p>
                        <p className="text-sm font-semibold">
                          {trainer.progress || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Files Completed
                        </p>
                        <p className="text-sm font-semibold">
                          {trainer.filesCompleted || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Last Active
                        </p>
                        <p className="text-sm font-semibold">
                          {trainer.lastLogin
                            ? format(new Date(trainer.lastLogin), "MMM d")
                            : "Never"}
                        </p>
                      </div>
                    </div>

                    <Progress value={trainer.progress || 0} className="h-2" />
                  </div>

                  <ChevronRight className="h-5 w-5 text-muted-foreground ml-4 flex-shrink-0 mt-1" />
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No trainers found</p>
          </Card>
        )}
      </div>
    </div>
  );
}
