import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { ObjectUploader } from "@/components/ObjectUploader";
import { PresentationViewer } from "@/components/PresentationViewer";
import { Plus, Trash2, Upload, ExternalLink, LogOut, ChevronRight, ChevronDown, GripVertical, CheckCircle, BarChart3, FileText, Pencil, Settings, Users, RefreshCw, Award, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { MobileMenu } from "@/components/MobileMenu";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { TrainingWeek } from "@shared/schema";
import type { UploadResult } from "@uppy/core";
import logoImage from "@assets/image_1760460046116.png";
import { FilePreview } from "@/components/FilePreview";
import { FileQuizDialog } from "@/components/FileQuizDialog";
import { FileQuizEditDialog } from "@/components/FileQuizEditDialog";

interface Course {
  id: string;
  name: string;
  description?: string;
  orderIndex: number;
  weeks?: TrainingWeek[];
}

export default function Home() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin, isTrainer, logoutMutation, isLoading: isLoadingUser } = useAuth();
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ url: string; name: string } | null>(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserIdentifier, setResetUserIdentifier] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [createCourseOpen, setCreateCourseOpen] = useState(false);
  const [deleteCourseId, setDeleteCourseId] = useState<string | null>(null);
  const [deleteWeekId, setDeleteWeekId] = useState<string | null>(null);
  const [quizStatus, setQuizStatus] = useState<Record<string, Record<string, { generated: boolean; questionCount: number; approved: boolean; questions?: any[] }>>>({});
  const [regeneratingFileId, setRegeneratingFileId] = useState<string | null>(null);
  const [previewQuizFile, setPreviewQuizFile] = useState<{ weekId: string; fileId: string; fileName: string } | null>(null);
  const [editQuizFile, setEditQuizFile] = useState<{ weekId: string; fileId: string; fileName: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (editingCell) {
      const isTextarea = editingCell.field === "competencyFocus" || editingCell.field === "objective";
      if (isTextarea && textareaRef.current) {
        textareaRef.current.focus();
      } else if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [editingCell]);

  // Fetch courses
  const { data: courses = [], isLoading: isLoadingCourses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: Infinity,
  });

  // Fetch weeks (for backwards compatibility if needed)
  const { data: weeks = [], isLoading: isLoadingWeeks } = useQuery<TrainingWeek[]>({
    queryKey: ["/api/training-weeks"],
    refetchOnWindowFocus: false,
    refetchInterval: false,
    staleTime: Infinity,
  });

  // Course mutations
  const createCourseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/courses", {
        name: newCourseName,
        description: newCourseDescription,
        orderIndex: courses.length,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setNewCourseName("");
      setNewCourseDescription("");
      setCreateCourseOpen(false);
      toast({ title: "Course created successfully" });
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Course> }) => {
      return apiRequest("PATCH", `/api/courses/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setEditingCell(null);
      setEditValue("");
      toast({ title: "Course updated successfully" });
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/courses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setDeleteCourseId(null);
      toast({ title: "Course deleted successfully" });
    },
  });

  // Week mutations
  const createWeekMutation = useMutation({
    mutationFn: async (courseId?: string) => {
      const maxWeek = weeks.length > 0 ? Math.max(...weeks.map(w => w.weekNumber)) : 0;
      return apiRequest("POST", "/api/training-weeks", {
        weekNumber: maxWeek + 1,
        competencyFocus: "",
        objective: "",
        courseId: courseId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "Week added successfully" });
    },
  });

  const updateWeekMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TrainingWeek> }) => {
      return apiRequest("PATCH", `/api/training-weeks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setEditingCell(null);
      setEditValue("");
      toast({ title: "Changes saved successfully" });
    },
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/training-weeks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      setDeleteWeekId(null);
      toast({ title: "Week deleted successfully" });
    },
  });

  const uploadDeckMutation = useMutation({
    mutationFn: async ({ weekId, files }: {
      weekId: string;
      files: Array<{ fileUrl: string; fileName: string; fileSize: number }>;
    }) => {
      return apiRequest("POST", `/api/training-weeks/${weekId}/deck`, { files });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "File uploaded successfully" });
      // Immediately show "No quiz" badge, then poll after 30s for background-generated quiz
      fetchQuizStatus(variables.weekId);
      setTimeout(() => fetchQuizStatus(variables.weekId), 30000);
    },
  });

  const deleteDeckFileMutation = useMutation({
    mutationFn: async ({ weekId, fileId }: { weekId: string; fileId: string }) => {
      return apiRequest("DELETE", `/api/training-weeks/${weekId}/deck/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training-weeks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "File deleted successfully" });
    },
  });

  const fetchQuizStatus = async (weekId: string) => {
    try {
      const res = await apiRequest("GET", `/api/training-weeks/${weekId}/quiz-status`);
      const data = await res.json();
      setQuizStatus(prev => ({ ...prev, [weekId]: data }));
    } catch (_) {}
  };

  const regenerateQuiz = async (weekId: string, fileId: string) => {
    setRegeneratingFileId(fileId);
    try {
      await apiRequest("POST", `/api/training-weeks/${weekId}/files/${fileId}/regenerate-quiz-admin`);
      await fetchQuizStatus(weekId);
      toast({ title: "Quiz regenerated", description: "10 new questions generated for this file." });
    } catch (_) {
      toast({ title: "Failed to regenerate quiz", variant: "destructive" });
    } finally {
      setRegeneratingFileId(null);
    }
  };

  const [bulkGenerating, setBulkGenerating] = useState(false);
  const generateMissingQuizzes = async () => {
    setBulkGenerating(true);
    try {
      const res = await apiRequest("POST", "/api/admin/generate-missing-quizzes");
      const data = await res.json();
      if (data.queued === 0) {
        toast({ title: "All quizzes already generated", description: "No files are missing quizzes." });
      } else {
        toast({
          title: `Generating quizzes for ${data.queued} file${data.queued !== 1 ? 's' : ''}`,
          description: "This runs in the background. Refresh quiz status in a minute.",
        });
      }
    } catch (_) {
      toast({ title: "Failed to start generation", variant: "destructive" });
    } finally {
      setBulkGenerating(false);
    }
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userIdentifier, newPassword }: { userIdentifier: string; newPassword: string }) => {
      return apiRequest("POST", "/api/admin/reset-user-password", { userIdentifier, newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setResetPasswordOpen(false);
      setResetUserIdentifier("");
      setResetNewPassword("");
    },
  });

  const handleGetUploadParams = async () => {
    try {
      const response = await apiRequest("POST", "/api/objects/upload", {});
      const data = await response.json();
      return {
        method: "PUT" as const,
        url: data.uploadURL,
      };
    } catch (error) {
      toast({
        title: "Upload error",
        description: "Failed to get upload URL. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleUploadComplete = (weekId: string) => (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const files = result.successful
        .filter(file => file.uploadURL && file.name)
        .map(file => ({
          fileUrl: file.uploadURL!,
          fileName: file.name!,
          fileSize: file.size || 0,
        }));
      
      if (files.length > 0) {
        uploadDeckMutation.mutate({ weekId, files });
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleCellEdit = (id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const handleCellSave = () => {
    isSavingRef.current = true;
    if (editingCell && editValue !== "") {
      updateWeekMutation.mutate({
        id: editingCell.id,
        data: { [editingCell.field]: editValue },
      });
    } else if (editingCell) {
      setEditingCell(null);
      setEditValue("");
      setTimeout(() => { isSavingRef.current = false; }, 0);
    }
  };

  const handleCellCancel = () => {
    isSavingRef.current = true;
    setEditingCell(null);
    setEditValue("");
    setTimeout(() => { isSavingRef.current = false; }, 0);
  };

  const sortedCourses = [...courses].sort((a, b) => a.orderIndex - b.orderIndex);

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
                Training Program Planner
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            {user && (
              <div className="text-xs sm:text-sm text-white/90 hidden md:block truncate max-w-[200px]" data-testid="text-user-info">
                {user.email} ({user.role})
              </div>
            )}
            {/* Desktop navigation buttons */}
            <div className="hidden md:flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate("/admin/analytics")}
                    data-testid="button-nav-analytics"
                    className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Analytics
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate("/admin/certificates/batch/1/approve")}
                    data-testid="button-nav-certificates"
                    className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Certificates
                  </Button>
                </>
              )}
              {(user?.role === "admin" || user?.role === "trainer") && (
                <>
                  <Link href="/approvals">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="button-approvals"
                      className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approvals
                    </Button>
                  </Link>
                  {user?.role === "trainer" && (
                    <Link href="/trainer/batches">
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid="button-manage-batches"
                        className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Manage Batches
                      </Button>
                    </Link>
                  )}
                </>
              )}
              <ProfileSettingsDialog
                userType="admin"
                currentEmail={user?.email || undefined}
              />
              <div className="text-white">
                <ThemeToggle />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
            {/* Mobile hamburger menu */}
            <MobileMenu
              userInfo={user ? `${user.email} (${user.role})` : undefined}
              items={[
                ...(isAdmin ? [
                  { label: "Analytics", icon: BarChart3, onClick: () => navigate("/admin/analytics") },
                  { label: "Certificates", icon: FileText, onClick: () => navigate("/admin/certificates/batch/1/approve") },
                ] : []),
                ...((user?.role === "admin" || user?.role === "trainer") ? [
                  { label: "Approvals", icon: CheckCircle, onClick: () => navigate("/approvals") },
                ] : []),
                ...(user?.role === "trainer" ? [
                  { label: "Manage Batches", icon: Users, onClick: () => navigate("/trainer/batches") },
                ] : []),
                { label: "Profile Settings", icon: Settings, onClick: () => {} },
                { label: "Logout", icon: LogOut, onClick: () => logoutMutation.mutate(), variant: "destructive" as const },
              ]}
            >
              <div className="text-foreground">
                <ThemeToggle />
              </div>
            </MobileMenu>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Admin Controls */}
        {isAdmin && (
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-6 sm:mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold">Training Courses</h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={generateMissingQuizzes}
                disabled={bulkGenerating}
                title="Auto-generate quizzes for all files that don't have one yet"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${bulkGenerating ? 'animate-spin' : ''}`} />
                {bulkGenerating ? "Queuing..." : "Generate Missing Quizzes"}
              </Button>
              <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-reset-password">
                    Reset User Password
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset User Password</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="userIdentifier">Username or Email</Label>
                      <Input
                        id="userIdentifier"
                        placeholder="admin or admin@example.com"
                        value={resetUserIdentifier}
                        onChange={(e) => setResetUserIdentifier(e.target.value)}
                        data-testid="input-user-identifier"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">New Password</Label>
                      <PasswordInput
                        id="newPassword"
                        placeholder="Enter new password (min 6 characters)"
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        resetPasswordMutation.mutate({
                          userIdentifier: resetUserIdentifier,
                          newPassword: resetNewPassword,
                        });
                      }}
                      disabled={resetPasswordMutation.isPending}
                    >
                      Reset
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={createCourseOpen} onOpenChange={setCreateCourseOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-add-course">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Course
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Course</DialogTitle>
                    <DialogDescription>Add a new training course</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="courseName">Course Name</Label>
                      <Input
                        id="courseName"
                        placeholder="e.g., Leadership Fundamentals"
                        value={newCourseName}
                        onChange={(e) => setNewCourseName(e.target.value)}
                        data-testid="input-course-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="courseDescription">Description (Optional)</Label>
                      <Textarea
                        id="courseDescription"
                        placeholder="Brief description of the course"
                        value={newCourseDescription}
                        onChange={(e) => setNewCourseDescription(e.target.value)}
                        data-testid="textarea-course-description"
                        className="min-h-24"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateCourseOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => createCourseMutation.mutate()}
                      disabled={createCourseMutation.isPending || !newCourseName.trim()}
                      data-testid="button-create-course"
                    >
                      Create Course
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        )}

        {isLoadingUser || isLoadingCourses ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : isAdmin && sortedCourses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No courses yet. Click "Add Course" to get started!
          </div>
        ) : (
          <div className="space-y-6">
            {sortedCourses.map((course) => (
              <div key={course.id} className="border rounded-lg overflow-hidden bg-card shadow-md" data-testid={`card-course-${course.id}`}>
                <div className="bg-primary/5 dark:bg-primary/10 px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-foreground" data-testid={`text-course-name-${course.id}`}>
                      {course.name}
                    </h3>
                    {course.description && (
                      <p className="text-sm text-muted-foreground mt-1">{course.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteCourseId(course.id)}
                        data-testid={`button-delete-course-${course.id}`}
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Weeks within course */}
                {course.weeks && course.weeks.length > 0 ? (
                  <Accordion type="multiple" className="p-6 space-y-4" onValueChange={(openWeeks) => {
                    openWeeks.forEach(weekId => { if (!quizStatus[weekId]) fetchQuizStatus(weekId); });
                  }}>
                    {course.weeks.map((week) => (
                      <AccordionItem
                        key={week.id}
                        value={week.id}
                        className="border rounded-lg overflow-hidden"
                        data-testid={`card-week-${week.id}`}
                      >
                        <AccordionTrigger className="px-4 py-3 hover:bg-muted/50">
                          <div className="flex items-center gap-3 text-left">
                            <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
                              <span className="text-sm font-bold text-primary">Module {week.weekNumber}</span>
                            </div>
                            <p className="text-muted-foreground truncate text-sm">
                              {week.competencyFocus || "No competency focus set"}
                            </p>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 py-4 bg-muted/5">
                          <div className="space-y-4">
                            {/* Competency Focus */}
                            <div>
                              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                                Competency Focus
                              </label>
                              {editingCell?.id === week.id && editingCell?.field === "competencyFocus" ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    data-testid={`textarea-competency-${week.id}`}
                                    className="min-h-[80px]"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={handleCellSave}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleCellCancel}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleCellEdit(week.id, "competencyFocus", week.competencyFocus)}
                                  className="p-3 rounded border bg-muted/30 cursor-text hover:bg-muted/50 text-sm min-h-[60px] flex items-center"
                                  data-testid={`text-competency-${week.id}`}
                                >
                                  {week.competencyFocus || "Click to add competency focus"}
                                </div>
                              )}
                            </div>

                            {/* Objective */}
                            <div>
                              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                                Objective
                              </label>
                              {editingCell?.id === week.id && editingCell?.field === "objective" ? (
                                <div className="space-y-2">
                                  <Textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    data-testid={`textarea-objective-${week.id}`}
                                    className="min-h-[80px]"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={handleCellSave}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={handleCellCancel}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleCellEdit(week.id, "objective", week.objective)}
                                  className="p-3 rounded border bg-muted/30 cursor-text hover:bg-muted/50 text-sm min-h-[60px] flex items-center"
                                  data-testid={`text-objective-${week.id}`}
                                >
                                  {week.objective || "Click to add objective"}
                                </div>
                              )}
                            </div>

                            {/* Files Section */}
                            <div>
                              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                                Presentation Files
                              </label>
                              <ObjectUploader
                                onGetUploadParameters={handleGetUploadParams}
                                onComplete={handleUploadComplete(week.id)}
                                maxNumberOfFiles={10}
                                key={`uploader-${week.id}`}
                              />
                              {week.deckFiles && week.deckFiles.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {week.deckFiles.map((file) => {
                                    const fileQuizInfo = quizStatus[week.id]?.[file.id];
                                    const isRegen = regeneratingFileId === file.id;
                                    return (
                                    <div key={file.id} className="flex items-center justify-between p-2 border rounded bg-muted/30 gap-2">
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-sm truncate">{file.fileName}</span>
                                        {fileQuizInfo !== undefined && (
                                          fileQuizInfo.generated
                                            ? fileQuizInfo.approved
                                              ? <Badge className="text-xs bg-green-500 text-white shrink-0 gap-1">
                                                  <Award className="h-3 w-3" />Approved ({fileQuizInfo.questionCount}q)
                                                </Badge>
                                              : <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400 shrink-0 gap-1">
                                                  <Award className="h-3 w-3" />Pending Approval ({fileQuizInfo.questionCount}q)
                                                </Badge>
                                            : <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">No quiz</Badge>
                                        )}
                                      </div>
                                      <div className="flex gap-1 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title="Create or edit quiz manually"
                                          onClick={() => setEditQuizFile({ weekId: week.id, fileId: file.id, fileName: file.fileName })}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          title={fileQuizInfo?.generated ? "Regenerate quiz" : "Generate quiz"}
                                          onClick={() => regenerateQuiz(week.id, file.id)}
                                          disabled={isRegen}
                                        >
                                          <RefreshCw className={`h-4 w-4 ${isRegen ? "animate-spin" : ""}`} />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setViewingFile({ url: file.fileUrl, name: file.fileName })}
                                          data-testid={`button-view-${file.id}`}
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => deleteDeckFileMutation.mutate({ weekId: week.id, fileId: file.id })}
                                          data-testid={`button-delete-file-${file.id}`}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* Week Actions */}
                            <div className="flex gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteWeekId(week.id)}
                                data-testid={`button-delete-week-${week.id}`}
                              >
                                Delete Week
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : isAdmin ? (
                  <div className="px-6 py-8 text-center text-muted-foreground">
                    No weeks in this course
                  </div>
                ) : null}

                {/* Add Week Button */}
                {isAdmin && (
                  <div className="px-6 py-4 border-t bg-muted/5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createWeekMutation.mutate(course.id)}
                      data-testid={`button-add-week-${course.id}`}
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Week to This Course
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Course Dialog */}
      <AlertDialog open={deleteCourseId !== null} onOpenChange={() => setDeleteCourseId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this course and all its weeks? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCourseId && deleteCourseMutation.mutate(deleteCourseId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Week Dialog */}
      <AlertDialog open={deleteWeekId !== null} onOpenChange={() => setDeleteWeekId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Week</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this week? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWeekId && deleteWeekMutation.mutate(deleteWeekId)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Viewer */}
      {viewingFile && (
        <PresentationViewer
          isOpen={!!viewingFile}
          fileUrl={viewingFile.url}
          fileName={viewingFile.name}
          onClose={() => setViewingFile(null)}
        />
      )}

      {previewQuizFile && (
        <FileQuizDialog
          weekId={previewQuizFile.weekId}
          fileId={previewQuizFile.fileId}
          fileName={previewQuizFile.fileName}
          open={!!previewQuizFile}
          onOpenChange={(open) => { if (!open) setPreviewQuizFile(null); }}
          canGenerateQuiz={true}
        />
      )}

      {editQuizFile && (() => {
        const info = quizStatus[editQuizFile.weekId]?.[editQuizFile.fileId];
        return (
          <FileQuizEditDialog
            open={!!editQuizFile}
            onClose={() => setEditQuizFile(null)}
            weekId={editQuizFile.weekId}
            fileId={editQuizFile.fileId}
            fileName={editQuizFile.fileName}
            initialQuestions={info?.questions ?? []}
            approved={info?.approved ?? false}
            onQuizStatusChange={() => fetchQuizStatus(editQuizFile.weekId)}
          />
        );
      })()}
    </div>
  );
}
