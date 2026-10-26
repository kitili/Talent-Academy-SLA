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
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import { Award, CheckCircle, LogOut, GraduationCap, ArrowRight, FileText, Star, Calendar, MessageSquare, Target, Lightbulb, TrendingUp, BookOpen } from "lucide-react";
import { TeacherLearnerNav } from "@/components/TeacherLearnerNav";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import { PlaceBanner, PlaceCover, placeForLabel } from "@/components/PlaceArt";
import { TEACHER_TOUR } from "@shared/guidedTour";
import { DeskMail } from "@/components/DeskMail";
import { ModuleScene } from "@/components/ModuleScene";
import { learningStatus, learningStatusBadgeVariant } from "@shared/learningStatus";
import { CohortMedals } from "@/components/CohortMedals";
import type { Medal } from "@shared/cohortMedals";
import { PageStrip, usePager } from "@/components/PageStrip";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

const TEACHER_TABS = [
  { id: "home", label: "Home" },
  { id: "learning", label: "Learning" },
  { id: "work", label: "Work" },
  { id: "quiz", label: "Quiz" },
  { id: "progress", label: "Progress" },
  { id: "reflect", label: "Reflect" },
  { id: "messages", label: "Messages" },
] as const;

type TeacherTab = (typeof TEACHER_TABS)[number]["id"];

function TeacherSideTabs({ tab, onTab }: { tab: TeacherTab; onTab: (next: TeacherTab) => void }) {
  return (
    <nav aria-label="Fellow pages" data-testid="teacher-sidebar" className="lg:sticky lg:top-24 lg:w-48 shrink-0">
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[#102448]/10 bg-white p-2 dark:border-white/10 dark:bg-[#162033] lg:flex-col lg:overflow-visible">
        {TEACHER_TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              data-testid={`teacher-tab-${item.id}`}
              onClick={() => onTab(item.id)}
              className={`border-b-2 px-3 py-2 text-left text-sm whitespace-nowrap ${
                active
                  ? "border-[#c4842a] font-semibold text-[#17233c] dark:text-[#f6f1e8]"
                  : "border-transparent font-medium text-[#243044] hover:border-[#c4842a]/40 dark:text-[#d7deea]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TeacherPathCard() {
  const { data: path } = useQuery<any>({
    queryKey: ["/api/teacher/academy-path"],
  });
  if (!path) return null;
  return (
    <Card data-testid="card-teacher-path">
      <CardHeader>
        <CardTitle className="text-lg">Cohorts to finish</CardTitle>
        <CardDescription>
          {path.done
            ? `You have finished the ${path.cohortsRequired} cohorts this academy asks for.`
            : `Finish ${path.cohortsRequired} cohorts. You have completed ${path.cohortsCompleted}. ${path.remaining} still to go.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(path.cohorts || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">You are not in a cohort yet. An admin places you in one.</p>
        ) : (path.cohorts || []).map((cohort: any) => (
          <div key={cohort.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{cohort.name}</p>
              <Badge variant="outline">
                {cohort.batches?.length || 0} {(cohort.batches?.length || 0) === 1 ? "step" : "steps"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              This cohort has its own steps. Another cohort can have a different number.
            </p>
            {(cohort.batches || []).length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">No steps in this cohort yet.</p>
            ) : (
              <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                {cohort.batches.map((batch: any, index: number) => {
                  const tone = ["#1d4e89", "#c47b2b", "#0f7a6c", "#9b3d55", "#3d6b2f"][index % 5];
                  const done = (batch.courses || []).filter((course: any) => course.completed).length;
                  const total = (batch.courses || []).length;
                  return (
                    <li key={batch.id} className="flex items-center gap-2">
                      <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold text-white" style={{ background: tone }}>{index + 1}</span>
                      <span>{batch.name}</span>
                      <span className="text-muted-foreground">{done}/{total}</span>
                      {index < cohort.batches.length - 1 && <span className="font-bold text-[#c47b2b]" aria-hidden="true">→</span>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

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
  const { data: medalRows = [] } = useQuery<Array<{ batchId: string; batchName: string; medals: Medal[] }>>({
    queryKey: ["/api/teacher/medals"],
  });
  const { data: deskPeers = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/desk-peers"],
  });

  const { data: deskNotices = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=8");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { toast } = useToast();
  const completeCourse = useMutation({
    mutationFn: async ({ courseId, batchId }: { courseId: string; batchId: string }) => {
      await apiRequest("POST", `/api/teacher/courses/${courseId}/complete`, { batchId });
    },
    onSuccess: () => {
      toast({ title: "Course complete", description: "The next course is open." });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assigned-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/medals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/academy-path"] });
    },
    onError: (error: Error) => {
      toast({ title: "Could not mark the course complete", description: error.message, variant: "destructive" });
    },
  });
  const [reflectionWeekId, setReflectionWeekId] = useState("");
  const [reflectionBatchId, setReflectionBatchId] = useState("");
  const [reflectionContent, setReflectionContent] = useState("");
  const [reflectionRating, setReflectionRating] = useState(0);
  const [satisfactionScore, setSatisfactionScore] = useState(0);
  const [satisfactionCourseId, setSatisfactionCourseId] = useState("");
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackScore, setFeedbackScore] = useState(0);
  const [workDrafts, setWorkDrafts] = useState<Record<string, string>>({});

  const { logoutMutation } = useAuth();
  const tour = useGuidedTour("sla-tour-teacher-v1");
  const [tab, setTab] = useState<TeacherTab>("home");

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash;
      if (hash === "#my-learning") setTab("learning");
      if (hash === "#my-work") setTab("work");
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    if (!tour.open) return;
    const target = TEACHER_TOUR[tour.index]?.target;
    if (target === "teacher-continue") setTab("home");
    if (target === "teacher-learning") setTab("learning");
    if (target === "teacher-progress") setTab("progress");
  }, [tour.open, tour.index]);

  useEffect(() => {
    if (!tour.open) return;
    const target = TEACHER_TOUR[tour.index]?.target;
    if (!target) return;
    const element = document.querySelector(`[data-tour="${target}"]`);
    if (!element) return;
    element.classList.add("sla-tour-target");
    element.scrollIntoView({ block: "center" });
  }, [tour.open, tour.index, tab]);

  // Fetch own reflections
  const { data: reflections = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/reflections"],
    queryFn: async () => {
      const response = await fetch("/api/teacher/reflections");
      if (!response.ok) return [];
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

  const sendFeedback = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/satisfaction-scores", {
        type: "teacher_feedback",
        targetId: "academy",
        targetType: "academy",
        score: feedbackScore,
        comment: feedbackNote,
      });
    },
    onSuccess: () => {
      toast({ title: "Feedback sent", description: "An admin can read this with the other ratings." });
      setFeedbackNote("");
      setFeedbackScore(0);
    },
    onError: (error: Error) => {
      toast({ title: "Could not send feedback", description: error.message, variant: "destructive" });
    },
  });

  const getLevelBadgeVariant = (level: string) => {
    if (level === "Advanced") return "default";
    if (level === "Intermediate") return "secondary";
    return "outline";
  };

  // Group weeks by course name and aggregate progress
  const groupedCourses = assignedWeeks.reduce((acc: any, week: any) => {
    const key = week.courseId || week.courseName || week.title;
    if (!acc[key]) {
      acc[key] = {
        courseId: week.courseId,
        courseName: week.courseName || week.title,
        batchId: week.batchId,
        courseChecked: false,
        canCheckComplete: false,
        weeks: [],
        totalCompleted: 0,
        totalFiles: 0,
      };
    }
    acc[key].weeks.push(week);
    acc[key].batchId = acc[key].batchId || week.batchId;
    acc[key].courseChecked = acc[key].courseChecked || Boolean(week.courseChecked);
    acc[key].canCheckComplete = acc[key].canCheckComplete || Boolean(week.canCheckComplete);
    acc[key].totalCompleted += week.progress?.completed || 0;
    acc[key].totalFiles += week.progress?.total || 0;
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

  const nextLesson = [...assignedWeeks]
    .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0))
    .find((week: any) => !week.locked && (week.progress?.total || 0) > 0 && (week.progress?.percentage || 0) < 100);
  const lastWeekId = typeof window !== "undefined" ? sessionStorage.getItem("sl-last-week") : null;
  const shelfIsEmpty = assignedWeeks.length > 0 && assignedWeeks.every((week: any) => (week.progress?.total || 0) === 0);
  const firstModule = [...assignedWeeks]
    .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0))
    .find((week: any) => !week.locked);
  const resumeWeek =
    assignedWeeks.find((week: any) => week.id === lastWeekId && !week.locked) || nextLesson || (shelfIsEmpty ? firstModule : undefined);

  const { data: upcomingEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/events"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/events");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: skills = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/skills-map"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/skills-map");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: myExams = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/quizzes"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/quizzes", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: myWork = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/assignments"],
    queryFn: async () => {
      const res = await fetch("/api/teacher/assignments");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const submitWork = useMutation({
    mutationFn: async ({ id, response }: { id: string; response: string }) => {
      const res = await apiRequest("POST", `/api/teacher/assignments/${id}/submit`, { response });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Work submitted" });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assignments"] });
    },
    onError: () => toast({ title: "Could not submit work", variant: "destructive" }),
  });

  const assessments = myWork.filter((item: any) => item.kind === "assessment");
  const courseListPager = usePager(uniqueCourses, 6);
  const courseCardPager = usePager(uniqueCourses, 2);
  const eventPager = usePager(upcomingEvents, 5);
  const workPager = usePager(assessments, 4);
  const reflectionPager = usePager(reflections, 4);
  const commentPager = usePager(trainerComments, 4);
  const goalPager = usePager(goals, 5);
  const noticePager = usePager(deskNotices, 4);

  return (
    <div className="sl-page sl-bg-garden min-h-screen">
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
                Fellow desk
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <div className="text-xs sm:text-sm text-white/90 hidden md:block truncate max-w-[200px]" data-testid="text-user-info">
              {teacher?.name} (Fellow ID: {teacher?.teacherId})
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLocation("/teacher/certificates")}
              data-testid="button-teacher-certificates"
              data-tour="teacher-certificates"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <GraduationCap className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Certificates</span>
            </Button>
            <TourButton onClick={tour.replay} testId="button-teacher-tour" />
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

      <div className="sl-sheet sl-frame my-4 sm:my-6 p-4 sm:p-6 pb-20 sm:pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TeacherSideTabs tab={tab} onTab={setTab} />
          <div className="min-w-0 flex-1 space-y-6">
        {tab === "home" && (
        <PlaceBanner
          place="garden"
          title={`Welcome, ${teacher?.name || "Fellow"}`}
          subtitle="Goals you set on Reflect appear here. Lessons, assessments, and quizzes each have their own page."
          titleTestId="text-welcome"
        />
        )}
        {tab === "learning" && <TeacherPathCard />}

        {tab === "messages" && (
          <DeskMail
            peer={deskPeers[0] ? { id: deskPeers[0].id, name: deskPeers[0].name, role: deskPeers[0].role || "trainer" } : null}
            selfLabel={teacher?.name || "Fellow"}
          />
        )}

        {tab === "messages" && deskNotices.length > 0 && (
          <Card className="sl-rise max-w-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">From the academy</CardTitle>
              <CardDescription>Notices from trainers and admin, so you do not miss a change of plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {noticePager.slice.map((note: any) => (
                <div key={note.id} className="rounded-xl border bg-card px-3 py-2">
                  <p className="font-medium">{note.title}</p>
                  <p className="text-sm text-muted-foreground">{note.message}</p>
                </div>
              ))}
              <PageStrip page={noticePager.page} pages={noticePager.pages} setPage={noticePager.setPage} />
            </CardContent>
          </Card>
        )}

        {tab === "home" && (() => {
          const openWork = assessments.filter((item: any) => !(item.my_response || item.myResponse));
          const nextEvent = upcomingEvents[0];
          const items = [
            resumeWeek && {
              key: "lesson",
              title: resumeWeek.competencyFocus || `Module ${resumeWeek.weekNumber}`,
              detail: "Continue the unlocked lesson",
              href: `/teacher/week/${resumeWeek.id}/content`,
            },
            myExams[0] && {
              key: "exam",
              title: myExams[0].title,
              detail: myExams[0].paperUrl ? "Open the paper and write your answers" : "Write this exam on your desk",
              href: `/teacher/exams/${myExams[0].id}`,
            },
            openWork[0] && {
              key: "work",
              title: openWork[0].title,
              detail: "Written work still due",
              href: "#my-work",
            },
            nextEvent && {
              key: "event",
              title: nextEvent.title || "Class",
              detail: nextEvent.startDate
                ? new Date(nextEvent.startDate).toLocaleString()
                : "Upcoming session",
              href: "#my-learning",
            },
          ].filter(Boolean) as Array<{ key: string; title: string; detail: string; href: string }>;
          if (items.length === 0) return null;
          return (
            <Card className="sl-rise border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">To do</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-left hover:border-primary"
                    onClick={() => {
                      if (item.href === "#my-work") setTab("work");
                      else if (item.href === "#my-learning") setTab("learning");
                      else setLocation(item.href);
                    }}
                  >
                    <span>
                      <span className="block font-medium">{item.title}</span>
                      <span className="block text-sm text-muted-foreground">{item.detail}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          );
        })()}

        {tab === "home" && (
        <Card className="sl-continue shadow-lg rounded-xl" data-tour="teacher-continue">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Continue learning
            </CardTitle>
            <CardDescription>
              {shelfIsEmpty
                ? "Your modules are ready. Lesson files can be added as the course is built."
                : resumeWeek
                ? "Jump back into the next unlocked module. Finish it to open the one after."
                : assignedWeeks.length === 0
                  ? "Your trainer has not assigned modules yet. You are in the right place when they do."
                  : "Every assigned module is complete. Brilliant — check certificates or reflections next."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {resumeWeek
                  ? (resumeWeek.competencyFocus || `Module ${resumeWeek.weekNumber}`)
                  : assignedWeeks.length === 0
                    ? "Waiting for your first lesson"
                    : "You are caught up"}
              </p>
              {upcomingEvents[0] && (
                <p className="text-sm text-muted-foreground mt-1">
                  Next session: {upcomingEvents[0].title || "Class"} {upcomingEvents[0].startDate ? `· ${new Date(upcomingEvents[0].startDate).toLocaleString()}` : ""}
                </p>
              )}
            </div>
            {!resumeWeek && assignedWeeks.length > 0 && (
              <Button onClick={() => setLocation("/teacher/certificates")}>Open certificates</Button>
            )}
            {resumeWeek && (
              <Button onClick={() => setLocation(`/teacher/week/${resumeWeek.id}/content`)}>
                {shelfIsEmpty ? "Open" : "Resume"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
        )}

        {tab === "quiz" && (
        <Card className="sl-rise" data-testid="card-teacher-exams">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Quizzes
            </CardTitle>
            <CardDescription>
              Exams your trainer assigns are here. Your course modules are on Learning, and written work is on Work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {myExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exam is assigned to you yet.</p>
            ) : myExams.map((exam: any) => (
              <button
                key={exam.id}
                type="button"
                className="flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2 text-left hover:border-primary"
                onClick={() => setLocation(`/teacher/exams/${exam.id}`)}
                data-testid={`link-exam-${exam.id}`}
              >
                <span>
                  <span className="block font-medium">{exam.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {exam.kind === "paper" ? "Paper exam" : exam.kind === "written" ? "Written exam" : "Quiz"}
                    {exam.dueDate ? ` · Due ${new Date(exam.dueDate).toLocaleString()}` : ""}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
        )}

        {tab === "learning" && medalRows.length > 0 && (
          <Card className="sl-rise" data-testid="card-teacher-medals">
            <CardHeader>
              <CardTitle>Medals</CardTitle>
              <CardDescription>
                Earned from starting, keeping time, answering, passing quizzes, and checking a course complete. A trainer can also give you a star.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {medalRows.map((row) => (
                <div key={row.batchId}>
                  <p className="text-sm font-medium mb-2">{row.batchName}</p>
                  <CohortMedals medals={row.medals || []} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {tab === "learning" && (
        <Card id="my-learning" className="sl-rise sl-stat-card" data-tour="teacher-learning">
          <CardHeader>
            <CardTitle>My learning</CardTitle>
            <CardDescription>
              Assigned courses, progress, and the same status your trainer sees. Check a course complete to open the next one.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {uniqueCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses assigned yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Course</th>
                    <th className="py-2 pr-3 font-medium">Progress</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {courseListPager.slice.map((course: any) => {
                    const anyLocked = course.weeks.some((w: any) => w.locked && (w.progress?.percentage || 0) < 100);
                    const status = course.courseChecked
                      ? "Completed"
                      : learningStatus({
                        percentage: course.aggregateProgress.percentage,
                        locked: anyLocked && course.aggregateProgress.percentage === 0,
                      });
                    return (
                      <tr key={course.courseId || course.courseName} className="border-b last:border-0">
                        <td className="py-3 pr-3 font-medium">{course.courseName}</td>
                        <td className="py-3 pr-3">{course.courseChecked ? 100 : course.aggregateProgress.percentage}%</td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={learningStatusBadgeVariant(status)}>{status}</Badge>
                            {course.canCheckComplete && course.courseId && course.batchId && (
                              <Button
                                size="sm"
                                disabled={completeCourse.isPending}
                                onClick={() => completeCourse.mutate({ courseId: course.courseId, batchId: course.batchId })}
                                data-testid={`button-complete-course-${course.courseId}`}
                              >
                                Mark complete and open the next
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <PageStrip page={courseListPager.page} pages={courseListPager.pages} setPage={courseListPager.setPage} />
          </CardContent>
        </Card>
        )}

        {tab === "work" && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="sl-rise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                My calendar
              </CardTitle>
              <CardDescription>Sessions and deadlines for your cohorts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
              ) : eventPager.slice.map((event: any) => (
                <div key={event.id} className="text-sm">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-muted-foreground">
                    {event.eventType || event.event_type} · {new Date(event.startDate || event.start_date).toLocaleString()}
                  </p>
                </div>
              ))}
              <PageStrip page={eventPager.page} pages={eventPager.pages} setPage={eventPager.setPage} />
            </CardContent>
          </Card>
          <Card id="my-work" className="sl-rise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                My work
              </CardTitle>
              <CardDescription>Assessments your trainer uploaded. Quizzes stay on the Quiz page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {assessments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assessments assigned yet.</p>
              ) : workPager.slice.map((item: any) => {
                const id = item.id;
                const submitted = item.my_response || item.myResponse;
                return (
                  <div key={id} className="space-y-2">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#c47b2b]">Assessment</p>
                    <p className="text-sm text-muted-foreground">{item.instructions}</p>
                    {(item.file_url || item.fileUrl) && (
                      <a className="text-sm font-medium text-primary underline" href={item.file_url || item.fileUrl} target="_blank" rel="noreferrer">
                        Open {item.file_name || item.fileName || "the file"}
                      </a>
                    )}
                    {item.due_date || item.dueDate ? (
                      <p className="text-xs text-muted-foreground">Due {new Date(item.due_date || item.dueDate).toLocaleString()}</p>
                    ) : null}
                    {submitted ? (
                      <div className="space-y-1">
                        <p className="text-sm">Submitted: {submitted}</p>
                        {(item.trainer_score != null || item.trainerScore != null) && (
                          <p className="text-sm font-medium">Mark: {item.trainer_score ?? item.trainerScore}</p>
                        )}
                        {(item.trainer_comment || item.trainerComment) && (
                          <p className="text-sm text-muted-foreground">Trainer: {item.trainer_comment || item.trainerComment}</p>
                        )}
                      </div>
                    ) : (
                      <>
                        <Textarea
                          placeholder="Your response"
                          value={workDrafts[id] || ""}
                          onChange={(e) => setWorkDrafts((current) => ({ ...current, [id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={!workDrafts[id]?.trim() || submitWork.isPending}
                          onClick={() => submitWork.mutate({ id, response: workDrafts[id] })}
                        >
                          Submit
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
              <PageStrip page={workPager.page} pages={workPager.pages} setPage={workPager.setPage} />
            </CardContent>
          </Card>
        </div>
        )}

        {tab === "progress" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4" data-tour="teacher-progress">
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
        )}

        {tab === "progress" && skills.length > 0 && (
          <Card className="shadow-lg border-border/50 rounded-xl sl-rise">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Skills map
              </CardTitle>
              <CardDescription>Coverage from each module’s competency focus</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {skills.map((skill: any) => (
                <div key={skill.competency} className="space-y-1">
                  <div className="flex justify-between text-sm gap-3">
                    <span className="font-medium">{skill.competency}</span>
                    <span className="text-muted-foreground">{skill.completed}/{skill.modules} · {skill.coverage}%</span>
                  </div>
                  <Progress value={skill.coverage || 0} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {tab === "learning" && (
        <Card className="shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-border/50 rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              My courses
            </CardTitle>
            <CardDescription>
              Course → module → lesson. Learn, practise, check understanding, then the next module unlocks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uniqueCourses.length === 0 ? (
              <div className="overflow-hidden rounded-xl border bg-white">
                <PlaceCover place="classroom" className="h-40" />
                <p className="text-muted-foreground text-center py-6 px-4">
                  No courses yet. An admin places a course on your cohort, and it appears here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {courseCardPager.slice.map((course: any) => {
                  const status = learningStatus({ percentage: course.aggregateProgress.percentage });
                  return (
                  <Card key={course.courseId || course.courseName} data-testid={`card-course-${course.courseName}`} className="overflow-hidden shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 border-border/50 rounded-lg sl-stat-card">
                    <PlaceCover place={placeForLabel(course.courseName || "course")} className="h-32" />
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">{course.courseName}</CardTitle>
                          <CardDescription>
                            {course.weeks.length} module{course.weeks.length !== 1 ? "s" : ""} assigned
                          </CardDescription>
                        </div>
                        <Badge variant={learningStatusBadgeVariant(status)}>
                          {status} · {course.aggregateProgress.percentage}%
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
                            <button
                              key={week.id}
                              type="button"
                              onClick={() => {
                                if (isLocked) return;
                                setLocation(`/teacher/week/${week.id}/content`);
                              }}
                              disabled={isLocked}
                              data-testid={`button-view-content-${week.id}`}
                              className="w-full flex items-center gap-3 rounded-lg border border-border/70 bg-background p-2 text-left transition hover:-translate-y-0.5 hover:border-primary/40 disabled:opacity-60 disabled:hover:translate-y-0"
                            >
                              <ModuleScene title={moduleLabel} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{moduleLabel}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {isLocked
                                    ? "Locked until the previous module quiz is passed"
                                    : (week.progress?.total || 0) === 0
                                      ? "Open the module"
                                      : learningStatus({ percentage: week.progress?.percentage || 0 })}
                                  {week.progress?.total > 0 ? ` · ${week.progress.completed}/${week.progress.total} lessons` : ""}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
            <PageStrip page={courseCardPager.page} pages={courseCardPager.pages} setPage={courseCardPager.setPage} />
          </CardContent>
        </Card>
        )}

        {tab === "reflect" && (
        <Card className="border-[#c4842a]/30 bg-white text-[#17233c]" data-testid="card-reflect-goals">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goals & Action Items
            </CardTitle>
            <CardDescription>Set personal learning goals. Filled goals also show on Home.</CardDescription>
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
                  {goalPager.slice.map((goal: any) => (
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
              <PageStrip page={goalPager.page} pages={goalPager.pages} setPage={goalPager.setPage} />
            </div>
          </CardContent>
        </Card>
        )}

        {tab === "reflect" && (
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
                    toast({ title: "Error", description: "Please select a module and write your reflection", variant: "destructive" });
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
                  {reflectionPager.slice.map((r: any) => (
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
                <PageStrip page={reflectionPager.page} pages={reflectionPager.pages} setPage={reflectionPager.setPage} />
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {tab === "reflect" && uniqueCourses.length > 0 && (
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

        {tab === "progress" && progressSummary && (
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
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.contentCompletion}%</div>
                    <div className="text-muted-foreground text-xs">Content</div>
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <div className="font-semibold">{progressSummary.quizPassRate}%</div>
                    <div className="text-muted-foreground text-xs">Quiz Pass Rate</div>
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

        {tab === "reflect" && (
        <>
        <Card className="border-[#1d4e89]/20 bg-[#f7f9fc] text-[#17233c]" data-testid="card-feedback">
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
            <CardDescription className="text-[#3a4a60]">Tell the academy how your learning is going. This is not a quiz and not an assignment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button key={n} type="button" size="sm" variant={feedbackScore === n ? "default" : "outline"} onClick={() => setFeedbackScore(n)} data-testid={`button-feedback-score-${n}`}>
                  {n}
                </Button>
              ))}
            </div>
            <Textarea
              value={feedbackNote}
              onChange={(event) => setFeedbackNote(event.target.value)}
              placeholder="What should we keep, and what should change?"
              rows={4}
              data-testid="input-feedback"
            />
            <Button
              disabled={feedbackScore < 1 || !feedbackNote.trim() || sendFeedback.isPending}
              onClick={() => sendFeedback.mutate()}
              data-testid="button-send-feedback"
            >
              {sendFeedback.isPending ? "Sending…" : "Send feedback"}
            </Button>
          </CardContent>
        </Card>
        <Card className="border-[#102448]/10 bg-white text-[#17233c]">
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
                {commentPager.slice.map((comment: any) => (
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
            <PageStrip page={commentPager.page} pages={commentPager.pages} setPage={commentPager.setPage} />
          </CardContent>
        </Card>

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

        </>
        )}

        {tab === "home" && goals.length > 0 && (
        <Card className="border-[#c4842a]/30 bg-white text-[#17233c]" data-testid="card-home-goals">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Goals & Action Items
            </CardTitle>
            <CardDescription>Goals you set on Reflect</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {goalPager.slice.map((goal: any) => (
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
                  </div>
                </div>
              ))}
              <PageStrip page={goalPager.page} pages={goalPager.pages} setPage={goalPager.setPage} />
            </div>
          </CardContent>
        </Card>
        )}
          </div>
        </div>

        <TeacherLearnerNav />
        <GuidedTour
          open={tour.open}
          steps={TEACHER_TOUR}
          index={tour.index}
          onIndex={tour.setIndex}
          onClose={tour.close}
        />
      </div>
    </div>
  );
}
