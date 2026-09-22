import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useRoute } from "wouter";

interface TrainerDetail {
  id: string;
  username: string;
  email?: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  progress?: number;
  filesCompleted?: number;
  completedLessons?: string[];
  activityTimeline?: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
  assignedTeachers?: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export default function AdminTrainerDetail() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/admin/trainers/:id");

  const trainerId = params?.id;

  // Guard: only admins can access this page
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  // Fetch trainer details
  const { data: trainer, isLoading } = useQuery<TrainerDetail>({
    queryKey: ["/api/admin/trainers", trainerId],
    enabled: !!trainerId,
  });

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/admin/trainers")}
            className="mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/admin/trainers")}
            className="mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Trainer not found</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Back Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate("/admin/trainers")}
          className="mb-8"
          data-testid="button-back-trainers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Header */}
        <Card className="p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{trainer.username}</h1>
              <p className="text-muted-foreground">{trainer.email || "No email"}</p>
            </div>
            <Badge
              variant={
                trainer.approvalStatus === "approved"
                  ? "default"
                  : trainer.approvalStatus === "pending"
                  ? "secondary"
                  : "destructive"
              }
              className="text-sm"
            >
              {trainer.approvalStatus}
            </Badge>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Overall Progress</p>
              <p className="text-2xl font-bold mb-2">{trainer.progress || 0}%</p>
              <Progress value={trainer.progress || 0} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Files Completed</p>
              <p className="text-2xl font-bold">{trainer.filesCompleted || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Joined</p>
              <p className="text-2xl font-bold">
                {format(new Date(trainer.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Last Login */}
          {trainer.lastLogin && (
            <p className="text-sm text-muted-foreground">
              Last active: {format(new Date(trainer.lastLogin), "PPP p")}
            </p>
          )}
        </Card>

        {/* Completed Lessons */}
        {trainer.completedLessons && trainer.completedLessons.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Completed Lessons</h2>
            <div className="space-y-2">
              {trainer.completedLessons.map((lesson, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  data-testid={`completed-lesson-${idx}`}
                >
                  <span className="font-medium">{lesson}</span>
                  <Badge variant="outline">Completed</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Activity Timeline */}
        {trainer.activityTimeline && trainer.activityTimeline.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold mb-4">Activity Timeline</h2>
            <div className="space-y-4">
              {trainer.activityTimeline.map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 p-4 bg-muted rounded-lg"
                  data-testid={`activity-${idx}`}
                >
                  <div className="flex-1">
                    <p className="font-medium capitalize">{activity.action}</p>
                    {activity.details && (
                      <p className="text-sm text-muted-foreground">
                        {activity.details}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(activity.timestamp), "MMM d, HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
