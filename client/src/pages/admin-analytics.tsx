import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Users, BookOpen, BarChart3, ChevronDown, ChevronUp, X, TrendingUp, AlertCircle, CheckCircle, Clock, Trash2, Ban, UserPlus, GraduationCap, MapPin, Briefcase, Activity, Plus, Award, FileText, Heart, Shield, Star, MessageSquare, Repeat, Target, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { FileQuizEditDialog } from "@/components/FileQuizEditDialog";

interface BatchAnalytics {
  batch: { id: string; name: string };
  teacherCount: number;
  courseCount: number;
  courses: any[];
}

interface CourseAnalytics {
  id: string;
  name: string;
  weekCount: number;
  batchAssignments: number;
}

interface TrainerAnalytics {
  trainerId: string;
  batchCount: number;
  courseAssignmentCount: number;
  batches: any[];
}

interface UserWithStats {
  id: string;
  email: string;
  role: string;
  name?: string;
  createdAt?: string;
  batchCount?: number;
  courseCount?: number;
  approvalStatus?: string;
}

interface UserActivityStats {
  userId: string;
  progressPercentage: number;
  totalAssigned: number;
  totalCompleted: number;
  totalQuizzes?: number;
  totalPassed?: number;
  totalCourses?: number;
}

// Chart color palette
const CHART_COLORS = [
  "hsl(221, 83%, 53%)",  // blue
  "hsl(262, 83%, 58%)",  // purple
  "hsl(142, 71%, 45%)",  // green
  "hsl(38, 92%, 50%)",   // amber
  "hsl(0, 84%, 60%)",    // red
  "hsl(199, 89%, 48%)",  // cyan
  "hsl(330, 81%, 60%)",  // pink
  "hsl(25, 95%, 53%)",   // orange
];

// KPI Card Component
function KPICard({ label, value, icon: Icon, subtitle, color = "primary", onClick }: { label: string; value: string | number; icon: any; subtitle?: string; color?: string; onClick?: () => void }) {
  return (
    <Card className={`hover-elevate transition-all${onClick ? " cursor-pointer" : ""}`} onClick={onClick}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-lg bg-${color}/10`}>
            <Icon className={`w-5 h-5 text-${color}`} />
          </div>
          {onClick && <span className="text-xs text-muted-foreground">View all</span>}
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// Traffic Light Badge
function TrafficLightBadge({ status }: { status: string }) {
  if (status === "green") {
    return <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> On Track</Badge>;
  }
  if (status === "yellow") {
    return <Badge className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Moderate</Badge>;
  }
  return <Badge className="bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> At Risk</Badge>;
}

// Batch Status Badge (existing)
function BatchStatusBadge({ status }: { status: "on-track" | "at-risk" }) {
  if (status === "on-track") {
    return <Badge className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> On Track</Badge>;
  }
  return <Badge className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> At Risk</Badge>;
}

export default function AdminAnalytics() {
  const [, navigate] = useLocation();
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWithStats | null>(null);
  const [viewingActivityUserId, setViewingActivityUserId] = useState<string | null>(null);
  const [showManageTrainers, setShowManageTrainers] = useState(false);
  const [showManageTeachers, setShowManageTeachers] = useState(false);
  const [userToManage, setUserToManage] = useState<UserWithStats | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showConfirmRestrict, setShowConfirmRestrict] = useState(false);
  const [actionType, setActionType] = useState<"delete" | "restrict" | "unrestrict">("delete");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "trainer" | "teacher">("teacher");
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [newBatchName, setNewBatchName] = useState("");
  const [newBatchDescription, setNewBatchDescription] = useState("");
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);
  const [showDeleteBatchConfirm, setShowDeleteBatchConfirm] = useState(false);
  const [selectedTrainerForBatch, setSelectedTrainerForBatch] = useState<string>("");
  const [batchDetailTab, setBatchDetailTab] = useState("teachers");
  const [addTeacherOpen, setAddTeacherOpen] = useState(false);
  const [assignCheckpointQuizOpen, setAssignCheckpointQuizOpen] = useState(false);
  const [assignFileQuizOpen, setAssignFileQuizOpen] = useState(false);
  const [viewQuizDetailsOpen, setViewQuizDetailsOpen] = useState(false);
  const [viewTeacherAttemptsOpen, setViewTeacherAttemptsOpen] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [selectedTeacherForAttempts, setSelectedTeacherForAttempts] = useState<any>(null);
  const [teacherIdInput, setTeacherIdInput] = useState("");
  const [quizTitle, setQuizTitle] = useState("");
  const [quizDescription, setQuizDescription] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [numQuestions, setNumQuestions] = useState("5");
  const [appreciationText, setAppreciationText] = useState("");
  const [adminName1, setAdminName1] = useState("");
  const [adminName2, setAdminName2] = useState("");
  const [selectedCourseForBatch, setSelectedCourseForBatch] = useState("");
  const [showReflectionsDialog, setShowReflectionsDialog] = useState(false);
  const [editFileQuiz, setEditFileQuiz] = useState<{ weekId: string; fileId: string; fileName: string; approved: boolean } | null>(null);

  // Existing data queries
  const { data: batchesAnalytics = [], isLoading: loadingBatches } = useQuery({
    queryKey: ["/api/admin/analytics/batches"],
    enabled: isAdmin,
  });

  const { data: expandedBatchDetails = null as any } = useQuery({
    queryKey: ["/api/admin/analytics/batches", expandedBatchId],
    enabled: isAdmin && expandedBatchId !== null,
  });

  const { data: batchWithTeachers = null as any } = useQuery({
    queryKey: ["/api/batches", expandedBatchId],
    enabled: isAdmin && expandedBatchId !== null,
  });

  const { data: assignedQuizzes = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", expandedBatchId, "quizzes"],
    enabled: isAdmin && !!expandedBatchId,
  });

  const { data: fileQuizzes = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", expandedBatchId, "file-quizzes"],
    enabled: isAdmin && !!expandedBatchId,
    queryFn: async () => {
      const res = await fetch(`/api/batches/${expandedBatchId}/file-quizzes`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: editFileQuizStatus } = useQuery<Record<string, any>>({
    queryKey: ["/api/training-weeks", editFileQuiz?.weekId, "quiz-status"],
    enabled: !!editFileQuiz,
    queryFn: async () => {
      const res = await fetch(`/api/training-weeks/${editFileQuiz!.weekId}/quiz-status`);
      if (!res.ok) return {};
      return res.json();
    },
  });

  const { data: batchProgress = [], isLoading: isLoadingProgress } = useQuery<any[]>({
    queryKey: ["/api/batches", expandedBatchId, "progress"],
    enabled: isAdmin && !!expandedBatchId,
    refetchInterval: 30000,
  });

  const { data: trainingWeeks = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks"],
    enabled: isAdmin,
  });

  const { data: weekFiles = [] } = useQuery<any[]>({
    queryKey: ["/api/training-weeks", selectedWeek, "deck-files"],
    enabled: !!selectedWeek && assignFileQuizOpen,
  });

  const { data: quizDetails } = useQuery<any>({
    queryKey: ["/api/trainer/quizzes", selectedQuizId],
    enabled: !!selectedQuizId && viewQuizDetailsOpen,
  });

  const { data: teacherAttempts = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", expandedBatchId, "teachers", selectedTeacherForAttempts?.teacher?.id, "quiz-attempts"],
    enabled: !!expandedBatchId && !!selectedTeacherForAttempts?.teacher?.id && viewTeacherAttemptsOpen,
  });

  const { data: certificateTemplate } = useQuery<any>({
    queryKey: [`/api/batches/${expandedBatchId}/certificate-template`],
    enabled: !!expandedBatchId && batchDetailTab === "certificates",
  });

  const { data: coursesAnalytics = [], isLoading: loadingCourses } = useQuery({
    queryKey: ["/api/admin/analytics/courses"],
    enabled: isAdmin,
  });

  const { data: trainersAnalytics = [], isLoading: loadingTrainers } = useQuery({
    queryKey: ["/api/trainer/analytics"],
    enabled: !isAdmin,
  });

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["/api/admin/users/all"],
    enabled: isAdmin,
    queryFn: async () => {
      try {
        const response = await fetch("/api/admin/users/all");
        if (!response.ok) return [];
        return await response.json();
      } catch {
        return [];
      }
    },
  });

  const { data: userActivityStats = {} } = useQuery({
    queryKey: ["/api/admin/users", selectedUser?.id, "activity"],
    enabled: isAdmin && selectedUser !== null,
    queryFn: async () => {
      try {
        if (!selectedUser?.id) return {};
        const response = await fetch(`/api/admin/users/${selectedUser.id}/activity`);
        if (!response.ok) return {};
        return await response.json();
      } catch {
        return {};
      }
    },
  });

  // Fetch trainers for assignment dropdown
  const { data: availableTrainers = [] } = useQuery<any[]>({
    queryKey: ["/api/trainers"],
    enabled: isAdmin,
  });

  const { data: allCourses = [] } = useQuery<any[]>({
    queryKey: ["/api/courses"],
    enabled: isAdmin,
  });

  const { data: batchCourses = [] } = useQuery<any[]>({
    queryKey: ["/api/batches", expandedBatchId, "courses"],
    enabled: isAdmin && !!expandedBatchId,
  });

  // Assign trainer to batch mutation
  const assignTrainerMutation = useMutation({
    mutationFn: async ({ batchId, trainerId }: { batchId: string; trainerId: string | null }) => {
      return apiRequest("PUT", `/api/batches/${batchId}/trainer`, { trainerId });
    },
    onSuccess: () => {
      toast({ title: "Trainer assigned successfully" });
      setSelectedTrainerForBatch("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/batches"] });
    },
    onError: () => {
      toast({ title: "Failed to assign trainer", variant: "destructive" });
    },
  });

  const assignCourseToBatchMutation = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      return apiRequest("POST", `/api/batches/${batchId}/courses`, { courseId });
    },
    onSuccess: () => {
      toast({ title: "Course assigned successfully" });
      setSelectedCourseForBatch("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to assign course", description: error.message, variant: "destructive" });
    },
  });

  const removeCourseFromBatchMutation = useMutation({
    mutationFn: async ({ batchId, courseId }: { batchId: string; courseId: string }) => {
      return apiRequest("DELETE", `/api/batches/${batchId}/courses/${courseId}`);
    },
    onSuccess: () => {
      toast({ title: "Course removed from batch" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove course", description: error.message, variant: "destructive" });
    },
  });

  // New analytics queries
  const { data: pipelineData, isLoading: loadingPipeline } = useQuery({
    queryKey: ["/api/admin/analytics/pipeline"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/pipeline");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: demographicsData, isLoading: loadingDemographics } = useQuery({
    queryKey: ["/api/admin/analytics/demographics"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/demographics");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: cohortsData, isLoading: loadingCohorts } = useQuery({
    queryKey: ["/api/admin/analytics/cohorts"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/cohorts");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: performanceData, isLoading: loadingPerformance } = useQuery({
    queryKey: ["/api/admin/analytics/performance"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/performance");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: completionTrends, isLoading: loadingTrends } = useQuery({
    queryKey: ["/api/admin/analytics/completion-trends"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/admin/analytics/completion-trends");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Engagement & Retention Analytics Queries
  const { data: reflectionData, isLoading: loadingReflections } = useQuery({
    queryKey: ["/api/analytics/reflection-completion"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/reflection-completion");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: allReflections = [], isLoading: loadingAllReflections } = useQuery<any[]>({
    queryKey: ["/api/admin/reflections"],
    enabled: isAdmin && showReflectionsDialog,
    queryFn: async () => {
      const response = await fetch("/api/admin/reflections");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: engagementData, isLoading: loadingEngagement } = useQuery({
    queryKey: ["/api/analytics/engagement"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/engagement");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: weekCoverageData, isLoading: loadingWeekCoverage } = useQuery({
    queryKey: ["/api/analytics/week-coverage"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/week-coverage");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: courseCompletionData = [], isLoading: loadingCourseCompletion } = useQuery({
    queryKey: ["/api/analytics/course-completion"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/course-completion");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: bestFormedWeekData, isLoading: loadingBestWeek } = useQuery({
    queryKey: ["/api/analytics/best-formed-week"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/best-formed-week");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: disqualificationData, isLoading: loadingDisqualification } = useQuery({
    queryKey: ["/api/analytics/disqualification-rate"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/disqualification-rate");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: repetitionData, isLoading: loadingRepetition } = useQuery({
    queryKey: ["/api/analytics/repetition-rate"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/repetition-rate");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  const { data: satisfactionData, isLoading: loadingSatisfaction } = useQuery({
    queryKey: ["/api/analytics/satisfaction-trends"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/satisfaction-trends");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: quizPerformanceData, isLoading: loadingQuizPerformance } = useQuery({
    queryKey: ["/api/analytics/quiz-performance"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/quiz-performance");
      if (!response.ok) return null;
      return await response.json();
    },
  });

  const { data: courseAssignmentData, isLoading: loadingCourseAssignment } = useQuery({
    queryKey: ["/api/analytics/course-assignments"],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch("/api/analytics/course-assignments");
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Mutation for deleting/dismissing trainers
  const dismissTrainerMutation = useMutation({
    mutationFn: async (trainerId: string) =>
      apiRequest("DELETE", `/api/admin/dismiss-user/${trainerId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Trainer has been removed." });
      setUserToManage(null);
      setShowManageTrainers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove trainer.", variant: "destructive" });
    },
  });

  // Mutation for deleting/dismissing teachers
  const dismissTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) =>
      apiRequest("DELETE", `/api/admin/dismiss-teacher/${teacherId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Teacher has been removed." });
      setUserToManage(null);
      setShowManageTeachers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove teacher.", variant: "destructive" });
    },
  });

  // Mutation for restricting trainers
  const restrictTrainerMutation = useMutation({
    mutationFn: async (trainerId: string) =>
      apiRequest("POST", `/api/admin/restrict-user/${trainerId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Trainer has been restricted." });
      setUserToManage(null);
      setShowManageTrainers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restrict trainer.", variant: "destructive" });
    },
  });

  // Mutation for restricting teachers
  const restrictTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) =>
      apiRequest("POST", `/api/admin/restrict-teacher/${teacherId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Teacher has been restricted." });
      setUserToManage(null);
      setShowManageTeachers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restrict teacher.", variant: "destructive" });
    },
  });

  // Mutation for unrestricting trainers
  const unrestrictTrainerMutation = useMutation({
    mutationFn: async (trainerId: string) =>
      apiRequest("POST", `/api/admin/unrestrict-user/${trainerId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Trainer has been unrestricted." });
      setUserToManage(null);
      setShowManageTrainers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unrestrict trainer.", variant: "destructive" });
    },
  });

  // Mutation for unrestricting teachers
  const unrestrictTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) =>
      apiRequest("POST", `/api/admin/unrestrict-teacher/${teacherId}`),
    onSuccess: () => {
      toast({ title: "Success", description: "Teacher has been unrestricted." });
      setUserToManage(null);
      setShowManageTeachers(false);
      window.location.reload();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to unrestrict teacher.", variant: "destructive" });
    },
  });

  // Mutation for creating new users
  const createUserMutation = useMutation({
    mutationFn: async (userData: { email: string; password: string; name: string; role: string }) =>
      apiRequest("POST", "/api/admin/users/create", userData),
    onSuccess: (data: any) => {
      toast({ title: "Success", description: data.message || "User created successfully." });
      setShowAddUser(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserRole("teacher");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/all"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user.",
        variant: "destructive"
      });
    },
  });

  // Mutation for creating batches
  const createBatchMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      const response = await apiRequest("POST", "/api/batches", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Batch created successfully." });
      setShowCreateBatch(false);
      setNewBatchName("");
      setNewBatchDescription("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create batch.", variant: "destructive" });
    },
  });

  // Mutation for deleting batches
  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await apiRequest("DELETE", `/api/batches/${batchId}`);
      return response;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Batch deleted successfully." });
      setShowDeleteBatchConfirm(false);
      setBatchToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete batch.", variant: "destructive" });
    },
  });

  const addTeacherToBatchMutation = useMutation({
    mutationFn: async ({ batchId, query }: { batchId: string; query: string }) => {
      const trimmed = query.trim();
      let body: Record<string, unknown>;
      if (/^\d+$/.test(trimmed)) {
        body = { teacherId: parseInt(trimmed) };
      } else if (trimmed.includes("@")) {
        body = { teacherEmail: trimmed };
      } else {
        body = { teacherName: trimmed };
      }
      const response = await apiRequest("POST", `/api/batches/${batchId}/teachers`, body);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add teacher");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Teacher added to batch" });
      setTeacherIdInput("");
      setAddTeacherOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Could not add teacher", description: error.message || "Failed to add teacher.", variant: "destructive" });
    },
  });

  const removeTeacherFromBatchMutation = useMutation({
    mutationFn: async ({ batchId, teacherId }: { batchId: string; teacherId: string }) => {
      await apiRequest("DELETE", `/api/batches/${batchId}/teachers/${teacherId}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Teacher removed from batch." });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/analytics/batches"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove teacher.", variant: "destructive" });
    },
  });

  const assignCheckpointQuizMutation = useMutation({
    mutationFn: async (data: { batchId: string; weekId: string; title: string; description: string; numQuestions: number }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-quiz`, {
        weekId: data.weekId, title: data.title, description: data.description, numQuestions: data.numQuestions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "quizzes"] });
      toast({ title: "Success", description: "Checkpoint quiz assigned." });
      setAssignCheckpointQuizOpen(false);
      setQuizTitle(""); setQuizDescription(""); setSelectedWeek(""); setNumQuestions("5");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const assignFileQuizMutation = useMutation({
    mutationFn: async (data: { batchId: string; weekId: string; fileId: string; title: string; description: string; numQuestions: number }) => {
      const response = await apiRequest("POST", `/api/batches/${data.batchId}/assign-file-quiz`, {
        weekId: data.weekId, fileId: data.fileId, title: data.title, description: data.description, numQuestions: data.numQuestions,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "quizzes"] });
      toast({ title: "Success", description: "File quiz assigned." });
      setAssignFileQuizOpen(false);
      setQuizTitle(""); setQuizDescription(""); setSelectedWeek(""); setSelectedFileId(""); setNumQuestions("5");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteQuizMutation = useMutation({
    mutationFn: async (quizId: string) => {
      await apiRequest("DELETE", `/api/assigned-quizzes/${quizId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "quizzes"] });
      toast({ title: "Success", description: "Quiz deleted." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveCertificateTemplateMutation = useMutation({
    mutationFn: async () => {
      const coursesRes = await fetch(`/api/batches/${expandedBatchId}/courses`);
      const courses = await coursesRes.json();
      const courseId = courses?.[0]?.id || null;
      return apiRequest("POST", `/api/batches/${expandedBatchId}/certificate-template`, {
        courseId, appreciationText, adminName1, adminName2,
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/batches/${expandedBatchId}/certificate-template`] });
      if (data.appreciationText) setAppreciationText(data.appreciationText);
      if (data.adminName1) setAdminName1(data.adminName1);
      if (data.adminName2) setAdminName2(data.adminName2);
      toast({ title: "Template saved successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <Button onClick={() => navigate("/")} variant="outline" className="mb-8" data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Trainer Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTrainers ? (
              <p>Loading...</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Batches Created</div>
                    <div className="text-2xl font-bold">{(trainersAnalytics as TrainerAnalytics)?.batchCount || 0}</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-sm text-muted-foreground">Courses Assigned</div>
                    <div className="text-2xl font-bold">{(trainersAnalytics as TrainerAnalytics)?.courseAssignmentCount || 0}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalTeachers = Array.isArray(allUsers) ? allUsers.filter((u: any) => u.role === "teacher").length : 0;
  const totalTrainers = Array.isArray(allUsers) ? allUsers.filter((u: any) => u.role === "trainer").length : 0;

  // Chart configs
  const genderChartConfig: ChartConfig = {
    male: { label: "Male", color: CHART_COLORS[0] },
    female: { label: "Female", color: CHART_COLORS[2] },
    other: { label: "Other", color: CHART_COLORS[3] },
    prefer_not_to_say: { label: "Not Specified", color: CHART_COLORS[4] },
    notSpecified: { label: "Not Specified", color: CHART_COLORS[5] },
  };

  const completionChartConfig: ChartConfig = {
    completionRate: { label: "Completion Rate", color: CHART_COLORS[0] },
    rate: { label: "Completion Rate", color: CHART_COLORS[0] },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-analytics-title">Silver Leaf – Trainer Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Organization overview and analytics</p>
            </div>
            <Button onClick={() => navigate("/")} variant="outline" size="sm" data-testid="button-back-header">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Main Tabs */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex w-full overflow-x-auto mb-8 sm:grid sm:grid-cols-7">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <BarChart3 className="w-4 h-4 mr-2 hidden sm:inline" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="cohorts" data-testid="tab-cohorts">
              <Users className="w-4 h-4 mr-2 hidden sm:inline" />
              Cohorts
            </TabsTrigger>
            <TabsTrigger value="engagement" data-testid="tab-engagement">
              <Heart className="w-4 h-4 mr-2 hidden sm:inline" />
              Engagement
            </TabsTrigger>
            <TabsTrigger value="retention" data-testid="tab-retention">
              <Shield className="w-4 h-4 mr-2 hidden sm:inline" />
              Retention
            </TabsTrigger>
            <TabsTrigger value="demographics" data-testid="tab-demographics">
              <MapPin className="w-4 h-4 mr-2 hidden sm:inline" />
              Demographics
            </TabsTrigger>
            <TabsTrigger value="performance" data-testid="tab-performance">
              <Activity className="w-4 h-4 mr-2 hidden sm:inline" />
              Performance
            </TabsTrigger>
            <TabsTrigger value="people" data-testid="tab-people">
              <Users className="w-4 h-4 mr-2 hidden sm:inline" />
              People
            </TabsTrigger>
          </TabsList>

          {/* ===== TAB 1: OVERVIEW ===== */}
          <TabsContent value="overview">
            {/* Pipeline KPIs */}
            <div className="mb-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Pipeline Overview
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Key metrics at a glance</p>
              </div>

              {loadingPipeline ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="pt-6 h-28" />
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <KPICard
                    label="Total Candidates"
                    value={pipelineData?.totalCandidates ?? 0}
                    icon={Users}
                    color="blue"
                    subtitle="Enrolled teachers"
                  />
                  <KPICard
                    label="Gender Split"
                    value={pipelineData?.genderDistribution
                      ? `${pipelineData.genderDistribution.female || 0}F / ${pipelineData.genderDistribution.male || 0}M`
                      : "N/A"
                    }
                    icon={Users}
                    color="purple"
                    subtitle="Female / Male"
                  />
                  <KPICard
                    label="Participation Rate"
                    value={`${pipelineData?.participationRate ?? 0}%`}
                    icon={TrendingUp}
                    color="green"
                    subtitle="Active in last 30 days"
                  />
                  <KPICard
                    label="Graduation Rate"
                    value={`${pipelineData?.graduationRate ?? 0}%`}
                    icon={GraduationCap}
                    color="amber"
                    subtitle="Completed all courses"
                  />
                  <KPICard
                    label="At Risk"
                    value={pipelineData?.atRiskCount ?? 0}
                    icon={AlertCircle}
                    color="red"
                    subtitle="Below 30% completion"
                  />
                </div>
              )}
            </div>

            {/* Engagement & Retention Summary KPIs */}
            <div className="mb-8">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Engagement & Retention</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Reflections Submitted"
                  value={engagementData?.reflectionRate?.total_reflections || 0}
                  icon={FileText}
                  subtitle={`${engagementData?.reflectionRate?.fellows_with_reflections || 0} fellows`}
                  onClick={() => setShowReflectionsDialog(true)}
                />
                <KPICard
                  label="Avg Satisfaction"
                  value={satisfactionData?.overallAverages?.length > 0
                    ? `${(satisfactionData.overallAverages.reduce((sum: number, a: any) => sum + Number(a.avg_score), 0) / satisfactionData.overallAverages.length).toFixed(1)}/5`
                    : "N/A"}
                  icon={Star}
                  subtitle="across all ratings"
                />
                <KPICard
                  label="Disqualified"
                  value={disqualificationData?.byBatch?.reduce((sum: number, b: any) => sum + (b.disqualified_count || 0), 0) || 0}
                  icon={Ban}
                  color="red"
                  subtitle="total fellows"
                />
                <KPICard
                  label="Course Repetitions"
                  value={repetitionData?.reduce((sum: number, r: any) => sum + (r.total_repetitions || 0), 0) || 0}
                  icon={Repeat}
                  subtitle={`${repetitionData?.reduce((sum: number, r: any) => sum + (r.fellows_repeating || 0), 0) || 0} fellows`}
                />
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Gender Distribution Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Gender Distribution</CardTitle>
                  <CardDescription>Breakdown of candidates by gender</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingPipeline || !pipelineData?.genderDistribution ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      {loadingPipeline ? "Loading..." : "No demographic data available yet"}
                    </div>
                  ) : (() => {
                    const labelMap: Record<string, string> = { male: "Male", female: "Female", other: "Other", notSpecified: "Not Specified" };
                    const genderArray = Object.entries(pipelineData.genderDistribution)
                      .map(([gender, count]) => ({ gender, label: labelMap[gender] || gender, count: Number(count) }))
                      .filter(g => g.count > 0);
                    return genderArray.length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        No demographic data available yet
                      </div>
                    ) : (
                      <ChartContainer config={genderChartConfig} className="h-[250px] w-full">
                        <BarChart data={genderArray}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" />
                          <YAxis allowDecimals={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {genderArray.map((entry, index) => (
                              <Cell key={index} fill={genderChartConfig[entry.gender as keyof typeof genderChartConfig]?.color || CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Completion Trend Line Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Completion Trends</CardTitle>
                  <CardDescription>Monthly completion rate over time</CardDescription>
                </CardHeader>
                <CardContent>
                  {loadingTrends || !Array.isArray(completionTrends) || !completionTrends.length ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                      {loadingTrends ? "Loading..." : "No trend data available yet"}
                    </div>
                  ) : (
                    <ChartContainer config={completionChartConfig} className="h-[250px] w-full">
                      <LineChart data={completionTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tickFormatter={(val) => val ? new Date(val).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : ''} />
                        <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line
                          type="monotone"
                          dataKey="rate"
                          stroke={CHART_COLORS[0]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Courses Overview (from original) */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      Courses Overview
                    </CardTitle>
                    <CardDescription className="mt-1">Active courses and completion metrics</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingCourses ? (
                  <p className="text-muted-foreground">Loading courses...</p>
                ) : (
                  <div className="space-y-3">
                    {Array.isArray(coursesAnalytics) && coursesAnalytics.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {coursesAnalytics.map((course: CourseAnalytics) => (
                          <div
                            key={course.id}
                            className="border rounded-lg p-4 hover-elevate cursor-pointer transition-all"
                            data-testid={`card-course-${course.id}`}
                          >
                            <h3 className="font-semibold text-sm mb-3">{course.name}</h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Weeks</p>
                                <p className="font-bold text-lg">{course.weekCount || 0}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Batches</p>
                                <p className="font-bold text-lg">{course.batchAssignments || 0}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium">No courses yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Courses will appear here once they are created</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== TAB 2: COHORTS ===== */}
          <TabsContent value="cohorts">
            <div className="mb-6 flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Cohort & Batch Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">Manage batches, teachers, quizzes, progress, and certificates</p>
              </div>
              <Button size="sm" onClick={() => setShowCreateBatch(true)} data-testid="button-new-batch">
                <Plus className="w-4 h-4 mr-2" />
                New Batch
              </Button>
            </div>

            {/* Cohort Analytics Table */}
            {Array.isArray(cohortsData) && cohortsData.length > 0 && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Batch</TableHead>
                          <TableHead className="text-center">Enrolled</TableHead>
                          <TableHead className="text-center">Completion %</TableHead>
                          <TableHead className="text-center">Graduation Rate</TableHead>
                          <TableHead className="text-center">Avg Quiz Score</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cohortsData.map((cohort: any) => (
                          <TableRow key={cohort.batchId}>
                            <TableCell className="font-medium">{cohort.batchName}</TableCell>
                            <TableCell className="text-center">{cohort.enrollment}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center gap-2 justify-center">
                                <Progress value={cohort.completionPercentage} className="h-2 w-16" />
                                <span className="text-sm">{cohort.completionPercentage}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{cohort.graduationRate}%</TableCell>
                            <TableCell className="text-center">{cohort.avgQuizScore}%</TableCell>
                            <TableCell className="text-center">
                              <TrafficLightBadge status={cohort.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Enrollment vs Graduation Chart */}
            {Array.isArray(cohortsData) && cohortsData.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">Enrollment vs Graduation Rate</CardTitle>
                  <CardDescription>Comparison across cohorts</CardDescription>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={{
                    enrollment: { label: "Enrolled", color: CHART_COLORS[0] },
                    graduationRate: { label: "Graduation %", color: CHART_COLORS[2] },
                  }} className="h-[300px] w-full">
                    <BarChart data={cohortsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="batchName" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar dataKey="enrollment" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Enrolled" />
                      <Bar dataKey="graduationRate" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="Graduation %" />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Two-Panel Batch Management */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4" style={{ minHeight: "500px" }}>
              {/* Left Panel - Batch List */}
              <div className="lg:col-span-1 border rounded-lg bg-card flex flex-col" style={{ maxHeight: "calc(100vh - 300px)" }}>
                <div className="p-3 border-b">
                  <h3 className="font-semibold text-sm">Batches</h3>
                  <p className="text-xs text-muted-foreground mt-1">{Array.isArray(batchesAnalytics) ? batchesAnalytics.length : 0} total</p>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    {loadingBatches ? (
                      <p className="text-sm text-muted-foreground p-3">Loading...</p>
                    ) : Array.isArray(batchesAnalytics) && batchesAnalytics.length > 0 ? (
                      batchesAnalytics.map((batch: any) => (
                        <button
                          key={batch.id}
                          onClick={() => {
                            setExpandedBatchId(expandedBatchId === batch.id ? null : batch.id);
                            setBatchDetailTab("teachers");
                          }}
                          className={`w-full text-left p-3 rounded-lg transition-colors border ${
                            expandedBatchId === batch.id
                              ? "bg-primary/10 border-primary text-foreground"
                              : "bg-muted/30 border-transparent hover:bg-muted/50 text-foreground"
                          }`}
                          data-testid={`button-batch-${batch.id}`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <p className="font-semibold text-sm truncate">{batch.name}</p>
                            <BatchStatusBadge status={batch.status === "at-risk" ? "at-risk" : "on-track"} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {batch.teacherCount || 0} teachers
                            {typeof batch.completionPercentage === "number" ? ` · ${batch.completionPercentage}% complete` : ""}
                            {batch.completedCount ? ` · ${batch.completedCount} finished` : ""}
                          </p>
                          {batch.trainerId && (
                            <p className="text-xs text-muted-foreground truncate">
                              Trainer: {availableTrainers.find((t: any) => t.id === batch.trainerId)?.email || "Assigned"}
                            </p>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <Users className="mx-auto h-8 w-8 mb-2 opacity-50" />
                        No batches yet
                        <Button size="sm" className="mt-3 w-full" onClick={() => setShowCreateBatch(true)} data-testid="button-create-first-batch">
                          Create First Batch
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Right Panel - Batch Details */}
              {expandedBatchId ? (() => {
                const currentBatch = Array.isArray(batchesAnalytics) ? batchesAnalytics.find((b: any) => b.id === expandedBatchId) : null;
                return (
                  <div className="lg:col-span-3 border rounded-lg bg-card flex flex-col" style={{ maxHeight: "calc(100vh - 300px)" }}>
                    {/* Batch Header */}
                    <div className="p-4 border-b flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold truncate">{currentBatch?.name || "Batch"}</h2>
                        {currentBatch?.description && (
                          <p className="text-sm text-muted-foreground mt-1">{currentBatch.description}</p>
                        )}
                        {/* Trainer Assignment */}
                        <div className="flex items-center gap-2 mt-2">
                          <Select
                            value={selectedTrainerForBatch || currentBatch?.trainerId || "none"}
                            onValueChange={(val) => setSelectedTrainerForBatch(val)}
                          >
                            <SelectTrigger className="w-[200px]" data-testid={`trigger-trainer-batch-${expandedBatchId}`}>
                              <SelectValue placeholder="Assign trainer" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No trainer</SelectItem>
                              {availableTrainers.map((trainer: any) => (
                                <SelectItem key={trainer.id} value={trainer.id}>
                                  {trainer.username || trainer.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => {
                              const trainerId = selectedTrainerForBatch === "none" ? null : (selectedTrainerForBatch || currentBatch?.trainerId || null);
                              assignTrainerMutation.mutate({ batchId: expandedBatchId, trainerId });
                            }}
                            disabled={assignTrainerMutation.isPending}
                            data-testid={`button-assign-trainer-${expandedBatchId}`}
                          >
                            {assignTrainerMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                        {/* Course Assignment */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {batchCourses.length > 0 && (
                            <div className="flex flex-wrap gap-1 mr-1">
                              {batchCourses.map((bc: any) => (
                                <Badge key={bc.id} variant="secondary" className="flex items-center gap-1">
                                  <BookOpen className="w-3 h-3" />
                                  {bc.name || bc.courseName || "Course"}
                                  <button
                                    onClick={() => removeCourseFromBatchMutation.mutate({ batchId: expandedBatchId!, courseId: bc.id || bc.courseId })}
                                    className="ml-1 rounded-full"
                                    data-testid={`button-remove-course-${bc.id || bc.courseId}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                          <Select
                            value={selectedCourseForBatch}
                            onValueChange={setSelectedCourseForBatch}
                          >
                            <SelectTrigger className="w-[200px]" data-testid={`trigger-course-batch-${expandedBatchId}`}>
                              <SelectValue placeholder="Assign course" />
                            </SelectTrigger>
                            <SelectContent>
                              {allCourses
                                .filter((c: any) => !batchCourses.some((bc: any) => (bc.id || bc.courseId) === c.id))
                                .map((course: any) => (
                                  <SelectItem key={course.id} value={course.id}>
                                    {course.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (selectedCourseForBatch && expandedBatchId) {
                                assignCourseToBatchMutation.mutate({ batchId: expandedBatchId, courseId: selectedCourseForBatch });
                              }
                            }}
                            disabled={!selectedCourseForBatch || assignCourseToBatchMutation.isPending}
                            data-testid={`button-assign-course-${expandedBatchId}`}
                          >
                            {assignCourseToBatchMutation.isPending ? "Assigning..." : "Assign"}
                          </Button>
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setBatchToDelete(expandedBatchId);
                          setShowDeleteBatchConfirm(true);
                        }}
                        data-testid={`button-delete-batch-${expandedBatchId}`}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>

                    {/* Inner Tabs */}
                    <Tabs value={batchDetailTab} onValueChange={setBatchDetailTab} className="w-full flex flex-col flex-1 overflow-hidden">
                      <TabsList className="grid w-full grid-cols-4 flex-shrink-0 rounded-none border-b">
                        <TabsTrigger value="teachers" data-testid="tab-batch-teachers">
                          <Users className="mr-2 h-4 w-4" />
                          Teachers
                        </TabsTrigger>
                        <TabsTrigger value="quizzes" data-testid="tab-batch-quizzes">
                          <Award className="mr-2 h-4 w-4" />
                          Quizzes
                        </TabsTrigger>
                        <TabsTrigger value="progress" data-testid="tab-batch-progress">
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Progress
                        </TabsTrigger>
                        <TabsTrigger value="certificates" data-testid="tab-batch-certificates">
                          <FileText className="mr-2 h-4 w-4" />
                          Certificates
                        </TabsTrigger>
                      </TabsList>

                      {/* Teachers Tab */}
                      <TabsContent value="teachers" className="space-y-4 flex-1 overflow-y-auto p-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-base font-semibold">Enrolled Teachers</h3>
                          <Dialog open={addTeacherOpen} onOpenChange={setAddTeacherOpen}>
                            <Button size="sm" onClick={() => setAddTeacherOpen(true)} data-testid="button-add-teacher">
                              <Plus className="mr-2 h-4 w-4" />
                              Add
                            </Button>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Teacher to {currentBatch?.name}</DialogTitle>
                                <DialogDescription>Search by Teacher ID, name, or email address</DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label htmlFor="admin-teacher-search">Teacher ID, Name, or Email</Label>
                                  <Input
                                    id="admin-teacher-search"
                                    data-testid="input-teacher-id"
                                    type="text"
                                    placeholder="e.g., 101 · Jane Smith · jane@school.com"
                                    value={teacherIdInput}
                                    onChange={(e) => setTeacherIdInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" && expandedBatchId && teacherIdInput.trim()) {
                                        addTeacherToBatchMutation.mutate({ batchId: expandedBatchId, query: teacherIdInput });
                                      }
                                    }}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Enter a numeric ID, full name, or email — the system will find the right teacher automatically.
                                  </p>
                                </div>
                                <Button
                                  onClick={() => {
                                    if (expandedBatchId && teacherIdInput.trim()) {
                                      addTeacherToBatchMutation.mutate({
                                        batchId: expandedBatchId,
                                        query: teacherIdInput,
                                      });
                                    }
                                  }}
                                  disabled={!teacherIdInput.trim() || addTeacherToBatchMutation.isPending}
                                  data-testid="button-submit-teacher"
                                >
                                  {addTeacherToBatchMutation.isPending ? "Adding..." : "Add Teacher"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        {batchWithTeachers?.teachers?.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No teachers enrolled in this batch yet
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {batchWithTeachers?.teachers?.map((teacher: any) => {
                              const teacherProgress = batchProgress.find((tp: any) => (tp.teacher?.id || tp.teacherId) === teacher.id);
                              const completedCourses = (teacherProgress?.courseCompletions || []).filter((c: any) => c.status === "completed");
                              const inProgressCourses = (teacherProgress?.courseCompletions || []).filter((c: any) => c.status !== "completed");
                              return (
                              <Card key={teacher.id}>
                                <CardContent className="flex items-center justify-between py-4 gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold">{teacher.name || teacher.email}</p>
                                    <p className="text-sm text-muted-foreground">
                                      Teacher ID: {teacher.teacherId || teacher.id} {teacher.email && `\u2022 ${teacher.email}`}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {completedCourses.length === 0 && inProgressCourses.length === 0 ? (
                                        <span className="text-xs text-muted-foreground">No course completion yet</span>
                                      ) : (
                                        <>
                                          {completedCourses.map((c: any) => (
                                            <Badge key={c.courseId} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                              {c.courseName}: Completed
                                            </Badge>
                                          ))}
                                          {inProgressCourses.map((c: any) => (
                                            <Badge key={c.courseId} variant="secondary">
                                              {c.courseName}: {c.percentage || 0}%
                                            </Badge>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (confirm(`Remove ${teacher.name || teacher.email} from this batch?`)) {
                                        removeTeacherFromBatchMutation.mutate({
                                          batchId: expandedBatchId,
                                          teacherId: teacher.id,
                                        });
                                      }
                                    }}
                                    data-testid={`button-remove-teacher-${teacher.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </CardContent>
                              </Card>
                              );
                            })}
                          </div>
                        )}
                      </TabsContent>

                      {/* Quizzes Tab */}
                      <TabsContent value="quizzes" className="space-y-6 flex-1 overflow-y-auto p-4">
                        {/* Auto-Generated File Quizzes */}
                        <div>
                          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                            <Award className="h-4 w-4 text-primary" />
                            Auto-Generated File Quizzes
                          </h3>
                          {fileQuizzes.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
                              No auto-generated quizzes yet — they appear here after files are uploaded to course weeks
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {fileQuizzes.map((fq: any) => (
                                <Card
                                  key={fq.id}
                                  className="cursor-pointer hover-elevate"
                                  onClick={() => setEditFileQuiz({ weekId: fq.week_id, fileId: fq.deck_file_id, fileName: fq.file_name || "Unnamed file", approved: fq.approved })}
                                  data-testid={`card-file-quiz-${fq.id}`}
                                >
                                  <CardContent className="py-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium text-sm truncate">{fq.file_name || "Unnamed file"}</p>
                                          <Badge variant={fq.approved ? "default" : "secondary"} className="text-xs flex-shrink-0">
                                            {fq.approved ? "Approved" : "Pending approval"}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                          {fq.course_name} · Module {fq.week_number}{fq.competency_focus ? ` — ${fq.competency_focus}` : ""} · {fq.question_count} questions
                                        </p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditFileQuiz({ weekId: fq.week_id, fileId: fq.deck_file_id, fileName: fq.file_name || "Unnamed file", approved: fq.approved });
                                        }}
                                        data-testid={`button-edit-file-quiz-${fq.id}`}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manually Assigned Quizzes */}
                        <div>
                          <div className="flex justify-between items-center gap-2 flex-wrap mb-3">
                            <h3 className="text-base font-semibold flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-primary" />
                              Assigned Quizzes
                            </h3>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => setAssignCheckpointQuizOpen(true)} data-testid="button-assign-checkpoint-quiz">
                                <Plus className="mr-2 h-4 w-4" />
                                Checkpoint
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setAssignFileQuizOpen(true)} data-testid="button-assign-file-quiz">
                                <Plus className="mr-2 h-4 w-4" />
                                File Quiz
                              </Button>
                            </div>
                          </div>
                          {assignedQuizzes.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-muted/20">
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
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-semibold truncate">{quiz.title}</p>
                                          <Badge variant="outline" className="text-xs flex-shrink-0">
                                            {quiz.type === "checkpoint" ? "Checkpoint" : "File"}
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                          {quiz.description || "No description"}
                                        </p>
                                      </div>
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
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      {/* Progress Tab */}
                      <TabsContent value="progress" className="space-y-4 flex-1 overflow-y-auto p-4">
                        <h3 className="text-base font-semibold">Teacher Progress</h3>
                        {isLoadingProgress ? (
                          <div className="text-center py-8 text-muted-foreground">Loading progress...</div>
                        ) : batchProgress.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">No progress data available</div>
                        ) : (
                          <div className="space-y-4">
                            {batchProgress.map((tp: any) => (
                              <Card key={tp.teacher?.id || tp.teacherId}>
                                <CardHeader>
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <CardTitle className="text-base">{tp.teacher?.name || tp.teacherName || "Unknown"}</CardTitle>
                                      <CardDescription>{tp.teacher?.email || tp.teacherEmail}</CardDescription>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedTeacherForAttempts(tp);
                                        setViewTeacherAttemptsOpen(true);
                                      }}
                                      data-testid={`button-view-attempts-${tp.teacher?.id || tp.teacherId}`}
                                    >
                                      View Details
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Quizzes Taken</span>
                                      <span className="font-semibold">{tp.reportCard?.totalQuizzesTaken || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Quizzes Passed</span>
                                      <span className="font-semibold">{tp.reportCard?.totalQuizzesPassed || 0}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-muted-foreground">Average Score</span>
                                      <span className="font-semibold">{tp.reportCard?.averageScore || 0}%</span>
                                    </div>
                                  </div>
                                  {(tp.courseCompletions || []).length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-sm font-medium">Courses</p>
                                      {tp.courseCompletions.map((c: any) => (
                                        <div key={c.courseId} className="flex justify-between text-sm gap-2">
                                          <span className="truncate">{c.courseName}</span>
                                          <Badge variant={c.status === "completed" ? "default" : "secondary"}>
                                            {c.status === "completed" ? "Completed" : `${c.percentage || 0}%`}
                                          </Badge>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <Badge variant={tp.reportCard?.level === "Advanced" ? "default" : tp.reportCard?.level === "Intermediate" ? "secondary" : "outline"}>
                                    {tp.reportCard?.level || "Beginner"}
                                  </Badge>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </TabsContent>

                      {/* Certificates Tab */}
                      <TabsContent value="certificates" className="overflow-y-auto flex-1 p-4">
                        <div className="space-y-4 pr-4">
                          <div className="bg-muted/30 p-4 rounded-lg border">
                            <p className="text-sm text-muted-foreground mb-3">
                              Configure the certificate template for this batch.
                            </p>
                            <div className="space-y-4">
                              <div>
                                <Label>Appreciation Text</Label>
                                <Textarea
                                  value={appreciationText || (certificateTemplate?.appreciationText ?? "")}
                                  onChange={(e) => setAppreciationText(e.target.value)}
                                  placeholder="In recognition of successfully completing the training program"
                                  className="mt-2"
                                  data-testid="input-cert-appreciation-text"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label>Admin Name 1</Label>
                                  <Input
                                    value={adminName1 || (certificateTemplate?.adminName1 ?? "")}
                                    onChange={(e) => setAdminName1(e.target.value)}
                                    placeholder="First admin name"
                                    className="mt-2"
                                    data-testid="input-cert-admin-name-1"
                                  />
                                </div>
                                <div>
                                  <Label>Admin Name 2</Label>
                                  <Input
                                    value={adminName2 || (certificateTemplate?.adminName2 ?? "")}
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
                              {certificateTemplate?.status && (
                                <div className="text-sm p-3 rounded-lg bg-muted/50">
                                  <p className="font-medium">
                                    Status: <span className="capitalize">{certificateTemplate.status}</span>
                                  </p>
                                  {certificateTemplate.status === "approved" && (
                                    <p className="text-green-600 flex items-center gap-1 mt-1">
                                      <CheckCircle className="w-4 h-4" /> Approved
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Certificate Preview */}
                          <div className="p-4 bg-white dark:bg-slate-900 rounded-lg border">
                            <p className="text-sm font-medium mb-4 text-foreground">Certificate Preview</p>
                            <div className="border-2 border-primary rounded-lg p-8 space-y-6 text-center bg-white dark:bg-slate-900">
                              <div className="space-y-2">
                                <h1 className="text-3xl font-bold text-primary">Certificate of Completion</h1>
                                <p className="text-sm text-muted-foreground">Silverleaf Academy</p>
                              </div>
                              <div className="flex justify-center">
                                <div className="w-16 h-1 bg-primary rounded-full" />
                              </div>
                              <div className="space-y-4">
                                <p className="text-sm text-foreground">This certificate is proudly presented to</p>
                                <p className="text-2xl font-bold text-primary">Teacher Name</p>
                              </div>
                              <div className="bg-primary/5 p-4 rounded-lg">
                                <p className="text-xs leading-relaxed text-foreground italic">
                                  {appreciationText || certificateTemplate?.appreciationText || "In recognition of successfully completing the training program"}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-6 pt-6">
                                <div className="space-y-8 text-center">
                                  <div className="h-12" />
                                  <div>
                                    <p className="text-xs font-semibold text-foreground">{adminName1 || certificateTemplate?.adminName1 || "Administrator"}</p>
                                    <p className="text-xs text-muted-foreground">Authorized Signatory</p>
                                  </div>
                                </div>
                                <div className="space-y-8 text-center">
                                  <div className="h-12" />
                                  <div>
                                    <p className="text-xs font-semibold text-foreground">{adminName2 || certificateTemplate?.adminName2 || "Director"}</p>
                                    <p className="text-xs text-muted-foreground">Program Director</p>
                                  </div>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground pt-4">
                                Issued on {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </div>
                );
              })() : (
                <div className="lg:col-span-3 border rounded-lg bg-card flex items-center justify-center">
                  <div className="text-center">
                    <Users className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Select a batch to view details</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ===== ENGAGEMENT TAB ===== */}
          <TabsContent value="engagement">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Heart className="w-5 h-5" />
                Fellow Engagement
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Course completion, who finished each course, and participation — not a weekly calendar</p>
            </div>

            {loadingEngagement || loadingReflections || loadingWeekCoverage || loadingBestWeek || loadingCourseCompletion ? (
              <div className="space-y-6">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6 h-48" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Engagement KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard
                    label="Active Fellows"
                    value={engagementData?.contentViewing?.active_fellows || 0}
                    icon={Users}
                    subtitle={`of ${engagementData?.contentViewing?.total_fellows || 0} total`}
                  />
                  <KPICard
                    label="Content Completion"
                    value={engagementData?.contentViewing?.total_tracked_items > 0
                      ? `${Math.round((engagementData.contentViewing.completed_items / engagementData.contentViewing.total_tracked_items) * 100)}%`
                      : "0%"}
                    icon={BookOpen}
                    subtitle={`${engagementData?.contentViewing?.completed_items || 0} of ${engagementData?.contentViewing?.total_tracked_items || 0} items`}
                  />
                  <KPICard
                    label="Reflections Submitted"
                    value={engagementData?.reflectionRate?.total_reflections || 0}
                    icon={FileText}
                    subtitle={`${engagementData?.reflectionRate?.fellows_with_reflections || 0} fellows participated`}
                    onClick={() => setShowReflectionsDialog(true)}
                  />
                  <KPICard
                    label="Quiz Pass Rate"
                    value={engagementData?.quizCompletion?.total_attempts > 0
                      ? `${Math.round((engagementData.quizCompletion.passed_count / engagementData.quizCompletion.total_attempts) * 100)}%`
                      : "0%"}
                    icon={Award}
                    subtitle={`${engagementData?.quizCompletion?.passed_count || 0} of ${engagementData?.quizCompletion?.total_attempts || 0} passed`}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <GraduationCap className="w-4 h-4" />
                      Course Completion
                    </CardTitle>
                    <CardDescription>Which courses are complete, which teachers finished them, and overall completion %</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {courseCompletionData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Course</TableHead>
                              <TableHead>Batch</TableHead>
                              <TableHead className="text-center">Completion</TableHead>
                              <TableHead>Teachers who completed</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {courseCompletionData.map((row: any) => (
                              <TableRow key={`${row.batchId}-${row.courseId}`}>
                                <TableCell className="font-medium">{row.courseName}</TableCell>
                                <TableCell>{row.batchName}</TableCell>
                                <TableCell className="text-center">
                                  {row.completedCount}/{row.enrolled} ({row.completionPercentage}%)
                                </TableCell>
                                <TableCell>
                                  {row.completedTeachers?.length
                                    ? row.completedTeachers.map((t: any) => t.name).join(", ")
                                    : "None yet"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No course completion records yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Reflection Completion by Course */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Reflection Completion by Course
                    </CardTitle>
                    <CardDescription>Percentage of fellows who submitted reflections per course</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {reflectionData && reflectionData.length > 0 ? (
                      <ChartContainer config={{ completion_percentage: { label: "Completion %", color: CHART_COLORS[2] } }} className="h-[300px] w-full">
                        <BarChart data={reflectionData.slice(0, 20)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="course_name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={(val: number) => `${val}%`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="completion_percentage" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="Completion %" />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No reflection data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Week Coverage by Teacher */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Course / Module Coverage by Teacher
                    </CardTitle>
                    <CardDescription>Modules completed vs total modules in assigned courses (one-day courses count as one module)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {weekCoverageData && weekCoverageData.length > 0 ? (
                      <div className="space-y-3">
                        {weekCoverageData.slice(0, 15).map((teacher: any) => (
                          <div key={teacher.teacher_id} className="flex items-center gap-4">
                            <div className="w-36 truncate text-sm font-medium">{teacher.teacher_name}</div>
                            <div className="flex-1">
                              <Progress value={Number(teacher.coverage_percentage)} className="h-3" />
                            </div>
                            <div className="w-24 text-right text-sm text-muted-foreground">
                              {teacher.completed_weeks}/{teacher.total_weeks} modules ({teacher.coverage_percentage}%)
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No module coverage data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Best Formed Week */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      Best Formed Modules
                    </CardTitle>
                    <CardDescription>Top performing modules by composite score (completion 40% + quiz pass 40% + reflections 20%)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {bestFormedWeekData && bestFormedWeekData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Course</TableHead>
                              <TableHead>Module</TableHead>
                              <TableHead className="text-center">Completions</TableHead>
                              <TableHead className="text-center">Quiz Passes</TableHead>
                              <TableHead className="text-center">Reflections</TableHead>
                              <TableHead className="text-center">Score</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {bestFormedWeekData.slice(0, 10).map((week: any, index: number) => (
                              <TableRow key={week.week_id}>
                                <TableCell className="font-medium">{week.course_name}</TableCell>
                                <TableCell>Module {week.week_number}</TableCell>
                                <TableCell className="text-center">{week.completions}/{week.total_accessed}</TableCell>
                                <TableCell className="text-center">{week.quiz_passes}/{week.quiz_attempts}</TableCell>
                                <TableCell className="text-center">{week.reflections_count}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={Number(week.composite_score) >= 70 ? "default" : Number(week.composite_score) >= 40 ? "secondary" : "destructive"}>
                                    {week.composite_score}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No module performance data yet</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ===== RETENTION TAB ===== */}
          <TabsContent value="retention">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Retention & Discipline
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Disqualification rates, course repetition, satisfaction scores, quiz performance, and trainer feedback</p>
            </div>

            {loadingDisqualification || loadingRepetition || loadingSatisfaction || loadingQuizPerformance || loadingCourseAssignment ? (
              <div className="space-y-6">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6 h-48" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Retention KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <KPICard
                    label="Disqualified Fellows"
                    value={disqualificationData?.byBatch?.reduce((sum: number, b: any) => sum + (b.disqualified_count || 0), 0) || 0}
                    icon={Ban}
                    color="destructive"
                    subtitle="across all cohorts"
                  />
                  <KPICard
                    label="Course Repetitions"
                    value={repetitionData?.reduce((sum: number, r: any) => sum + (r.total_repetitions || 0), 0) || 0}
                    icon={Repeat}
                    subtitle={`${repetitionData?.reduce((sum: number, r: any) => sum + (r.fellows_repeating || 0), 0) || 0} fellows repeating`}
                  />
                  <KPICard
                    label="Avg Satisfaction"
                    value={satisfactionData?.overallAverages?.length > 0
                      ? `${(satisfactionData.overallAverages.reduce((sum: number, a: any) => sum + Number(a.avg_score), 0) / satisfactionData.overallAverages.length).toFixed(1)}/5`
                      : "N/A"}
                    icon={Star}
                    subtitle={`${satisfactionData?.overallAverages?.reduce((sum: number, a: any) => sum + (a.total_ratings || 0), 0) || 0} ratings total`}
                  />
                  <KPICard
                    label="Quiz Pass Rate"
                    value={quizPerformanceData?.perCohort?.length > 0
                      ? `${(quizPerformanceData.perCohort.reduce((sum: number, c: any) => sum + Number(c.pass_rate || 0), 0) / quizPerformanceData.perCohort.length).toFixed(1)}%`
                      : "N/A"}
                    icon={Award}
                    subtitle="average across cohorts"
                  />
                </div>

                {/* Disqualification Rate by Cohort */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Ban className="w-4 h-4 text-red-500" />
                      Disqualification Rate by Cohort
                    </CardTitle>
                    <CardDescription>Percentage of fellows disqualified per batch</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {disqualificationData?.byBatch?.length > 0 ? (
                      <ChartContainer config={{ disqualification_rate: { label: "Disqualification %", color: CHART_COLORS[4] } }} className="h-[300px] w-full">
                        <BarChart data={disqualificationData.byBatch}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="batch_name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={(val: number) => `${val}%`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="disqualification_rate" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} name="Disqualification %" />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                        <div className="text-center">
                          <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
                          <p className="font-medium">No disqualifications recorded</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Disqualification Monthly Trend */}
                {disqualificationData?.monthlyTrend?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Disqualification Trend</CardTitle>
                      <CardDescription>Monthly disqualification counts</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={{ count: { label: "Disqualifications", color: CHART_COLORS[4] } }} className="h-[250px] w-full">
                        <LineChart data={disqualificationData.monthlyTrend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line type="monotone" dataKey="count" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Course Repetition Rate */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Repeat className="w-4 h-4" />
                      Course Repetition Rate
                    </CardTitle>
                    <CardDescription>How many fellows had to repeat courses</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {repetitionData && repetitionData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Course</TableHead>
                              <TableHead className="text-center">Fellows Repeating</TableHead>
                              <TableHead className="text-center">Total Repetitions</TableHead>
                              <TableHead className="text-center">Avg Repetitions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {repetitionData.map((row: any) => (
                              <TableRow key={row.course_id}>
                                <TableCell className="font-medium">{row.course_name}</TableCell>
                                <TableCell className="text-center">{row.fellows_repeating}</TableCell>
                                <TableCell className="text-center">{row.total_repetitions}</TableCell>
                                <TableCell className="text-center">{row.avg_repetitions}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No course repetition data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Satisfaction Score Trends */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      Satisfaction Score Trends
                    </CardTitle>
                    <CardDescription>Average satisfaction ratings over time (1-5 scale)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {satisfactionData?.trends?.length > 0 ? (
                      <ChartContainer config={{
                        avg_score: { label: "Avg Score", color: CHART_COLORS[3] },
                      }} className="h-[300px] w-full">
                        <LineChart data={satisfactionData.trends}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis domain={[0, 5]} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line type="monotone" dataKey="avg_score" stroke={CHART_COLORS[3]} strokeWidth={2} dot={{ r: 4 }} name="Avg Score" />
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No satisfaction data yet</div>
                    )}
                    {/* Satisfaction Averages by Type */}
                    {satisfactionData?.overallAverages?.length > 0 && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {satisfactionData.overallAverages.map((avg: any) => (
                          <div key={avg.type} className="p-3 rounded-lg border bg-muted/50">
                            <p className="text-xs text-muted-foreground capitalize">{avg.type.replace(/_/g, ' ')}</p>
                            <p className="text-lg font-bold">{avg.avg_score}/5</p>
                            <p className="text-xs text-muted-foreground">{avg.total_ratings} ratings</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Quiz Performance by Cohort */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Award className="w-4 h-4" />
                      Quiz Performance by Cohort
                    </CardTitle>
                    <CardDescription>Pass rates and average scores per batch</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {quizPerformanceData?.perCohort?.length > 0 ? (
                      <ChartContainer config={{
                        pass_rate: { label: "Pass Rate %", color: CHART_COLORS[2] },
                        avg_score: { label: "Avg Score", color: CHART_COLORS[0] },
                      }} className="h-[300px] w-full">
                        <BarChart data={quizPerformanceData.perCohort}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="batch_name" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={(val: number) => `${val}%`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="pass_rate" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="Pass Rate %" />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No quiz performance data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Quiz Performance by Fellow */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Quiz Performance by Fellow</CardTitle>
                    <CardDescription>Individual quiz scores and pass rates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {quizPerformanceData?.perFellow?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fellow</TableHead>
                              <TableHead className="text-center">Attempts</TableHead>
                              <TableHead className="text-center">Passed</TableHead>
                              <TableHead className="text-center">Avg Score</TableHead>
                              <TableHead className="text-center">Pass Rate</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quizPerformanceData.perFellow.slice(0, 20).map((fellow: any) => (
                              <TableRow key={fellow.teacher_id}>
                                <TableCell className="font-medium">{fellow.teacher_name}</TableCell>
                                <TableCell className="text-center">{fellow.total_attempts}</TableCell>
                                <TableCell className="text-center">{fellow.passed_count}</TableCell>
                                <TableCell className="text-center">{fellow.avg_score}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={Number(fellow.pass_rate) >= 70 ? "default" : Number(fellow.pass_rate) >= 40 ? "secondary" : "destructive"}>
                                    {fellow.pass_rate}%
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No fellow quiz data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Course Assignment Tracking */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Course Assignments by Trainers
                    </CardTitle>
                    <CardDescription>Which trainers assigned which courses to batches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {courseAssignmentData && courseAssignmentData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Trainer</TableHead>
                              <TableHead>Course</TableHead>
                              <TableHead>Batch</TableHead>
                              <TableHead>Assigned Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {courseAssignmentData.slice(0, 20).map((row: any, index: number) => (
                              <TableRow key={`${row.batch_id}-${row.course_id}-${index}`}>
                                <TableCell className="font-medium">{row.trainer_name}</TableCell>
                                <TableCell>{row.course_name}</TableCell>
                                <TableCell>{row.batch_name}</TableCell>
                                <TableCell className="text-muted-foreground">
                                  {row.assigned_at ? new Date(row.assigned_at).toLocaleDateString() : "N/A"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No course assignment data yet</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ===== TAB 3: DEMOGRAPHICS ===== */}
          <TabsContent value="demographics">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Demographics & Diversity
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Candidate demographics and diversity breakdown</p>
              <p className="text-xs text-muted-foreground mt-1 bg-muted/40 rounded px-2 py-1 inline-block">
                ℹ️ Data sourced from teacher profile information (gender, location, qualification, employment status) provided at registration. Incomplete profiles show as "Not Specified" / "Unknown".
              </p>
            </div>

            {loadingDemographics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6 h-72" />
                  </Card>
                ))}
              </div>
            ) : !demographicsData ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <MapPin className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No demographic data available</p>
                  <p className="text-sm text-muted-foreground mt-1">Demographics will appear as teachers fill in their profile information</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gender Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Gender Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {demographicsData.gender?.length > 0 ? (
                      <ChartContainer config={genderChartConfig} className="h-[250px] w-full">
                        <PieChart>
                          <Pie
                            data={demographicsData.gender.map((g: any) => ({
                              ...g,
                              name: g.gender || "Not Specified",
                            }))}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, count }: any) => `${name}: ${count}`}
                          >
                            {demographicsData.gender.map((_: any, index: number) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Geographic Bar Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Geographic Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {demographicsData.geographic?.length > 0 ? (
                      <ChartContainer config={{ count: { label: "Candidates", color: CHART_COLORS[1] } }} className="h-[250px] w-full">
                        <BarChart data={demographicsData.geographic} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" allowDecimals={false} />
                          <YAxis dataKey="location" type="category" width={100} tick={{ fontSize: 12 }} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No location data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Qualification Pie Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Qualification Levels</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {demographicsData.qualification?.length > 0 ? (
                      <ChartContainer config={{ count: { label: "Candidates", color: CHART_COLORS[2] } }} className="h-[250px] w-full">
                        <PieChart>
                          <Pie
                            data={demographicsData.qualification.map((q: any) => ({
                              ...q,
                              name: q.qualification || "Not Specified",
                            }))}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, count }: any) => `${name}: ${count}`}
                          >
                            {demographicsData.qualification.map((_: any, index: number) => (
                              <Cell key={index} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <ChartTooltip content={<ChartTooltipContent />} />
                        </PieChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No qualification data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Employment Bar Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Employment Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {demographicsData.employment?.length > 0 ? (
                      <ChartContainer config={{ count: { label: "Candidates", color: CHART_COLORS[3] } }} className="h-[250px] w-full">
                        <BarChart data={demographicsData.employment}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No employment data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* Experience Breakdown */}
                {demographicsData.experience?.length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Years of Experience</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer config={{ count: { label: "Candidates", color: CHART_COLORS[5] } }} className="h-[250px] w-full">
                        <BarChart data={demographicsData.experience}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range" />
                          <YAxis allowDecimals={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="count" fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ===== TAB 4: PERFORMANCE ===== */}
          <TabsContent value="performance">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Performance Analytics
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Completion trends, at-risk identification, and batch comparison</p>
            </div>

            {loadingPerformance ? (
              <div className="space-y-6">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="pt-6 h-48" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Completion Rate Trends */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Completion Rate Trends</CardTitle>
                    <CardDescription>Monthly completion rates across all batches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {performanceData?.completionRateTrends?.length > 0 ? (
                      <ChartContainer config={completionChartConfig} className="h-[300px] w-full">
                        <LineChart data={performanceData.completionRateTrends}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="period" />
                          <YAxis allowDecimals={false} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Line
                            type="monotone"
                            dataKey="rate"
                            stroke={CHART_COLORS[0]}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No completion trend data yet</div>
                    )}
                  </CardContent>
                </Card>

                {/* At-Risk Fellows */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      At-Risk Fellows
                    </CardTitle>
                    <CardDescription>Candidates with less than 30% completion rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {performanceData?.atRiskFellows?.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Batch</TableHead>
                              <TableHead className="text-center">Completion</TableHead>
                              <TableHead className="text-center">Last Active</TableHead>
                              <TableHead className="text-center">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {performanceData.atRiskFellows.map((fellow: any) => (
                              <TableRow key={fellow.teacherId}>
                                <TableCell className="font-medium">{fellow.teacherName || fellow.name || fellow.email}</TableCell>
                                <TableCell>{fellow.batchName || "Unassigned"}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center gap-2 justify-center">
                                    <Progress value={fellow.completionPercentage} className="h-2 w-16" />
                                    <span className="text-sm">{fellow.completionPercentage}%</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center text-sm text-muted-foreground">
                                  {fellow.lastActive ? new Date(fellow.lastActive).toLocaleDateString() : "Never"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={fellow.status === "inactive" ? "destructive" : "secondary"} className="text-xs">
                                    {fellow.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <CheckCircle className="w-12 h-12 text-green-500/30 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium">No at-risk fellows</p>
                        <p className="text-sm text-muted-foreground mt-1">All candidates are making good progress</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Batch Comparison */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Batch Comparison</CardTitle>
                    <CardDescription>Average completion rates across batches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {performanceData?.batchComparison?.length > 0 ? (
                      <ChartContainer config={{ avgCompletion: { label: "Avg Completion %", color: CHART_COLORS[2] } }} className="h-[300px] w-full">
                        <BarChart data={performanceData.batchComparison}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="batchName" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="avgCompletion" radius={[4, 4, 0, 0]}>
                            {performanceData.batchComparison.map((entry: any, index: number) => {
                              let color = CHART_COLORS[2]; // green
                              if (entry.avgCompletion < 30) color = CHART_COLORS[4]; // red
                              else if (entry.avgCompletion < 60) color = CHART_COLORS[3]; // amber
                              return <Cell key={index} fill={color} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No batch comparison data yet</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ===== TAB 5: PEOPLE ===== */}
          <TabsContent value="people">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      People Overview
                    </CardTitle>
                    <CardDescription className="mt-1">Trainers and teachers with activity metrics</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setShowAddUser(true)} data-testid="button-add-user">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <p className="text-muted-foreground">Loading people...</p>
                ) : (
                  <Tabs defaultValue="trainers" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="trainers" data-testid="tab-trainers">
                        Trainers ({totalTrainers})
                      </TabsTrigger>
                      <TabsTrigger value="teachers" data-testid="tab-teachers">
                        Teachers ({totalTeachers})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="trainers" className="space-y-3 mt-4">
                      {Array.isArray(allUsers) && allUsers.filter((u: any) => u.role === "trainer").length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {allUsers
                            .filter((u: any) => u.role === "trainer")
                            .map((trainer: UserWithStats) => (
                              <button
                                key={trainer.id}
                                onClick={() => setSelectedUser(trainer)}
                                className="p-4 border rounded-lg hover-elevate text-left transition-all"
                                data-testid={`button-trainer-${trainer.id}`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <p className="font-semibold text-sm">{trainer.email}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Trainer</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">{trainer.batchCount || 0} batches</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{trainer.courseCount || 0} courses assigned</p>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-muted-foreground font-medium">No trainers</p>
                          <p className="text-sm text-muted-foreground mt-1">Invite trainers to create and manage courses</p>
                          <Button size="sm" className="mt-4" data-testid="button-invite-trainer">
                            Invite Trainer
                          </Button>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="teachers" className="space-y-3 mt-4">
                      {Array.isArray(allUsers) && allUsers.filter((u: any) => u.role === "teacher").length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {allUsers
                            .filter((u: any) => u.role === "teacher")
                            .map((teacher: UserWithStats) => (
                              <button
                                key={teacher.id}
                                onClick={() => setSelectedUser(teacher)}
                                className="p-4 border rounded-lg hover-elevate text-left transition-all"
                                data-testid={`button-teacher-${teacher.id}`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <p className="font-semibold text-sm">{teacher.email}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Teacher</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs">{teacher.courseCount || 0} courses</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">ID: {teacher.id.slice(0, 8)}...</p>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-muted-foreground font-medium">No teachers</p>
                          <p className="text-sm text-muted-foreground mt-1">Teachers will appear here once they are approved</p>
                          <Button size="sm" className="mt-4" data-testid="button-invite-teacher">
                            Invite Teacher
                          </Button>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm"
                    onClick={() => setShowManageTrainers(true)}
                    data-testid="button-manage-trainers"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Manage Trainers
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-sm"
                    onClick={() => setShowManageTeachers(true)}
                    data-testid="button-manage-teachers"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Manage Teachers
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">System Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">All Systems</p>
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  </div>
                  <Progress value={100} className="h-2" />
                  <p className="text-xs text-muted-foreground">Operational</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== ALL MODALS (preserved exactly) ===== */}

      {/* User Profile Modal */}
      <Dialog open={selectedUser !== null} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <DialogTitle>User Profile</DialogTitle>
              <button onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground" data-testid="button-close-modal">
                <X className="w-4 h-4" />
              </button>
            </div>
          </DialogHeader>
          <DialogDescription>View user details and activity</DialogDescription>

          {selectedUser && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-semibold">{selectedUser.email}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Role</p>
                  <p className="font-semibold capitalize">{selectedUser.role}</p>
                </div>
                {selectedUser.role === "trainer" && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Batches</p>
                    <p className="font-semibold">{selectedUser.batchCount || 0}</p>
                  </div>
                )}
                {selectedUser.role === "teacher" && (
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Courses</p>
                    <p className="font-semibold">{selectedUser.courseCount || 0}</p>
                  </div>
                )}
              </div>

              <Button
                onClick={() => setViewingActivityUserId(selectedUser.id)}
                className="w-full"
                data-testid={`button-view-activity-${selectedUser.id}`}
              >
                View Activity
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* User Activity Modal */}
      <Dialog open={viewingActivityUserId !== null} onOpenChange={(open) => !open && setViewingActivityUserId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Activity</DialogTitle>
          </DialogHeader>
          <DialogDescription>Track user progress and performance</DialogDescription>

          {selectedUser && viewingActivityUserId && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-2">Progress</p>
                <Progress value={(userActivityStats as any)?.progressPercentage || 0} className="h-2 mb-2" />
                <p className="text-sm font-semibold">{(userActivityStats as any)?.progressPercentage || 0}% Complete</p>
              </div>

              {selectedUser.role === "teacher" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Quizzes Attempted</p>
                    <p className="text-lg font-bold">{(userActivityStats as any)?.totalQuizzes || 0}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Quizzes Passed</p>
                    <p className="text-lg font-bold">{(userActivityStats as any)?.totalPassed || 0}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Courses Completed</p>
                    <p className="text-lg font-bold">{(userActivityStats as any)?.totalCompleted || 0} / {(userActivityStats as any)?.totalAssigned || 0}</p>
                  </div>
                </div>
              )}

              {selectedUser.role === "trainer" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Courses Created</p>
                    <p className="text-lg font-bold">{(userActivityStats as any)?.totalCourses || 0}</p>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Quizzes Generated</p>
                    <p className="text-lg font-bold">{(userActivityStats as any)?.totalQuizzes || 0}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manage Trainers Modal */}
      <Dialog open={showManageTrainers} onOpenChange={setShowManageTrainers}>
        <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Trainers</DialogTitle>
          </DialogHeader>
          <DialogDescription>Restrict, unrestrict, or remove trainers from the system</DialogDescription>

          <div className="space-y-2">
            {Array.isArray(allUsers) && allUsers.filter((u: any) => u.role === "trainer").length > 0 ? (
              allUsers
                .filter((u: any) => u.role === "trainer")
                .map((trainer: UserWithStats) => (
                  <div
                    key={trainer.id}
                    className="p-3 border rounded-lg flex justify-between items-center"
                    data-testid={`item-trainer-${trainer.id}`}
                  >
                    <div>
                      <p className="font-semibold text-sm">{trainer.email}</p>
                      <p className="text-xs text-muted-foreground">{trainer.batchCount || 0} batches</p>
                    </div>
                    <div className="flex gap-2">
                      {trainer.approvalStatus === "restricted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setUserToManage(trainer);
                            setActionType("unrestrict");
                            setShowConfirmRestrict(true);
                          }}
                          data-testid={`button-unrestrict-trainer-${trainer.id}`}
                          disabled={unrestrictTrainerMutation.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Unrestrict
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setUserToManage(trainer);
                            setActionType("restrict");
                            setShowConfirmRestrict(true);
                          }}
                          data-testid={`button-restrict-trainer-${trainer.id}`}
                          disabled={restrictTrainerMutation.isPending}
                        >
                          <Ban className="w-3 h-3 mr-1" />
                          Restrict
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setUserToManage(trainer);
                          setActionType("delete");
                          setShowConfirmDelete(true);
                        }}
                        data-testid={`button-delete-trainer-${trainer.id}`}
                        disabled={dismissTrainerMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-muted-foreground text-center py-4">No trainers to manage</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Teachers Modal */}
      <Dialog open={showManageTeachers} onOpenChange={setShowManageTeachers}>
        <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Teachers</DialogTitle>
          </DialogHeader>
          <DialogDescription>Restrict, unrestrict, or remove teachers from the system</DialogDescription>

          <div className="space-y-2">
            {Array.isArray(allUsers) && allUsers.filter((u: any) => u.role === "teacher").length > 0 ? (
              allUsers
                .filter((u: any) => u.role === "teacher")
                .map((teacher: UserWithStats) => (
                  <div
                    key={teacher.id}
                    className="p-3 border rounded-lg flex justify-between items-center"
                    data-testid={`item-teacher-${teacher.id}`}
                  >
                    <div>
                      <p className="font-semibold text-sm">{teacher.email}</p>
                      <p className="text-xs text-muted-foreground">{teacher.courseCount || 0} courses</p>
                    </div>
                    <div className="flex gap-2">
                      {teacher.approvalStatus === "restricted" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setUserToManage(teacher);
                            setActionType("unrestrict");
                            setShowConfirmRestrict(true);
                          }}
                          data-testid={`button-unrestrict-teacher-${teacher.id}`}
                          disabled={unrestrictTeacherMutation.isPending}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Unrestrict
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setUserToManage(teacher);
                            setActionType("restrict");
                            setShowConfirmRestrict(true);
                          }}
                          data-testid={`button-restrict-teacher-${teacher.id}`}
                          disabled={restrictTeacherMutation.isPending}
                        >
                          <Ban className="w-3 h-3 mr-1" />
                          Restrict
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setUserToManage(teacher);
                          setActionType("delete");
                          setShowConfirmDelete(true);
                        }}
                        data-testid={`button-delete-teacher-${teacher.id}`}
                        disabled={dismissTeacherMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-muted-foreground text-center py-4">No teachers to manage</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Modal */}
      <Dialog open={showConfirmDelete} onOpenChange={setShowConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove User?</DialogTitle>
          </DialogHeader>
          <DialogDescription>This action cannot be undone</DialogDescription>

          {userToManage && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to remove <strong>{userToManage.email}</strong>? This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirmDelete(false)} data-testid="button-cancel-delete">
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    if (userToManage.role === "trainer") {
                      dismissTrainerMutation.mutate(userToManage.id);
                    } else if (userToManage.role === "teacher") {
                      dismissTeacherMutation.mutate(userToManage.id);
                    }
                    setShowConfirmDelete(false);
                  }}
                  data-testid="button-confirm-delete"
                  disabled={dismissTrainerMutation.isPending || dismissTeacherMutation.isPending}
                >
                  {dismissTrainerMutation.isPending || dismissTeacherMutation.isPending ? "Removing..." : "Remove"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Restrict/Unrestrict Modal */}
      <Dialog open={showConfirmRestrict} onOpenChange={setShowConfirmRestrict}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{actionType === "unrestrict" ? "Unrestrict User?" : "Restrict User?"}</DialogTitle>
          </DialogHeader>
          <DialogDescription>Please confirm this action</DialogDescription>

          {userToManage && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {actionType === "unrestrict"
                  ? `Are you sure you want to unrestrict ${userToManage.email}? They will be able to access the system again.`
                  : `Are you sure you want to restrict ${userToManage.email}? They will be unable to access the system.`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirmRestrict(false)} data-testid="button-cancel-restrict">
                  Cancel
                </Button>
                <Button
                  variant={actionType === "unrestrict" ? "default" : "secondary"}
                  className="flex-1"
                  onClick={() => {
                    if (actionType === "restrict") {
                      if (userToManage.role === "trainer") {
                        restrictTrainerMutation.mutate(userToManage.id);
                      } else if (userToManage.role === "teacher") {
                        restrictTeacherMutation.mutate(userToManage.id);
                      }
                    } else if (actionType === "unrestrict") {
                      if (userToManage.role === "trainer") {
                        unrestrictTrainerMutation.mutate(userToManage.id);
                      } else if (userToManage.role === "teacher") {
                        unrestrictTeacherMutation.mutate(userToManage.id);
                      }
                    }
                    setShowConfirmRestrict(false);
                  }}
                  data-testid="button-confirm-restrict"
                  disabled={restrictTrainerMutation.isPending || restrictTeacherMutation.isPending || unrestrictTrainerMutation.isPending || unrestrictTeacherMutation.isPending}
                >
                  {restrictTrainerMutation.isPending || restrictTeacherMutation.isPending || unrestrictTrainerMutation.isPending || unrestrictTeacherMutation.isPending
                    ? actionType === "unrestrict"
                      ? "Unrestricting..."
                      : "Restricting..."
                    : actionType === "unrestrict"
                      ? "Unrestrict"
                      : "Restrict"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Checkpoint Quiz Dialog */}
      <Dialog open={assignCheckpointQuizOpen} onOpenChange={setAssignCheckpointQuizOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Checkpoint Quiz</DialogTitle>
            <DialogDescription>Create a quiz based on a training week's content</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" data-testid="input-quiz-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={quizDescription} onChange={(e) => setQuizDescription(e.target.value)} placeholder="Quiz description" data-testid="input-quiz-description" />
            </div>
            <div>
              <Label>Training Week</Label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger data-testid="select-training-week">
                  <SelectValue placeholder="Select a week" />
                </SelectTrigger>
                <SelectContent>
                  {trainingWeeks.map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.title || `Week ${w.weekNumber}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Number of Questions</Label>
              <Input type="number" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} data-testid="input-num-questions" />
            </div>
            <Button
              disabled={!quizTitle || !selectedWeek || assignCheckpointQuizMutation.isPending}
              onClick={() => {
                if (expandedBatchId) {
                  assignCheckpointQuizMutation.mutate({
                    batchId: expandedBatchId,
                    weekId: selectedWeek,
                    title: quizTitle,
                    description: quizDescription,
                    numQuestions: parseInt(numQuestions),
                  });
                }
              }}
              data-testid="button-submit-checkpoint-quiz"
            >
              {assignCheckpointQuizMutation.isPending ? "Assigning..." : "Assign Quiz"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign File Quiz Dialog */}
      <Dialog open={assignFileQuizOpen} onOpenChange={setAssignFileQuizOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign File Quiz</DialogTitle>
            <DialogDescription>Create a quiz from an uploaded presentation file</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" data-testid="input-file-quiz-title" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={quizDescription} onChange={(e) => setQuizDescription(e.target.value)} placeholder="Quiz description" data-testid="input-file-quiz-description" />
            </div>
            <div>
              <Label>Training Week</Label>
              <Select value={selectedWeek} onValueChange={(v) => { setSelectedWeek(v); setSelectedFileId(""); }}>
                <SelectTrigger data-testid="select-file-quiz-week">
                  <SelectValue placeholder="Select a week" />
                </SelectTrigger>
                <SelectContent>
                  {trainingWeeks.map((w: any) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.title || `Week ${w.weekNumber}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedWeek && (
              <div>
                <Label>File</Label>
                <Select value={selectedFileId} onValueChange={setSelectedFileId}>
                  <SelectTrigger data-testid="select-file-quiz-file">
                    <SelectValue placeholder="Select a file" />
                  </SelectTrigger>
                  <SelectContent>
                    {weekFiles.map((f: any) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.originalName || f.fileName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Number of Questions</Label>
              <Input type="number" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)} data-testid="input-file-num-questions" />
            </div>
            <Button
              disabled={!quizTitle || !selectedWeek || !selectedFileId || assignFileQuizMutation.isPending}
              onClick={() => {
                if (expandedBatchId) {
                  assignFileQuizMutation.mutate({
                    batchId: expandedBatchId,
                    weekId: selectedWeek,
                    fileId: selectedFileId,
                    title: quizTitle,
                    description: quizDescription,
                    numQuestions: parseInt(numQuestions),
                  });
                }
              }}
              data-testid="button-submit-file-quiz"
            >
              {assignFileQuizMutation.isPending ? "Assigning..." : "Assign File Quiz"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quiz Details Dialog */}
      <Dialog open={viewQuizDetailsOpen} onOpenChange={setViewQuizDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quiz Details</DialogTitle>
            <DialogDescription>{quizDetails?.title || "Loading..."}</DialogDescription>
          </DialogHeader>
          {quizDetails ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground">{quizDetails.description || "No description"}</p>
              </div>
              {quizDetails.questions && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Questions ({quizDetails.questions.length})</p>
                  {quizDetails.questions.map((q: any, i: number) => (
                    <div key={i} className="border rounded-lg p-3">
                      <p className="text-sm font-medium mb-2">{i + 1}. {q.question}</p>
                      {q.options?.map((opt: string, j: number) => (
                        <p key={j} className={`text-xs pl-4 py-0.5 ${j === q.correctAnswer ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                          {String.fromCharCode(65 + j)}. {opt}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Loading quiz details...</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Teacher Attempts Dialog */}
      <Dialog open={viewTeacherAttemptsOpen} onOpenChange={setViewTeacherAttemptsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Quiz Attempts</DialogTitle>
            <DialogDescription>{selectedTeacherForAttempts?.teacher?.name || selectedTeacherForAttempts?.teacherName || "Teacher"}</DialogDescription>
          </DialogHeader>
          {teacherAttempts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No quiz attempts found</p>
          ) : (
            <div className="space-y-3">
              {teacherAttempts.map((attempt: any) => (
                <Card key={attempt.id}>
                  <CardContent className="py-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-medium text-sm">{attempt.quizTitle || "Quiz"}</p>
                        <p className="text-xs text-muted-foreground">
                          {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString() : "In progress"}
                        </p>
                      </div>
                      <Badge variant={attempt.score >= 70 ? "default" : "destructive"}>
                        {attempt.score}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Batch Modal */}
      <Dialog open={showCreateBatch} onOpenChange={setShowCreateBatch}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
            <DialogDescription>Create a batch to group teachers and assign courses</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="batchName">Batch Name</Label>
              <Input
                id="batchName"
                placeholder="Enter batch name"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                data-testid="input-new-batch-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="batchDescription">Description (optional)</Label>
              <Input
                id="batchDescription"
                placeholder="Enter batch description"
                value={newBatchDescription}
                onChange={(e) => setNewBatchDescription(e.target.value)}
                data-testid="input-new-batch-description"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowCreateBatch(false);
                setNewBatchName("");
                setNewBatchDescription("");
              }}
              data-testid="button-cancel-create-batch"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!newBatchName.trim()) {
                  toast({
                    title: "Error",
                    description: "Please enter a batch name.",
                    variant: "destructive"
                  });
                  return;
                }
                createBatchMutation.mutate({
                  name: newBatchName.trim(),
                  description: newBatchDescription.trim(),
                });
              }}
              disabled={createBatchMutation.isPending}
              data-testid="button-confirm-create-batch"
            >
              {createBatchMutation.isPending ? "Creating..." : "Create Batch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Confirmation Modal */}
      <Dialog open={showDeleteBatchConfirm} onOpenChange={setShowDeleteBatchConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Batch</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this batch? This action cannot be undone and will remove all teacher assignments and course assignments for this batch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowDeleteBatchConfirm(false);
                setBatchToDelete(null);
              }}
              data-testid="button-cancel-delete-batch"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (batchToDelete) {
                  deleteBatchMutation.mutate(batchToDelete);
                }
              }}
              disabled={deleteBatchMutation.isPending}
              data-testid="button-confirm-delete-batch"
            >
              {deleteBatchMutation.isPending ? "Deleting..." : "Delete Batch"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Modal */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new admin, trainer, or teacher account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="Enter full name"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                data-testid="input-new-user-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                data-testid="input-new-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password (min 6 characters)"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                data-testid="input-new-user-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={newUserRole} onValueChange={(value: "admin" | "trainer" | "teacher") => setNewUserRole(value)}>
                <SelectTrigger data-testid="select-new-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="trainer">Trainer</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowAddUser(false);
                setNewUserEmail("");
                setNewUserPassword("");
                setNewUserName("");
                setNewUserRole("teacher");
              }}
              data-testid="button-cancel-add-user"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!newUserEmail || !newUserPassword || !newUserName) {
                  toast({
                    title: "Error",
                    description: "Please fill in all fields.",
                    variant: "destructive"
                  });
                  return;
                }
                if (newUserPassword.length < 6) {
                  toast({
                    title: "Error",
                    description: "Password must be at least 6 characters.",
                    variant: "destructive"
                  });
                  return;
                }
                createUserMutation.mutate({
                  email: newUserEmail,
                  password: newUserPassword,
                  name: newUserName,
                  role: newUserRole,
                });
              }}
              disabled={createUserMutation.isPending}
              data-testid="button-confirm-add-user"
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Quiz Edit Dialog */}
      {editFileQuiz && (
        <FileQuizEditDialog
          open={!!editFileQuiz}
          onClose={() => setEditFileQuiz(null)}
          weekId={editFileQuiz.weekId}
          fileId={editFileQuiz.fileId}
          fileName={editFileQuiz.fileName}
          initialQuestions={editFileQuizStatus?.[editFileQuiz.fileId]?.questions ?? []}
          approved={editFileQuiz.approved}
          onQuizStatusChange={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/batches", expandedBatchId, "file-quizzes"] });
            queryClient.invalidateQueries({ queryKey: ["/api/training-weeks", editFileQuiz.weekId, "quiz-status"] });
          }}
        />
      )}

      {/* All Reflections Dialog */}
      <Dialog open={showReflectionsDialog} onOpenChange={setShowReflectionsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Submitted Reflections
            </DialogTitle>
            <DialogDescription>
              {allReflections.length} reflection{allReflections.length !== 1 ? "s" : ""} submitted across all batches
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-2">
            {loadingAllReflections ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading reflections...
              </div>
            ) : allReflections.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                No reflections submitted yet.
              </div>
            ) : (
              <div className="space-y-4 py-1">
                {allReflections.map((r: any) => (
                  <Card key={r.id} className="border">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="font-semibold text-sm">{r.teacher_name}</span>
                        {r.teacher_code && (
                          <Badge variant="secondary" className="text-xs">{r.teacher_code}</Badge>
                        )}
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{r.batch_name}</span>
                        {r.course_name && (
                          <>
                            <span className="text-muted-foreground text-xs">·</span>
                            <span className="text-xs text-muted-foreground">{r.course_name}</span>
                          </>
                        )}
                        <span className="text-muted-foreground text-xs">·</span>
                        <span className="text-xs text-muted-foreground">Module {r.week_number}{r.competency_focus ? ` — ${r.competency_focus}` : ""}</span>
                        {r.rating && (
                          <Badge variant="outline" className="text-xs ml-auto">{r.rating}/5</Badge>
                        )}
                      </div>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{r.content}</p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
