import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { QuizEditDialog } from "@/components/QuizEditDialog";
import { Users, Plus, Trash2, LogOut, Award, BookOpen, CheckCircle, TrendingUp, Home, ChevronDown, ChevronRight, AlertCircle, FileText, X, MessageSquare, Ban, Search, ClipboardCheck, Calendar } from "lucide-react";
import logoImage from "@assets/Screenshot 2025-10-14 214034_1761029433045.png";

export default function TrainerBatches() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [assignCheckpointQuizOpen, setAssignCheckpointQuizOpen] = useState(false);
  const [assignFileQuizOpen, setAssignFileQuizOpen] = useState(false);
  const [viewQuizDetailsOpen, setViewQuizDetailsOpen] = useState(false);
  const [viewTeacherAttemptsOpen, setViewTeacherAttemptsOpen] = useState(false);
  const [editQuizOpen, setEditQuizOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<any>(null);
  const [quizAttemptsOpen, setQuizAttemptsOpen] = useState(false);
  const [selectedQuizForAttempts, setSelectedQuizForAttempts] = useState<any>(null);
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<any>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("teachers");

  const [teacherId, setTeacherId] = useState("");
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [numQuestions, setNumQuestions] = useState("5");
  const [appreciationText, setAppreciationText] = useState("");
  const [adminName1, setAdminName1] = useState("");
  const [adminName2, setAdminName2] = useState("");
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [disqualifyDialogOpen, setDisqualifyDialogOpen] = useState(false);
  const [commentTeacher, setCommentTeacher] = useState<any>(null);
  const [commentText, setCommentText] = useState("");
  const [commentCategory, setCommentCategory] = useState("general");
  const [disqualifyTeacher, setDisqualifyTeacher] = useState<any>(null);
  const [disqualifyReason, setDisqualifyReason] = useState("");

  // Attendance state
  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceRecordsState, setAttendanceRecordsState] = useState<Record<string, string>>({});
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);

  // Schedule / event state
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventType, setNewEventType] = useState("session");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");

  const { data: batches = [] } = useQuery<any[]>({
    queryKey: ["/api/batches"],
  });

  const { data: weeks = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks"],
  });

  // Fetch batch details including teachers
  const { data: batchDetails } = useQuery<any>({
    queryKey: ["/api/batches", selectedBatch?.id],
    enabled: !!selectedBatch?.id,
  });

  // Fetch assigned quizzes for selected batch
  const { data: assignedQuizzes = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "quizzes"],
    enabled: !!selectedBatch?.id,
  });

  // Fetch progress for selected batch - auto-loads and refreshes every 30 seconds
  const { data: batchProgress = [], isLoading: isLoadingProgress } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "progress"],
    enabled: !!selectedBatch?.id,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true, // Refresh when window regains focus
  });

  // Fetch files for selected week (for file quiz generation)
  const { data: weekFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks", selectedWeek, "deck-files"],
    enabled: !!selectedWeek && assignFileQuizOpen,
  });

  // Fetch quiz details for viewing
  const { data: quizDetails } = useQuery<any>({
    queryKey: ["/api/trainer/quizzes", selectedQuizId],
    enabled: !!selectedQuizId && viewQuizDetailsOpen,
  });

  // Fetch pending open-ended reviews
  const { data: pendingReviews = [] } = useQuery<any[]>({
    queryKey: ["/api/trainer/pending-reviews"],
    enabled: !!selectedBatch,
  });

  // Fetch teacher quiz attempts
  const { data: teacherAttempts = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "teachers", selectedTeacher?.id, "quiz-attempts"],
    enabled: !!selectedBatch?.id && !!selectedTeacher?.id && viewTeacherAttemptsOpen,
  });

  // Fetch all teacher attempts for a specific quiz (to show who needs reset)
  const { data: quizTeacherAttempts = [], refetch: refetchQuizAttempts } = useQuery<any[]>({
    queryKey: ["/api/assigned-quizzes", selectedQuizForAttempts?.id, "all-attempts"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assigned-quizzes/${selectedQuizForAttempts?.id}/all-teacher-attempts`);
      return res.json();
    },
    enabled: !!selectedQuizForAttempts?.id && quizAttemptsOpen,
  });

  // Fetch batch certificate template
  const { data: template } = useQuery<any>({
    queryKey: [`/api/batches/${selectedBatch?.id}/certificate-template`],
    enabled: !!selectedBatch?.id && activeTab === "certificates",
  });

  // Fetch batch attendance summary (per teacher)
  const { data: batchAttendanceSummary = [], refetch: refetchAttendance } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "attendance", "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/attendance/summary`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && activeTab === "attendance",
  });

  // Fetch batch attendance by date
  const { data: dailyAttendance = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "attendance", attendanceDate],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/attendance?date=${attendanceDate}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && activeTab === "attendance",
  });

  // Fetch scheduled events for batch
  const { data: batchEvents = [], refetch: refetchEvents } = useQuery<any[]>({
    queryKey: ["/api/batches", selectedBatch?.id, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${selectedBatch?.id}/events`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedBatch?.id && activeTab === "schedule",
  });

  // Search approved teachers for bulk enrollment
  const { data: searchedTeachers = [] } = useQuery<any[]>({
    queryKey: ["/api/teachers/search", teacherSearch],
    queryFn: async () => {
      const url = teacherSearch.trim()
        ? `/api/teachers/search?q=${encodeURIComponent(teacherSearch.trim())}`
        : `/api/teachers/search`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: addTeacherOpen,
  });

  const addTeacherMutation = useMutation({
    mutationFn: async ({ batchId, query }: { batchId: string; query: string }) => {
      // Support ID, email, or name in a single field
      const isNumeric = /^\d+$/.test(query.trim());
      const isEmail = query.includes("@");
      const body = isNumeric
        ? { teacherId: parseInt(query) }
        : isEmail
        ? { teacherEmail: query.trim() }
        : { teacherName: query.trim() };
      const response = await apiRequest("POST", `/api/batches/${batchId}/teachers`, body);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add teacher");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Teacher added to batch" });
      posthog.capture("teacher_added_to_batch", { batchId: selectedBatch?.id });
      setTeacherId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const bulkAddTeachersMutation = useMutation({
    mutationFn: async ({ batchId, teacherIds }: { batchId: string; teacherIds: string[] }) => {
      const response = await apiRequest("POST", `/api/batches/${batchId}/teachers/bulk`, { teacherIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: `Added ${data.added} teacher${data.added !== 1 ? "s" : ""}${data.skipped > 0 ? `, ${data.skipped} already enrolled` : ""}` });
      setAddTeacherOpen(false);
      setSelectedTeacherIds([]);
      setTeacherSearch("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removeTeacherMutation = useMutation({
    mutationFn: async ({ batchId, teacherId }: { batchId: string; teacherId: string }) => {
      await apiRequest("DELETE", `/api/batches/${batchId}/teachers/${teacherId}`);
    },
    onSuccess: (_, { batchId, teacherId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Teacher removed from batch" });
      posthog.capture("teacher_removed_from_batch", { batchId, teacherId });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add trainer comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ teacherId, batchId, comment, category }: { teacherId: string; batchId: string; comment: string; category: string }) => {
      await apiRequest("POST", "/api/trainer/comments", { teacherId, batchId, comment, category });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Comment added successfully" });
      setCommentDialogOpen(false);
      setCommentText("");
      setCommentCategory("general");
      setCommentTeacher(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Disqualify fellow mutation
  const disqualifyMutation = useMutation({
    mutationFn: async ({ teacherId, batchId, reason }: { teacherId: string; batchId: string; reason: string }) => {
      await apiRequest("POST", `/api/fellows/${teacherId}/disqualify`, { batchId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id] });
      toast({ title: "Success", description: "Fellow disqualified" });
      setDisqualifyDialogOpen(false);
      setDisqualifyReason("");
      setDisqualifyTeacher(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Submit attendance for the selected date
  const submitAttendanceMutation = useMutation({
    mutationFn: async ({ batchId, date, records }: { batchId: string; date: string; records: Array<{ teacherId: string; status: string }> }) => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/attendance`, { date, records });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Attendance marked successfully" });
      refetchAttendance();
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "attendance"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Create scheduled event
  const createEventMutation = useMutation({
    mutationFn: async (data: { title: string; eventType: string; startDate: string; endDate?: string; description?: string }) => {
      const res = await apiRequest("POST", `/api/batches/${selectedBatch?.id}/events`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Event scheduled" });
      refetchEvents();
      setNewEventTitle(""); setNewEventType("session"); setNewEventStart(""); setNewEventEnd(""); setNewEventDesc("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete event
  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      refetchEvents();
      toast({ title: "Deleted", description: "Event removed" });
    },
  });

  const assignQuizMutation = useMutation({
    mutationFn: async (data: {
      batchId: string;
      weekId: string;
      title: string;
      description: string;
      numQuestions: number;
    }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-quiz`, {
        weekId: data.weekId,
        title: data.title,
        description: data.description,
        numQuestions: data.numQuestions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      toast({ title: "Success", description: "Checkpoint quiz generated and assigned successfully" });
      posthog.capture("quiz_assigned", { batchId: selectedBatch?.id, quizTitle, weekId: selectedWeek, type: "checkpoint_quiz" });
      setAssignCheckpointQuizOpen(false);
      setQuizTitle("");
      setQuizDescription("");
      setSelectedWeek("");
      setNumQuestions("5");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const assignFileQuizMutation = useMutation({
    mutationFn: async (data: {
      batchId: string;
      weekId: string;
      fileId: string;
      title: string;
      description: string;
      numQuestions: number;
    }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-file-quiz`, {
        weekId: data.weekId,
        fileId: data.fileId,
        title: data.title,
        description: data.description,
        numQuestions: data.numQuestions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      toast({ title: "Success", description: "File quiz generated and assigned successfully" });
      posthog.capture("quiz_assigned", { batchId: selectedBatch?.id, quizTitle, weekId: selectedWeek, type: "file_quiz" });
      setAssignFileQuizOpen(false);
      setQuizTitle("");
      setQuizDescription("");
      setSelectedWeek("");
      setSelectedFileId("");
      setNumQuestions("5");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: string) => {
      await apiRequest("DELETE", `/api/assigned-quizzes/${quizId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", selectedBatch?.id, "quizzes"] });
      toast({ title: "Success", description: "Quiz deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetTeacherAttemptsMutation = useMutation({
    mutationFn: async ({ quizId, teacherId }: { quizId: string; teacherId: string }) => {
      await apiRequest("POST", `/api/assigned-quizzes/${quizId}/reset-teacher/${teacherId}`);
    },
    onSuccess: () => {
      toast({ title: "Attempts reset", description: "Teacher can now retake the quiz." });
      refetchQuizAttempts();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset attempts.", variant: "destructive" });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      await apiRequest("DELETE", `/api/batches/${batchId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
      toast({ title: "Success", description: "Batch deleted successfully" });
      setSelectedBatch(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const saveCertificateTemplateMutation = useMutation({
    mutationFn: async () => {
      const batchCoursesRes = await apiRequest("GET", `/api/batches/${selectedBatch.id}/courses`);
      const batchCoursesData = await batchCoursesRes.json();
      const courseId = batchCoursesData[0]?.id;
      
      return apiRequest("POST", `/api/batches/${selectedBatch.id}/certificate-template`, {
        courseId,
        appreciationText,
        adminName1,
        adminName2,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/batches/${selectedBatch?.id}/certificate-template`] });
      setAppreciationText(data.appreciationText);
      setAdminName1(data.adminName1 || "");
      setAdminName2(data.adminName2 || "");
      toast({ title: "Template saved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAddTeacher = () => {
    if (selectedBatch && teacherId) {
      addTeacherMutation.mutate({
        batchId: selectedBatch.id,
        query: teacherId,
      });
    }
  };

  const handleAssignCheckpointQuiz = () => {
    if (selectedBatch && selectedWeek && quizTitle) {
      assignQuizMutation.mutate({
        batchId: selectedBatch.id,
        weekId: selectedWeek,
        title: quizTitle,
        description: quizDescription,
        numQuestions: parseInt(numQuestions),
      });
    }
  };

  const handleAssignFileQuiz = () => {
    if (selectedBatch && selectedWeek && selectedFileId && quizTitle) {
      assignFileQuizMutation.mutate({
        batchId: selectedBatch.id,
        weekId: selectedWeek,
        fileId: selectedFileId,
        title: quizTitle,
        description: quizDescription,
        numQuestions: parseInt(numQuestions),
      });
    }
  };

  const getLevelBadgeVariant = (level: string) => {
    if (level === "Advanced") return "default";
    if (level === "Intermediate") return "secondary";
    return "outline";
  };

  return (
    <div className="min-h-screen bg-background">
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
                Trainer Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <div className="text-xs sm:text-sm text-white/90 hidden md:block truncate max-w-[200px]" data-testid="text-user-info">
              {user?.username}
            </div>
            <Button
              variant="secondary"
              size="sm"
              asChild
              data-testid="button-home"
              className="hidden sm:flex bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Home
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              asChild
              data-testid="button-home-mobile"
              className="sm:hidden h-8 w-8 bg-white/10 hover:bg-white/20 text-white border-white/20"
              aria-label="Home"
            >
              <Link href="/">
                <Home className="h-4 w-4" />
              </Link>
            </Button>
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

      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-3xl font-bold">Training Batches</h2>
              <p className="text-muted-foreground mt-1">Manage your assigned batches, quizzes, and track progress</p>
            </div>
          </div>
        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-300px)]">
          {/* Left Sidebar - Batch List */}
          <div className="lg:col-span-1 border rounded-lg bg-card overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Your Batches</h3>
              <p className="text-xs text-muted-foreground mt-1">{batches.length} total</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {batches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    No batches assigned to you yet
                  </div>
                ) : (
                  batches.map((batch: any) => (
                    <button
                      key={batch.id}
                      onClick={() => {
                        setSelectedBatch(batch);
                        setActiveTab("teachers");
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-colors border ${
                        selectedBatch?.id === batch.id
                          ? "bg-primary/10 border-primary text-foreground"
                          : "bg-muted/30 border-transparent hover:bg-muted/50 text-foreground"
                      }`}
                      data-testid={`button-batch-${batch.id}`}
                    >
                      <p className="font-semibold text-sm truncate">{batch.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {batch.teacherCount || 0} teachers
                      </p>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Batch Details */}
          {selectedBatch ? (
            <div className="lg:col-span-3 border rounded-lg bg-card overflow-hidden flex flex-col">
              {/* Header */}
              <div className="p-4 border-b flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{selectedBatch.name}</h2>
                  {selectedBatch.description && (
                    <p className="text-sm text-muted-foreground mt-1">{selectedBatch.description}</p>
                  )}
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Are you sure you want to delete the batch "${selectedBatch.name}"? This will remove all teachers and quizzes.`)) {
                      deleteBatchMutation.mutate(selectedBatch.id);
                    }
                  }}
                  data-testid={`button-delete-batch-${selectedBatch.id}`}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 overflow-hidden">
                <TabsList className="grid w-full grid-cols-6 flex-shrink-0 rounded-none border-b">
                  <TabsTrigger value="teachers" data-testid="tab-teachers">
                    <Users className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Teachers</span>
                  </TabsTrigger>
                  <TabsTrigger value="quizzes" data-testid="tab-quizzes">
                    <Award className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Quizzes</span>
                  </TabsTrigger>
                  <TabsTrigger value="progress" data-testid="tab-progress">
                    <TrendingUp className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Progress</span>
                  </TabsTrigger>
                  <TabsTrigger value="attendance" data-testid="tab-attendance">
                    <ClipboardCheck className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Attendance</span>
                  </TabsTrigger>
                  <TabsTrigger value="schedule" data-testid="tab-schedule">
                    <Calendar className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Schedule</span>
                  </TabsTrigger>
                  <TabsTrigger value="certificates" data-testid="tab-certificates">
                    <FileText className="mr-1 h-4 w-4" />
                    <span className="hidden sm:inline">Certs</span>
                  </TabsTrigger>
                </TabsList>

                {/* Teachers Tab */}
                <TabsContent value="teachers" className="space-y-4 flex-1 overflow-y-auto p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Enrolled Teachers</h3>
                    <Dialog open={addTeacherOpen} onOpenChange={setAddTeacherOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" data-testid="button-add-teacher">
                          <Plus className="mr-2 h-4 w-4" />
                          Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add Teachers to {selectedBatch?.name}</DialogTitle>
                          <DialogDescription>Search by Teacher ID, name, or email. Select one or more teachers to add at once.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          {/* Quick add by ID/email/name */}
                          <div className="space-y-2">
                            <Label htmlFor="teacher-id">Quick Add by ID, Name, or Email</Label>
                            <div className="flex gap-2">
                              <Input
                                id="teacher-id"
                                data-testid="input-teacher-id"
                                type="text"
                                placeholder="e.g., 7101, Ali Hassan, ali@school.com"
                                value={teacherId}
                                onChange={(e) => setTeacherId(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddTeacher()}
                              />
                              <Button
                                type="button"
                                onClick={handleAddTeacher}
                                disabled={!teacherId || addTeacherMutation.isPending}
                                data-testid="button-submit-teacher"
                                size="sm"
                              >
                                {addTeacherMutation.isPending ? "..." : "Add"}
                              </Button>
                            </div>
                          </div>

                          <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or select multiple</span></div>
                          </div>

                          {/* Bulk select */}
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search teachers..."
                                value={teacherSearch}
                                onChange={(e) => setTeacherSearch(e.target.value)}
                                className="pl-8"
                              />
                            </div>
                            <ScrollArea className="h-48 border rounded-md">
                              <div className="p-2 space-y-1">
                                {searchedTeachers.length === 0 ? (
                                  <p className="text-sm text-muted-foreground text-center py-4">No teachers found</p>
                                ) : (
                                  searchedTeachers.map((t: any) => {
                                    const alreadyEnrolled = batchDetails?.teachers?.some((bt: any) => bt.id === t.id);
                                    const checked = selectedTeacherIds.includes(t.id);
                                    return (
                                      <label key={t.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50 ${alreadyEnrolled ? "opacity-50" : ""}`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={alreadyEnrolled}
                                          onChange={(e) => {
                                            setSelectedTeacherIds(prev =>
                                              e.target.checked ? [...prev, t.id] : prev.filter(id => id !== t.id)
                                            );
                                          }}
                                          className="h-4 w-4"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{t.name}</div>
                                          <div className="text-xs text-muted-foreground">ID: {t.teacherId} · {t.email}</div>
                                        </div>
                                        {alreadyEnrolled && <Badge variant="secondary" className="text-xs">Enrolled</Badge>}
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            </ScrollArea>
                            {selectedTeacherIds.length > 0 && (
                              <Button
                                type="button"
                                className="w-full"
                                onClick={() => bulkAddTeachersMutation.mutate({ batchId: selectedBatch.id, teacherIds: selectedTeacherIds })}
                                disabled={bulkAddTeachersMutation.isPending}
                              >
                                {bulkAddTeachersMutation.isPending ? "Adding..." : `Add Selected (${selectedTeacherIds.length})`}
                              </Button>
                            )}
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  {batchDetails?.teachers?.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No teachers enrolled in this batch yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {batchDetails?.teachers?.map((teacher: any) => (
                        <Card key={teacher.id}>
                          <CardContent className="flex items-center justify-between gap-2 py-4">
                            <div>
                              <p className="font-semibold">{teacher.name}</p>
                              <p className="text-sm text-muted-foreground">
                                Teacher ID: {teacher.teacherId} • {teacher.email}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Add Comment"
                                onClick={() => {
                                  setCommentTeacher(teacher);
                                  setCommentDialogOpen(true);
                                }}
                                data-testid={`button-comment-teacher-${teacher.id}`}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Disqualify Fellow"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => {
                                  setDisqualifyTeacher(teacher);
                                  setDisqualifyDialogOpen(true);
                                }}
                                data-testid={`button-disqualify-teacher-${teacher.id}`}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (confirm(`Remove ${teacher.name} from this batch?`)) {
                                    removeTeacherMutation.mutate({
                                      batchId: selectedBatch.id,
                                      teacherId: teacher.id,
                                    });
                                  }
                                }}
                                data-testid={`button-remove-teacher-${teacher.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Quizzes Tab */}
                <TabsContent value="quizzes" className="space-y-4 flex-1 overflow-y-auto p-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Assigned Quizzes</h3>
                    <div className="flex gap-2">
                      <Dialog open={assignCheckpointQuizOpen} onOpenChange={setAssignCheckpointQuizOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" data-testid="button-assign-checkpoint-quiz">
                            <Plus className="mr-2 h-4 w-4" />
                            Checkpoint
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign Checkpoint Quiz</DialogTitle>
                            <DialogDescription>Generate and assign a new checkpoint quiz</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="quiz-title">Quiz Title</Label>
                              <Input
                                id="quiz-title"
                                data-testid="input-quiz-title"
                                placeholder="e.g., Week 1 Checkpoint"
                                value={quizTitle}
                                onChange={(e) => setQuizTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="quiz-description">Description (Optional)</Label>
                              <Textarea
                                id="quiz-description"
                                data-testid="input-quiz-description"
                                placeholder="Quiz description..."
                                value={quizDescription}
                                onChange={(e) => setQuizDescription(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="week-select">Select Week</Label>
                              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                                <SelectTrigger id="week-select" data-testid="select-week">
                                  <SelectValue placeholder="Choose a week..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weeks.map((week: any) => (
                                    <SelectItem key={week.id} value={week.id}>
                                      Module {week.weekNumber} - {week.competencyFocus}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="num-questions">Number of Questions</Label>
                              <Input
                                id="num-questions"
                                data-testid="input-num-questions"
                                type="number"
                                min="1"
                                max="20"
                                value={numQuestions}
                                onChange={(e) => setNumQuestions(e.target.value)}
                              />
                            </div>
                            <Button
                              onClick={handleAssignCheckpointQuiz}
                              disabled={!selectedWeek || !quizTitle || assignQuizMutation.isPending}
                              data-testid="button-submit-checkpoint-quiz"
                            >
                              {assignQuizMutation.isPending ? "Assigning..." : "Assign Quiz"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={assignFileQuizOpen} onOpenChange={setAssignFileQuizOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" data-testid="button-assign-file-quiz">
                            <Plus className="mr-2 h-4 w-4" />
                            File Quiz
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Assign File Quiz</DialogTitle>
                            <DialogDescription>Generate a quiz from presentation files</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="file-quiz-title">Quiz Title</Label>
                              <Input
                                id="file-quiz-title"
                                data-testid="input-file-quiz-title"
                                placeholder="e.g., File Quiz 1"
                                value={quizTitle}
                                onChange={(e) => setQuizTitle(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-quiz-description">Description (Optional)</Label>
                              <Textarea
                                id="file-quiz-description"
                                data-testid="input-file-quiz-description"
                                placeholder="Quiz description..."
                                value={quizDescription}
                                onChange={(e) => setQuizDescription(e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-week-select">Select Week</Label>
                              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                                <SelectTrigger id="file-week-select" data-testid="select-file-week">
                                  <SelectValue placeholder="Choose a week..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weeks.map((week: any) => (
                                    <SelectItem key={week.id} value={week.id}>
                                      Module {week.weekNumber} - {week.competencyFocus}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-select">Select File</Label>
                              <Select value={selectedFileId} onValueChange={setSelectedFileId}>
                                <SelectTrigger id="file-select" data-testid="select-file">
                                  <SelectValue placeholder="Choose a file..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {weekFiles.map((file: any) => (
                                    <SelectItem key={file.id} value={file.id}>
                                      {file.fileName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="file-num-questions">Number of Questions</Label>
                              <Input
                                id="file-num-questions"
                                data-testid="input-file-num-questions"
                                type="number"
                                min="1"
                                max="20"
                                value={numQuestions}
                                onChange={(e) => setNumQuestions(e.target.value)}
                              />
                            </div>
                            <Button
                              onClick={handleAssignFileQuiz}
                              disabled={!selectedWeek || !selectedFileId || !quizTitle || assignFileQuizMutation.isPending}
                              data-testid="button-submit-file-quiz"
                            >
                              {assignFileQuizMutation.isPending ? "Assigning..." : "Assign Quiz"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                  {assignedQuizzes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No quizzes assigned yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assignedQuizzes.map((quiz: any) => (
                        <Card
                          key={quiz.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => {
                            setSelectedQuizId(quiz.id);
                            setViewQuizDetailsOpen(true);
                          }}
                          data-testid={`card-quiz-${quiz.id}`}
                        >
                          <CardContent className="py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold truncate">{quiz.title}</p>
                                  <Badge variant="outline" className="text-xs flex-shrink-0">
                                    {quiz.type === "checkpoint" ? "Checkpoint" : "File"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {quiz.description || "No description"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="View teacher attempts"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedQuizForAttempts(quiz);
                                    setQuizAttemptsOpen(true);
                                  }}
                                >
                                  <Users className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Edit questions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingQuiz(quiz);
                                    setEditQuizOpen(true);
                                  }}
                                  data-testid={`button-edit-quiz-${quiz.id}`}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteQuizMutation.mutate(quiz.id);
                                  }}
                                  data-testid={`button-delete-quiz-${quiz.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Pending open-ended reviews */}
                  {pendingReviews.length > 0 && (
                    <div className="mt-6">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-semibold text-base">Pending Open-Ended Reviews</h4>
                        <Badge variant="destructive" className="text-xs">{pendingReviews.length}</Badge>
                      </div>
                      <div className="space-y-3">
                        {pendingReviews.map((review: any) => (
                          <Card key={review.id} className="border-yellow-300">
                            <CardContent className="py-4 space-y-2">
                              <p className="text-sm font-medium">{review.questionText}</p>
                              <p className="text-sm text-muted-foreground italic">{review.teacherAnswer || "(no answer)"}</p>
                              <div className="flex gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-600 border-green-300 hover:bg-green-50"
                                  onClick={async () => {
                                    await apiRequest("POST", `/api/quiz-attempts/${review.attemptId}/review-open-ended`, {
                                      reviews: [{
                                        questionId: review.questionId,
                                        assignedQuizId: review.assignedQuizId,
                                        teacherId: review.teacherId,
                                        questionText: review.questionText,
                                        teacherAnswer: review.teacherAnswer,
                                        passed: true,
                                      }],
                                    });
                                    queryClient.invalidateQueries({ queryKey: ["/api/trainer/pending-reviews"] });
                                    toast({ title: "Marked as passed" });
                                  }}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" /> Pass
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-300 hover:bg-red-50"
                                  onClick={async () => {
                                    await apiRequest("POST", `/api/quiz-attempts/${review.attemptId}/review-open-ended`, {
                                      reviews: [{
                                        questionId: review.questionId,
                                        assignedQuizId: review.assignedQuizId,
                                        teacherId: review.teacherId,
                                        questionText: review.questionText,
                                        teacherAnswer: review.teacherAnswer,
                                        passed: false,
                                      }],
                                    });
                                    queryClient.invalidateQueries({ queryKey: ["/api/trainer/pending-reviews"] });
                                    toast({ title: "Marked as failed" });
                                  }}
                                >
                                  <X className="h-4 w-4 mr-1" /> Fail
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Progress Tab */}
                <TabsContent value="progress" className="space-y-4 flex-1 overflow-y-auto p-4">
                  <h3 className="text-lg font-semibold">Teacher Progress</h3>
                  {isLoadingProgress ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading progress...
                    </div>
                  ) : batchProgress.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No progress data available
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {batchProgress.map((teacherProgress: any) => {
                        const teacher = teacherProgress.teacher || {
                          id: teacherProgress.teacherId,
                          name: teacherProgress.teacherName,
                          email: teacherProgress.teacherEmail,
                        };
                        return (
                        <Card key={teacher.id || teacherProgress.teacherId}>
                          <CardHeader>
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-base">{teacher.name}</CardTitle>
                                <CardDescription>{teacher.email}</CardDescription>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedTeacher({ ...teacherProgress, id: teacher.id, teacherId: teacher.id });
                                  setViewTeacherAttemptsOpen(true);
                                }}
                                data-testid={`button-view-attempts-${teacher.id}`}
                              >
                                View Details
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Overall Progress</span>
                                <span className="font-semibold">{teacherProgress.overallPercentage || 0}%</span>
                              </div>
                              <Progress value={teacherProgress.overallPercentage || 0} className="h-2" />
                            </div>
                            {(teacherProgress.courseCompletions || []).length > 0 && (
                              <div className="space-y-2">
                                {teacherProgress.courseCompletions.map((c: any) => (
                                  <div key={c.courseId} className="flex justify-between text-sm gap-2">
                                    <span className="truncate">{c.courseName}</span>
                                    <Badge variant={c.status === "completed" ? "default" : "secondary"}>
                                      {c.status === "completed" ? "Completed" : `${c.percentage || 0}%`}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="grid grid-cols-4 gap-2 text-sm">
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-muted-foreground text-xs">Completed</p>
                                <p className="font-semibold">{teacherProgress.completedCount || 0}</p>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-muted-foreground text-xs">In Progress</p>
                                <p className="font-semibold">{teacherProgress.inProgressCount || 0}</p>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-muted-foreground text-xs">Not Started</p>
                                <p className="font-semibold">{teacherProgress.notStartedCount || 0}</p>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <p className="text-muted-foreground text-xs">Quizzes Passed</p>
                                <p className="font-semibold">{teacherProgress.reportCard?.totalQuizzesPassed || 0}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Attendance Tab */}
                <TabsContent value="attendance" className="space-y-4 flex-1 overflow-y-auto p-4">
                  <h3 className="text-lg font-semibold">Attendance Tracking</h3>

                  {/* Mark Attendance for a date */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Mark Attendance</CardTitle>
                      <CardDescription>Select a date and record attendance for all enrolled teachers</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Label className="flex-shrink-0">Date</Label>
                        <input
                          type="date"
                          value={attendanceDate}
                          onChange={(e) => setAttendanceDate(e.target.value)}
                          className="border rounded px-3 py-1.5 text-sm bg-background"
                          max={new Date().toISOString().split('T')[0]}
                        />
                      </div>

                      {(batchDetails?.teachers || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No teachers enrolled in this batch.</p>
                      ) : (
                        <div className="space-y-2">
                          {/* Quick select all buttons */}
                          <div className="flex gap-2 flex-wrap">
                            <span className="text-xs text-muted-foreground self-center">Quick set all:</span>
                            {['present', 'absent', 'late', 'excused'].map((s) => (
                              <Button key={s} size="sm" variant="outline" className="h-7 text-xs capitalize"
                                onClick={() => {
                                  const all: Record<string, string> = {};
                                  (batchDetails?.teachers || []).forEach((t: any) => { all[t.id] = s; });
                                  setAttendanceRecordsState(all);
                                }}>
                                All {s}
                              </Button>
                            ))}
                          </div>

                          {(batchDetails?.teachers || []).map((teacher: any) => (
                            <div key={teacher.id} className="flex items-center justify-between p-2 border rounded-lg">
                              <span className="text-sm font-medium">{teacher.name}</span>
                              <div className="flex gap-1">
                                {[
                                  { value: 'present', label: 'P', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300' },
                                  { value: 'absent', label: 'A', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-300' },
                                  { value: 'late', label: 'L', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-300' },
                                  { value: 'excused', label: 'E', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300' },
                                ].map(({ value, label, color }) => (
                                  <button key={value}
                                    onClick={() => setAttendanceRecordsState(prev => ({ ...prev, [teacher.id]: value }))}
                                    className={`w-8 h-8 rounded text-xs font-bold border-2 transition-all ${
                                      attendanceRecordsState[teacher.id] === value
                                        ? color + ' border-current scale-110 shadow'
                                        : 'border-border bg-muted/50 text-muted-foreground hover:border-current'
                                    }`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          <Button
                            className="w-full mt-2"
                            disabled={submitAttendanceMutation.isPending || Object.keys(attendanceRecordsState).length === 0}
                            onClick={() => {
                              const records = Object.entries(attendanceRecordsState).map(([teacherId, status]) => ({ teacherId, status }));
                              submitAttendanceMutation.mutate({ batchId: selectedBatch.id, date: attendanceDate, records });
                            }}>
                            {submitAttendanceMutation.isPending ? "Saving..." : "Save Attendance"}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Attendance Summary per teacher */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Attendance Summary</CardTitle>
                      <CardDescription>Cumulative attendance rates for all teachers in this batch</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {batchAttendanceSummary.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No attendance data yet. Start marking attendance above.</p>
                      ) : (
                        <div className="space-y-3">
                          {batchAttendanceSummary.map((row: any) => (
                            <div key={row.teacher_id} className="space-y-1">
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-medium">{row.teacher_name}</span>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span className="text-green-600">P:{row.present_days}</span>
                                  <span className="text-red-600">A:{row.absent_days}</span>
                                  <span className="text-yellow-600">L:{row.late_days}</span>
                                  <span className="font-semibold text-foreground">{row.attendance_rate}%</span>
                                </div>
                              </div>
                              <Progress value={parseFloat(row.attendance_rate || '0')} className="h-1.5" />
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Schedule Tab */}
                <TabsContent value="schedule" className="space-y-4 flex-1 overflow-y-auto p-4">
                  <h3 className="text-lg font-semibold">Batch Schedule</h3>

                  {/* Add Event */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Schedule New Event</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1 col-span-2">
                          <Label>Title</Label>
                          <input
                            type="text"
                            value={newEventTitle}
                            onChange={(e) => setNewEventTitle(e.target.value)}
                            placeholder="e.g. Week 3 Session"
                            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Type</Label>
                          <select
                            value={newEventType}
                            onChange={(e) => setNewEventType(e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm bg-background">
                            <option value="session">Session</option>
                            <option value="assessment">Assessment</option>
                            <option value="deadline">Deadline</option>
                            <option value="holiday">Holiday</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Start Date/Time</Label>
                          <input
                            type="datetime-local"
                            value={newEventStart}
                            onChange={(e) => setNewEventStart(e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>End Date/Time (optional)</Label>
                          <input
                            type="datetime-local"
                            value={newEventEnd}
                            onChange={(e) => setNewEventEnd(e.target.value)}
                            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                        <div className="space-y-1 col-span-2">
                          <Label>Description (optional)</Label>
                          <input
                            type="text"
                            value={newEventDesc}
                            onChange={(e) => setNewEventDesc(e.target.value)}
                            placeholder="Additional details..."
                            className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={createEventMutation.isPending || !newEventTitle.trim() || !newEventStart}
                        onClick={() => createEventMutation.mutate({
                          title: newEventTitle,
                          eventType: newEventType,
                          startDate: newEventStart,
                          endDate: newEventEnd || undefined,
                          description: newEventDesc || undefined,
                        })}>
                        {createEventMutation.isPending ? "Scheduling..." : "Schedule Event"}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Events list */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Upcoming Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {batchEvents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No events scheduled yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {batchEvents.map((event: any) => (
                            <div key={event.id} className="flex items-start justify-between p-3 border rounded-lg">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{event.eventType}</Badge>
                                  <span className="font-medium text-sm truncate">{event.title}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(event.startDate).toLocaleString()}
                                  {event.endDate && ` → ${new Date(event.endDate).toLocaleString()}`}
                                </p>
                                {event.description && <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>}
                              </div>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-destructive flex-shrink-0 ml-2"
                                onClick={() => deleteEventMutation.mutate(event.id)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Certificates Tab */}
                <TabsContent value="certificates" className="overflow-y-auto flex-1 p-4">
                  <div className="space-y-4 pr-4">
                    <div className="bg-muted/30 p-4 rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-3">
                        Configure the certificate template for this batch. After setup, contact admin to approve.
                      </p>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Appreciation Text</label>
                          <Textarea
                            value={appreciationText || (template?.appreciationText ?? "")}
                            onChange={(e) => setAppreciationText(e.target.value)}
                            placeholder="In recognition of successfully completing the training program"
                            className="mt-2"
                            data-testid="input-cert-appreciation-text"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Admin Name 1</label>
                            <Input
                              value={adminName1 || (template?.adminName1 ?? "")}
                              onChange={(e) => setAdminName1(e.target.value)}
                              placeholder="First admin name"
                              className="mt-2"
                              data-testid="input-cert-admin-name-1"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Admin Name 2</label>
                            <Input
                              value={adminName2 || (template?.adminName2 ?? "")}
                              onChange={(e) => setAdminName2(e.target.value)}
                              placeholder="Second admin name (optional)"
                              className="mt-2"
                              data-testid="input-cert-admin-name-2"
                            />
                          </div>
                        </div>

                        <Button
                          onClick={() => saveCertificateTemplateMutation.mutate()}
                          disabled={saveCertificateTemplateMutation.isPending}
                          data-testid="button-save-cert-template"
                        >
                          {saveCertificateTemplateMutation.isPending ? "Saving..." : "Save Template"}
                        </Button>

                        {template?.status && (
                          <div className="text-sm p-3 rounded-lg bg-muted/50">
                            <p className="font-medium">
                              Status: <span className="capitalize">{template.status}</span>
                            </p>
                            {template.status === "approved" && (
                              <p className="text-green-600 flex items-center gap-1 mt-1">
                                <CheckCircle className="w-4 h-4" /> Approved by admin
                              </p>
                            )}
                            {template.status === "draft" && (
                              <p className="text-muted-foreground text-xs mt-1">
                                Save your template and request approval from admin
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border">
                      <p className="text-sm font-medium mb-4 text-foreground">Certificate Preview</p>
                      <div className="border-2 border-primary rounded-lg p-8 space-y-6 text-center bg-white dark:bg-slate-900">
                        {/* Certificate Header */}
                        <div className="space-y-2">
                          <h1 className="text-3xl font-bold text-primary">Certificate of Completion</h1>
                          <p className="text-sm text-muted-foreground">Silverleaf Academy</p>
                        </div>

                        {/* Divider */}
                        <div className="flex justify-center">
                          <div className="w-16 h-1 bg-primary rounded-full" />
                        </div>

                        {/* Content */}
                        <div className="space-y-4">
                          <p className="text-sm text-foreground">This certificate is proudly presented to</p>
                          <p className="text-2xl font-bold text-primary">Teacher Name</p>
                          <p className="text-xs text-muted-foreground border-t-2 border-primary pt-4">
                            For successfully completing the course
                          </p>
                          <p className="text-lg font-bold text-primary">{selectedBatch?.name || "Course Name"}</p>
                        </div>

                        {/* Appreciation Text */}
                        <div className="bg-primary/5 p-4 rounded-lg">
                          <p className="text-xs leading-relaxed text-foreground italic">
                            {appreciationText || template?.appreciationText || "In recognition of successfully completing the training program"}
                          </p>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-2 gap-6 pt-6">
                          <div className="space-y-8 text-center">
                            <div className="h-12" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">{adminName1 || template?.adminName1 || "Administrator"}</p>
                              <p className="text-xs text-muted-foreground">Authorized Signatory</p>
                            </div>
                          </div>
                          <div className="space-y-8 text-center">
                            <div className="h-12" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">{adminName2 || template?.adminName2 || "Director"}</p>
                              <p className="text-xs text-muted-foreground">Program Director</p>
                            </div>
                          </div>
                        </div>

                        {/* Date */}
                        <p className="text-xs text-muted-foreground pt-4">
                          Issued on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="lg:col-span-3 border rounded-lg bg-card flex items-center justify-center">
              <div className="text-center">
                <Users className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">Select a batch to view details</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Quiz Teacher Attempts Dialog */}
      <Dialog open={quizAttemptsOpen} onOpenChange={setQuizAttemptsOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Teacher Attempts — {selectedQuizForAttempts?.title}</DialogTitle>
            <DialogDescription>
              Reset a teacher's attempts to let them retake the quiz.
            </DialogDescription>
          </DialogHeader>
          {quizTeacherAttempts.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground text-sm">No teachers have attempted this quiz yet.</p>
          ) : (
            <div className="space-y-2">
              {quizTeacherAttempts.map((t: any) => (
                <div key={t.teacherId} className="flex items-center justify-between border rounded px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{t.teacherName}</p>
                    <p className="text-xs text-muted-foreground">{t.teacherEmail}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge
                        variant={t.passed ? "default" : t.exhausted ? "destructive" : "secondary"}
                        className="text-xs"
                      >
                        {t.passed ? "Passed" : t.exhausted ? "Exhausted (3/3)" : `${t.attempts}/3 attempts`}
                      </Badge>
                      {t.latestScore !== null && (
                        <span className="text-xs text-muted-foreground">Latest: {t.latestScore}%</span>
                      )}
                    </div>
                  </div>
                  {(t.exhausted || (t.attempts > 0 && !t.passed)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resetTeacherAttemptsMutation.mutate({ quizId: selectedQuizForAttempts.id, teacherId: t.teacherId })}
                      disabled={resetTeacherAttemptsMutation.isPending}
                    >
                      Reset Attempts
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Edit Dialog */}
      {editingQuiz && (
        <QuizEditDialog
          open={editQuizOpen}
          onClose={() => { setEditQuizOpen(false); setEditingQuiz(null); }}
          quizId={editingQuiz.id}
          quizTitle={editingQuiz.title}
          initialQuestions={editingQuiz.questions ?? []}
          batchId={selectedBatch?.id}
        />
      )}

      {/* View Quiz Details Dialog */}
      <Dialog open={viewQuizDetailsOpen} onOpenChange={setViewQuizDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{quizDetails?.title || "Quiz Details"}</DialogTitle>
            <DialogDescription>
              {quizDetails?.description || ""} • {quizDetails?.questions?.length || 0} questions
            </DialogDescription>
          </DialogHeader>
          {!quizDetails ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading quiz details...
            </div>
          ) : (
            <div className="space-y-4">
              {quizDetails.questions?.map((question: any, index: number) => (
                <Card key={question.id || index}>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <p className="font-semibold text-base">
                          Question {index + 1}: {question.question}
                        </p>
                        <Badge variant="outline" className="mt-2">
                          {question.type === "true_false" ? "True/False" : "Multiple Choice"}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Options:</p>
                        <div className="space-y-2">
                          {question.options?.map((option: string, optionIndex: number) => (
                            <div
                              key={optionIndex}
                              className={`p-3 rounded-lg border ${
                                option === question.correctAnswer
                                  ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700"
                                  : "bg-muted/50 border-border"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {option === question.correctAnswer && (
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                )}
                                <span className={option === question.correctAnswer ? "font-semibold text-green-700 dark:text-green-300" : ""}>
                                  {option}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-sm">
                          <span className="font-semibold text-muted-foreground">Correct Answer: </span>
                          <span className="text-green-600 dark:text-green-400 font-semibold">{question.correctAnswer}</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher Attempts Dialog */}
      <Dialog open={viewTeacherAttemptsOpen} onOpenChange={setViewTeacherAttemptsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTeacher?.teacherName} - Quiz Attempts</DialogTitle>
            <DialogDescription>{selectedTeacher?.teacherEmail}</DialogDescription>
          </DialogHeader>
          {teacherAttempts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No quiz attempts yet
            </div>
          ) : (
            <div className="space-y-4">
              {teacherAttempts.map((attempt: any) => {
                const percentage = Math.round((attempt.score / attempt.totalQuestions) * 100);
                const passed = attempt.passed === "yes";
                return (
                  <Card key={attempt.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base">{attempt.quizTitle}</CardTitle>
                          <CardDescription>
                            {new Date(attempt.completedAt).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge variant={passed ? "default" : "destructive"}>
                          {percentage}% - {passed ? "Passed" : "Failed"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Score:</span>
                          <span className="ml-2 font-semibold">{attempt.score}/{attempt.totalQuestions}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Attempt:</span>
                          <span className="ml-2 font-semibold">{attempt.attemptNumber}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Comment Dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment for {commentTeacher?.name}</DialogTitle>
            <DialogDescription>Provide feedback on this fellow's progress</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <Select value={commentCategory} onValueChange={setCommentCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="progress">Progress</SelectItem>
                  <SelectItem value="improvement">Improvement</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comment</Label>
              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Enter your feedback..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!commentText.trim()) {
                    toast({ title: "Error", description: "Comment cannot be empty", variant: "destructive" });
                    return;
                  }
                  addCommentMutation.mutate({
                    teacherId: commentTeacher.id,
                    batchId: selectedBatch.id,
                    comment: commentText,
                    category: commentCategory,
                  });
                }}
                disabled={addCommentMutation.isPending}
              >
                {addCommentMutation.isPending ? "Adding..." : "Add Comment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Disqualify Fellow Dialog */}
      <Dialog open={disqualifyDialogOpen} onOpenChange={setDisqualifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Disqualify {disqualifyTeacher?.name}</DialogTitle>
            <DialogDescription>This action will mark the fellow as disqualified from this batch. Please provide a reason.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason for Disqualification</Label>
              <Textarea
                value={disqualifyReason}
                onChange={(e) => setDisqualifyReason(e.target.value)}
                placeholder="Enter the reason for disqualification..."
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDisqualifyDialogOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!disqualifyReason.trim()) {
                    toast({ title: "Error", description: "Reason is required", variant: "destructive" });
                    return;
                  }
                  disqualifyMutation.mutate({
                    teacherId: disqualifyTeacher.id,
                    batchId: selectedBatch.id,
                    reason: disqualifyReason,
                  });
                }}
                disabled={disqualifyMutation.isPending}
              >
                {disqualifyMutation.isPending ? "Disqualifying..." : "Disqualify Fellow"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
