import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, FileText, MessageSquare, Award } from "lucide-react";
import { format } from "date-fns";
import { useRoute } from "wouter";

interface TeacherDetail {
  id: string;
  teacherId: number;
  name: string;
  email: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  progress?: number;
  filesViewed?: number;
  courseCompletion?: number;
  completedLessons?: string[];
  activityTimeline?: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
}

export default function AdminTeacherDetail() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/admin/teachers/:id");

  const teacherId = params?.id;

  // Guard: only admins can access this page
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  // Fetch teacher details
  const { data: teacher, isLoading } = useQuery<TeacherDetail>({
    queryKey: ["/api/admin/teachers", teacherId],
    enabled: !!teacherId,
  });

  // Fetch reflections for this teacher
  const { data: reflections } = useQuery<any[]>({
    queryKey: ["/api/reflections/teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const response = await fetch(`/api/reflections/teacher/${teacherId}`);
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch trainer comments for this teacher
  const { data: trainerComments } = useQuery<any[]>({
    queryKey: ["/api/trainer/comments/teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const response = await fetch(`/api/trainer/comments/teacher/${teacherId}`);
      if (!response.ok) return [];
      return await response.json();
    },
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
            onClick={() => navigate("/admin/teachers")}
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

  if (!teacher) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/admin/teachers")}
            className="mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Teacher not found</p>
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
          onClick={() => navigate("/admin/teachers")}
          className="mb-8"
          data-testid="button-back-teachers"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Header */}
        <Card className="p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{teacher.name}</h1>
              <p className="text-muted-foreground">
                ID: {teacher.teacherId} | {teacher.email}
              </p>
            </div>
            <Badge
              variant={
                teacher.approvalStatus === "approved"
                  ? "default"
                  : teacher.approvalStatus === "pending"
                  ? "secondary"
                  : "destructive"
              }
              className="text-sm"
            >
              {teacher.approvalStatus}
            </Badge>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Overall Progress</p>
              <p className="text-2xl font-bold mb-2">{teacher.progress || 0}%</p>
              <Progress value={teacher.progress || 0} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Course Completion</p>
              <p className="text-2xl font-bold">{teacher.courseCompletion || 0}%</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Files Viewed</p>
              <p className="text-2xl font-bold">{teacher.filesViewed || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Joined</p>
              <p className="text-2xl font-bold">
                {format(new Date(teacher.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>

          {/* Last Login */}
          {teacher.lastLogin && (
            <p className="text-sm text-muted-foreground">
              Last active: {format(new Date(teacher.lastLogin), "PPP p")}
            </p>
          )}
        </Card>

        {/* Completed Lessons */}
        {teacher.completedLessons && teacher.completedLessons.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Completed Lessons</h2>
            <div className="space-y-2">
              {teacher.completedLessons.map((lesson, idx) => (
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
        {teacher.activityTimeline && teacher.activityTimeline.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Activity Timeline</h2>
            <div className="space-y-4">
              {teacher.activityTimeline.map((activity, idx) => (
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

        {/* Reflections */}
        {reflections && reflections.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Reflections
            </h2>
            <div className="space-y-3">
              {reflections.map((reflection: any, idx: number) => (
                <div
                  key={reflection.id || idx}
                  className="p-4 bg-muted rounded-lg"
                  data-testid={`reflection-${idx}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {reflection.rating && (
                        <Badge variant="outline">{reflection.rating}/5</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {reflection.submittedAt ? format(new Date(reflection.submittedAt), "MMM d, yyyy") : ""}
                    </p>
                  </div>
                  <p className="text-sm">{reflection.content}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Trainer Comments */}
        {trainerComments && trainerComments.length > 0 && (
          <Card className="p-6 mb-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Trainer Comments
            </h2>
            <div className="space-y-3">
              {trainerComments.map((comment: any, idx: number) => (
                <div
                  key={comment.id || idx}
                  className="p-4 bg-muted rounded-lg"
                  data-testid={`trainer-comment-${idx}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="capitalize">{comment.category}</Badge>
                    <p className="text-sm text-muted-foreground">
                      {comment.createdAt ? format(new Date(comment.createdAt), "MMM d, yyyy") : ""}
                    </p>
                  </div>
                  <p className="text-sm">{comment.comment}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
