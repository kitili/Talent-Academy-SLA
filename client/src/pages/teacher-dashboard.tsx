import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { NotificationBell } from "@/components/NotificationBell";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Award, CheckCircle, LogOut, GraduationCap, ArrowRight, FileText, Star, Calendar, MessageSquare, Target, Lightbulb, TrendingUp, ClipboardCheck, BookOpen } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

export default function TeacherDashboard() {
  const [, setLocation] = useLocation();

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

  const { toast } = useToast();
  const [reflectionWeekId, setReflectionWeekId] = useState("");
  const [reflectionBatchId, setReflectionBatchId] = useState("");
  const [reflectionContent, setReflectionContent] = useState("");
  const [reflectionRating, setReflectionRating] = useState(0);
  const [satisfactionScore, setSatisfactionScore] = useState(0);
  const [satisfactionCourseId, setSatisfactionCourseId] = useState("");

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/teacher/logout", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Logout failed");
      }
    },
    onSuccess: () => {
      setLocation("/auth");
    },
  });

  // Fetch own reflections
  const { data: reflections = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/reflections"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/reflections");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch attendance summary
  const { data: attendanceSummary } = useQuery<any>({
    queryKey: ["/api/teacher/attendance/summary"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/attendance/summary");
      if (!response.ok) return null;
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

  // Create goal mutation
  const createGoalMutation = useMutation({
    mutationFn: async (data: { goalText: string }) => {
      await apiRequest("POST", "/api/teacher/goals", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Goal created successfully" });
      setNewGoalText("");
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

  const getLevelBadgeVariant = (level: string) => {
    if (level === "Advanced") return "default";
    if (level === "Intermediate") return "secondary";
    return "outline";
  };

  // Group weeks by course name and aggregate progress
  const groupedCourses = assignedWeeks.reduce((acc: any, week: any) => {
    const courseName = week.courseName || week.title;
    if (!acc[courseName]) {
      acc[courseName] = {
        courseName,
        weeks: [],
        totalCompleted: 0,
        totalFiles: 0,
      };
    }
    acc[courseName].weeks.push(week);
    acc[courseName].totalCompleted += week.progress?.completed || 0;
    acc[courseName].totalFiles += week.progress?.total || 0;
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header matching Admin dashboard */}
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="h-12 w-12 sm:h-14 sm:w-14 flex items-center justify-center flex-shrink-0 bg-primary rounded-sm p-1">
              <img src={logoImage} alt="Silverleaf Academy Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate" data-testid="text-app-title">
                Silverleaf Academy
              </h1>
              <p className="text-xs sm:text-sm text-white/80 hidden sm:block">
                Training Program Planner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <div className="text-xs sm:text-sm text-white/90 hidden md:block truncate max-w-[200px]" data-testid="text-user-info">
              {teacher?.name} (Teacher ID: {teacher?.teacherId})
            </div>
            <ProfileSettingsDialog
              userType="teacher"
              currentEmail={teacher?.email}
            />
            <NotificationBell />
            <div className="text-white">
              <ThemeToggle />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-logout"
              className="hidden sm:flex bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              data-testid="button-logout-mobile"
              className="sm:hidden h-8 w-8 bg-white/10 hover:bg-white/20 text-white border-white/20"
              aria-label="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold" data-testid="text-welcome">
            Welcome, {teacher?.name}
          </h2>
          <p className="text-muted-foreground">
            Your personalized learning dashboard
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Level</CardTitle>
              <Award className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold" data-testid="text-level">
                <Badge variant={getLevelBadgeVariant(reportCard?.level || "Beginner")} className="text-xs">
                  {reportCard?.level || "Beginner"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Quizzes</CardTitle>
              <CheckCircle className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold" data-testid="text-quizzes-taken">
                {reportCard?.totalQuizzesTaken || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Avg Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold" data-testid="text-average-score">
                {reportCard?.averageScore || 0}%
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Attendance</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {attendanceSummary?.attendance_rate || 0}%
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Modules</CardTitle>
              <BookOpen className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {assignedWeeks.length}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium">Reflections</CardTitle>
              <FileText className="h-4 w-4 text-primary/60" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {reflections.length}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Training Content
            </CardTitle>
            <CardDescription>View course materials and complete quizzes to progress</CardDescription>
          </CardHeader>
          <CardContent>
            {uniqueCourses.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No training weeks assigned yet
              </p>
            ) : (
              <div className="space-y-4">
                {uniqueCourses.map((course: any) => (
                  <Card key={course.courseName} data-testid={`card-course-${course.courseName}`} className="shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 border-border/50 rounded-lg">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{course.courseName}</CardTitle>
                          <CardDescription>
                            {course.weeks.length} module{course.weeks.length !== 1 ? "s" : ""} assigned
                          </CardDescription>
                        </div>
                        <Badge variant={course.aggregateProgress.percentage === 100 ? "default" : "secondary"}>
                          {course.aggregateProgress.completed}/{course.aggregateProgress.total} Completed
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {course.aggregateProgress.total > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Course progress</span>
                            <span className="font-medium">{course.aggregateProgress.percentage}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div 
                              className="bg-primary rounded-full h-2 transition-all duration-300"
                              style={{ width: `${course.aggregateProgress.percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {[...course.weeks].sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0)).map((week: any, index: number) => {
                          const isLocked = !!week.locked;
                          const moduleLabel = week.competencyFocus || `Module ${week.weekNumber || index + 1}`;
                          return (
                            <Button
                              key={week.id}
                              variant={week.progress?.percentage === 100 ? "outline" : "secondary"}
                              onClick={() => {
                                if (isLocked) return;
                                setLocation(`/teacher/week/${week.id}/content`);
                              }}
                              disabled={isLocked}
                              data-testid={`button-view-content-${week.id}`}
                              className="w-full justify-between"
                            >
                              <span className="truncate text-left">
                                {moduleLabel}
                                {week.progress?.total > 0 ? ` · ${week.progress.completed}/${week.progress.total}` : ""}
                              </span>
                              {isLocked ? (
                                <span className="text-xs text-muted-foreground ml-2">Locked</span>
                              ) : week.progress?.percentage === 100 ? (
                                <CheckCircle className="ml-2 h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowRight className="ml-2 h-4 w-4" />
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Course reflection */}
        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Course Reflection
            </CardTitle>
            <CardDescription>Share your learning after completing a module or short course</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assignedWeeks.length > 0 && (
                <div>
                  <Label>Select module</Label>
                  <Select value={reflectionWeekId} onValueChange={(val) => {
                    setReflectionWeekId(val);
                    const week = assignedWeeks.find((w: any) => w.id === val);
                    if (week?.batchId) setReflectionBatchId(week.batchId);
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a module to reflect on..." />
                    </SelectTrigger>
                    <SelectContent>
                      {assignedWeeks.map((week: any) => (
                        <SelectItem key={week.id} value={week.id}>
                          {week.courseName || week.title} - Module {week.weekNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Your Reflection</Label>
                <Textarea
                  value={reflectionContent}
                  onChange={(e) => setReflectionContent(e.target.value)}
                  placeholder="What did you learn in this module? What challenges did you face? What would you do differently?"
                  rows={4}
                />
              </div>
              <div>
                <Label>Self-Rating (1-5)</Label>
                <div className="flex gap-2 mt-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Button
                      key={n}
                      type="button"
                      variant={reflectionRating === n ? "default" : "outline"}
                      size="sm"
                      onClick={() => setReflectionRating(n)}
                      className="w-10 h-10"
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (!reflectionWeekId || !reflectionContent.trim()) {
                    toast({ title: "Error", description: "Please select a week and write your reflection", variant: "destructive" });
                    return;
                  }
                  submitReflectionMutation.mutate({
                    weekId: reflectionWeekId,
                    batchId: reflectionBatchId,
                    content: reflectionContent,
                    rating: reflectionRating || null,
                  });
                }}
                disabled={submitReflectionMutation.isPending}
              >
                {submitReflectionMutation.isPending ? "Submitting..." : "Submit Reflection"}
              </Button>
            </div>

            {/* Previous Reflections */}
            {reflections.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Previous Reflections</h3>
                <div className="space-y-2">
                  {reflections.slice(0, 5).map((r: any) => (
                    <div key={r.id} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        {r.rating && <Badge variant="outline">{r.rating}/5</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <p className="text-sm">{r.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Course Satisfaction Rating */}
        {uniqueCourses.length > 0 && (
          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Rate Your Courses
              </CardTitle>
              <CardDescription>Help us improve by rating your learning experience</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>Select Course</Label>
                  <Select value={satisfactionCourseId} onValueChange={setSatisfactionCourseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a course to rate..." />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCourses.map((course: any) => (
                        <SelectItem key={course.courseName} value={course.courseName}>
                          {course.courseName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Your Rating</Label>
                  <div className="flex gap-2 mt-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={satisfactionScore >= n ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSatisfactionScore(n)}
                        className="w-10 h-10"
                      >
                        <Star className={`h-4 w-4 ${satisfactionScore >= n ? "fill-current" : ""}`} />
                      </Button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
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
                  disabled={submitSatisfactionMutation.isPending}
                >
                  {submitSatisfactionMutation.isPending ? "Submitting..." : "Submit Rating"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress Toward Graduation */}
        {progressSummary && (
          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                Progress Toward Graduation
              </CardTitle>
              <CardDescription>
                Your overall training completion and graduation probability
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${
                    progressSummary.graduationProbability >= 80 ? 'text-green-600' :
                    progressSummary.graduationProbability >= 60 ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {progressSummary.graduationProbability}%
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Graduation Probability</p>
                </div>
                <Progress value={progressSummary.graduationProbability} className="h-3" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.contentCompletion}%</div>
                    <div className="text-muted-foreground text-xs">Content</div>
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.quizPassRate}%</div>
                    <div className="text-muted-foreground text-xs">Quiz Pass Rate</div>
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.attendanceRate}%</div>
                    <div className="text-muted-foreground text-xs">Attendance</div>
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.reflectionCount}</div>
                    <div className="text-muted-foreground text-xs">Reflections</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance Record */}
        {attendanceSummary && (
          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Attendance Record
              </CardTitle>
              <CardDescription>Your training attendance overview</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Attendance Rate</span>
                  <span className="font-bold">{attendanceSummary.attendance_rate || 0}%</span>
                </div>
                <Progress value={parseFloat(attendanceSummary.attendance_rate || '0')} className="h-2" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
                  <div className="p-2 bg-green-50 dark:bg-green-950/30 rounded-lg">
                    <div className="font-semibold text-green-700 dark:text-green-400">{attendanceSummary.present_days || 0}</div>
                    <div className="text-muted-foreground text-xs">Present</div>
                  </div>
                  <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded-lg">
                    <div className="font-semibold text-red-700 dark:text-red-400">{attendanceSummary.absent_days || 0}</div>
                    <div className="text-muted-foreground text-xs">Absent</div>
                  </div>
                  <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                    <div className="font-semibold text-yellow-700 dark:text-yellow-400">{attendanceSummary.late_days || 0}</div>
                    <div className="text-muted-foreground text-xs">Late</div>
                  </div>
                  <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                    <div className="font-semibold text-blue-700 dark:text-blue-400">{attendanceSummary.excused_days || 0}</div>
                    <div className="text-muted-foreground text-xs">Excused</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trainer Feedback (Read-Only) */}
        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Trainer Feedback
            </CardTitle>
            <CardDescription>Comments and feedback from your trainer</CardDescription>
          </CardHeader>
          <CardContent>
            {trainerComments.length === 0 ? (
              <p className="text-muted-foreground text-center py-4 text-sm">No feedback received yet</p>
            ) : (
              <div className="space-y-3">
                {trainerComments.slice(0, 5).map((comment: any) => (
                  <div key={comment.id} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      {comment.category && (
                        <Badge variant="outline" className="text-xs">{comment.category}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {comment.createdAt ? new Date(comment.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="text-sm">{comment.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Improvement Tips */}
        {tips.length > 0 && (
          <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Tips for You
              </CardTitle>
              <CardDescription>Personalized suggestions based on your performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tips.map((tip: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <Badge variant={tip.priority === 'high' ? 'destructive' : tip.priority === 'medium' ? 'secondary' : 'outline'} className="text-xs mt-0.5 flex-shrink-0">
                      {tip.priority}
                    </Badge>
                    <p className="text-sm">{tip.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Goals & Action Items */}
        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goals & Action Items
            </CardTitle>
            <CardDescription>Set personal learning goals and track your progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Textarea
                  value={newGoalText}
                  onChange={(e) => setNewGoalText(e.target.value)}
                  placeholder="What do you want to achieve?"
                  rows={2}
                  className="flex-1"
                />
                <Button
                  onClick={() => {
                    if (!newGoalText.trim()) return;
                    createGoalMutation.mutate({ goalText: newGoalText });
                  }}
                  disabled={createGoalMutation.isPending || !newGoalText.trim()}
                  size="sm"
                  className="self-end"
                >
                  Add
                </Button>
              </div>

              {goals.length === 0 ? (
                <p className="text-muted-foreground text-center py-2 text-sm">No goals set yet</p>
              ) : (
                <div className="space-y-2">
                  {goals.map((goal: any) => (
                    <div key={goal.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                      goal.status === 'completed' ? 'bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-muted border-transparent'
                    }`}>
                      <div className="flex-1">
                        <p className={`text-sm ${goal.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                          {goal.goalText}
                        </p>
                        {goal.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due: {new Date(goal.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {goal.status === 'pending' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => updateGoalMutation.mutate({ id: goal.id, status: 'in_progress' })}>
                            Start
                          </Button>
                        )}
                        {goal.status === 'in_progress' && (
                          <Button size="sm" variant="default" className="h-7 text-xs"
                            onClick={() => updateGoalMutation.mutate({ id: goal.id, status: 'completed' })}>
                            Done
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                          onClick={() => deleteGoalMutation.mutate(goal.id)}>
                          x
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
