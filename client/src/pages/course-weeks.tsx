import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import posthog from "posthog-js";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ChevronLeft, ChevronRight, ChevronDown, ExternalLink, GripVertical, X, ZoomIn, ZoomOut, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { LogOut } from "lucide-react";
import logoImage from "@assets/image_1760460046116.png";
import type { Course, TrainingWeek } from "@shared/schema";
import type { UploadResult } from "@uppy/core";
import { FilePreview } from "@/components/FilePreview";
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ─── Sortable File Item (must be defined outside parent component) ───────────

interface SortableFileItemProps {
  file: { id: string; fileName: string; fileUrl: string; fileSize: number };
  weekId: string;
  onView: () => void;
  onDelete: () => void;
}

function SortableFileItem({ file, onView, onDelete }: SortableFileItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-2 border rounded bg-muted/30 transition-all ${
        isDragging ? 'shadow-lg scale-105 ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          className="flex items-center cursor-grab active:cursor-grabbing hover:bg-muted/20 p-1 rounded transition-all touch-none select-none"
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-file-${file.id}`}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm truncate">{file.fileName}</span>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onView}
          data-testid={`button-view-${file.id}`}
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          data-testid={`button-delete-file-${file.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Sortable Week Item (must be defined outside parent component) ────────────

interface SortableWeekItemProps {
  week: TrainingWeek;
  isAdmin: boolean;
  courseId: string;
  navigate: (path: string) => void;
  sensors: ReturnType<typeof useSensors>;
  activeFileId: string | null;
  isSavingWeek: boolean;
  onDeleteWeek: (id: string) => void;
  onViewFile: (file: { url: string; name: string }) => void;
  onDeleteFile: (weekId: string, fileId: string) => void;
  onGetUploadParams: () => Promise<{ method: "PUT"; url: string }>;
  onUploadComplete: (weekId: string) => (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => void;
  onFileDragStart: (event: DragStartEvent) => void;
  onFileDragEnd: (event: DragEndEvent, weekId: string) => void;
  onSaveField: (weekId: string, field: string, value: string, onSuccess?: () => void) => void;
}

function SortableWeekItem({
  week,
  isAdmin,
  courseId,
  navigate,
  sensors,
  activeFileId,
  isSavingWeek,
  onDeleteWeek,
  onViewFile,
  onDeleteFile,
  onGetUploadParams,
  onUploadComplete,
  onFileDragStart,
  onFileDragEnd,
  onSaveField,
}: SortableWeekItemProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: week.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  useEffect(() => {
    if (editingField === "competencyFocus" || editingField === "objective") {
      textareaRef.current?.focus();
    }
  }, [editingField]);

  const handleCellEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleCellSave = () => {
    if (editingField && editValue !== "") {
      onSaveField(week.id, editingField, editValue, () => {
        setEditingField(null);
        setEditValue("");
      });
    } else {
      setEditingField(null);
      setEditValue("");
    }
  };

  const handleCellCancel = () => {
    setEditingField(null);
    setEditValue("");
  };

  return (
    <AccordionItem
      ref={setNodeRef}
      style={style}
      value={week.id}
      className={`border rounded-lg overflow-hidden transition-all duration-200 ${
        isDragging
          ? 'shadow-2xl scale-105 ring-2 ring-primary/50'
          : 'shadow-md hover:shadow-lg'
      }`}
      data-testid={`card-week-${week.id}`}
    >
      <div className="flex items-stretch rounded-lg overflow-hidden border border-border/50">
        {isAdmin && (
          <button
            className="flex items-center px-4 cursor-grab active:cursor-grabbing hover:bg-muted/20 bg-muted/30 border-r border-border/50 transition-all touch-none select-none min-w-[48px]"
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-${week.id}`}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
        )}

        <div className="flex-1 min-w-0">
          {isAdmin ? (
            <AccordionTrigger className="w-full px-4 py-3 hover:bg-muted/50">
              <div className="flex items-center gap-3 text-left w-full">
                <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 flex-shrink-0">
                  <span className="text-sm font-bold text-primary">Module {week.weekNumber}</span>
                </div>
                <p className="text-muted-foreground truncate text-sm flex-1">
                  {week.competencyFocus || "No competency focus set"}
                </p>
              </div>
            </AccordionTrigger>
          ) : (
            <button
              onClick={() => navigate(`/courses/${courseId}/weeks/${week.id}`)}
              className="w-full px-4 py-3 hover:bg-muted/50 flex items-center justify-between"
              data-testid={`button-open-week-${week.id}`}
            >
              <div className="flex items-center gap-3 text-left w-full">
                <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30 flex-shrink-0">
                  <span className="text-sm font-bold text-primary">Module {week.weekNumber}</span>
                </div>
                <p className="text-muted-foreground truncate text-sm flex-1">
                  {week.competencyFocus || "No competency focus set"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            </button>
          )}
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1 px-3 border-l border-border/50 bg-muted/10">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/courses/${courseId}/weeks/${week.id}`);
              }}
              data-testid={`button-preview-week-${week.id}`}
              aria-label="Preview week content"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteWeek(week.id);
              }}
              className="hover:bg-destructive/10 hover:text-destructive transition-colors"
              data-testid={`button-delete-week-${week.id}`}
              aria-label="Delete week"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isAdmin && (
        <AccordionContent className="px-4 py-4 bg-muted/5 border-t">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                Competency Focus
              </label>
              {editingField === "competencyFocus" ? (
                <div className="space-y-2">
                  <Textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    data-testid={`textarea-competency-${week.id}`}
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCellSave} disabled={isSavingWeek}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCellCancel}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => handleCellEdit("competencyFocus", week.competencyFocus || "")}
                  className="p-3 rounded border bg-muted/30 text-sm min-h-[60px] flex items-center cursor-text hover:bg-muted/50"
                  data-testid={`text-competency-${week.id}`}
                >
                  {week.competencyFocus || "Click to add competency focus"}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                Objective
              </label>
              {editingField === "objective" ? (
                <div className="space-y-2">
                  <Textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    data-testid={`textarea-objective-${week.id}`}
                    className="min-h-[80px]"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCellSave} disabled={isSavingWeek}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCellCancel}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => handleCellEdit("objective", week.objective || "")}
                  className="p-3 rounded border bg-muted/30 text-sm min-h-[60px] flex items-center cursor-text hover:bg-muted/50"
                  data-testid={`text-objective-${week.id}`}
                >
                  {week.objective || "Click to add objective"}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-muted-foreground/60 mb-2 block">
                Presentation Files
              </label>
              <ObjectUploader
                onGetUploadParameters={onGetUploadParams}
                onComplete={onUploadComplete(week.id)}
                maxNumberOfFiles={10}
                key={`uploader-${week.id}`}
              />
              {week.deckFiles && week.deckFiles.length > 0 && (
                <div className="mt-3">
                  {isAdmin ? (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={onFileDragStart}
                      onDragEnd={(event) => onFileDragEnd(event, week.id)}
                    >
                      <SortableContext
                        items={week.deckFiles.map((f) => f.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {week.deckFiles.map((file) => (
                            <SortableFileItem
                              key={file.id}
                              file={file}
                              weekId={week.id}
                              onView={() => {
                                onViewFile({ url: file.fileUrl, name: file.fileName });
                                posthog.capture("admin_file_previewed", { weekId: week.id, fileId: file.id, fileName: file.fileName });
                              }}
                              onDelete={() => onDeleteFile(week.id, file.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay dropAnimation={null}>
                        {activeFileId ? (
                          <div className="border rounded overflow-hidden bg-card shadow-2xl ring-2 ring-primary scale-105 opacity-95 p-2 flex items-center gap-2">
                            <GripVertical className="h-5 w-5 text-primary" />
                            <span className="text-sm font-semibold">{week.deckFiles.find(f => f.id === activeFileId)?.fileName}</span>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  ) : (
                    <div className="space-y-2">
                      {week.deckFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-2 border rounded bg-muted/30">
                          <span className="text-sm truncate">{file.fileName}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              onViewFile({ url: file.fileUrl, name: file.fileName });
                              posthog.capture("admin_file_previewed", { weekId: week.id, fileId: file.id, fileName: file.fileName });
                            }}
                            data-testid={`button-view-${file.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────

export default function CourseWeeks() {
  const { courseId } = useParams<{ courseId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin, isTrainer, logoutMutation } = useAuth();
  const [deleteWeekId, setDeleteWeekId] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<{ url: string; name: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [numPages, setNumPages] = useState(0);
  const [documentLoadError, setDocumentLoadError] = useState(false);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Prevent backspace from navigating back when not in an input field
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace") {
        const target = e.target as HTMLElement;
        const tagName = target.tagName.toLowerCase();
        const isEditable = target.isContentEditable;
        const isInput = tagName === "input" || tagName === "textarea" || tagName === "select";
        if (!isInput && !isEditable) {
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Handle file URL conversion and reset viewer state
  useEffect(() => {
    setPageNumber(1);
    setNumPages(0);
    setDocumentLoadError(false);
    setConvertedUrl(null);

    if (!viewingFile) return;

    const fileName = viewingFile.name.toLowerCase();

    if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
      const params = new URLSearchParams({ url: viewingFile.url });
      setConvertedUrl(`/api/files/convert-to-pdf?${params}`);
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      const params = new URLSearchParams({ url: viewingFile.url });
      setConvertedUrl(`/api/files/convert-to-html?${params}`);
    } else if (fileName.endsWith('.pdf')) {
      setConvertedUrl(viewingFile.url);
    } else {
      setConvertedUrl(viewingFile.url);
    }
  }, [viewingFile]);

  const { data: courseData, isLoading: isLoadingCourse } = useQuery<Course>({
    queryKey: ["/api/courses", courseId],
    enabled: !!courseId,
  });
  const course = courseData;

  const { data: weeks = [], isLoading: isLoadingWeeks } = useQuery<TrainingWeek[]>({
    queryKey: ["/api/courses", courseId, "weeks"],
    enabled: !!courseId,
  });

  const createWeekMutation = useMutation({
    mutationFn: async () => {
      const maxWeek = weeks.length > 0 ? Math.max(...weeks.map(w => w.weekNumber)) : 0;
      return apiRequest("POST", "/api/training-weeks", {
        weekNumber: maxWeek + 1,
        competencyFocus: "",
        objective: "",
        courseId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "Week added" });
    },
  });

  const updateWeekMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TrainingWeek> }) => {
      return apiRequest("PATCH", `/api/training-weeks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "Week updated" });
    },
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/training-weeks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      setDeleteWeekId(null);
      toast({ title: "Week deleted" });
    },
  });

  const uploadDeckMutation = useMutation({
    mutationFn: async ({ weekId, files }: {
      weekId: string;
      files: Array<{ fileUrl: string; fileName: string; fileSize: number }>;
    }) => {
      return apiRequest("POST", `/api/training-weeks/${weekId}/deck`, { files });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "File uploaded" });
    },
  });

  const deleteDeckFileMutation = useMutation({
    mutationFn: async ({ weekId, fileId }: { weekId: string; fileId: string }) => {
      return apiRequest("DELETE", `/api/training-weeks/${weekId}/deck/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "File deleted" });
    },
  });

  const reorderWeekMutation = useMutation({
    mutationFn: async ({ weekId, newPosition }: { weekId: string; newPosition: number }) => {
      return apiRequest("POST", `/api/courses/${courseId}/weeks/reorder`, { weekId, newPosition });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "Week reordered" });
    },
  });

  const reorderFilesMutation = useMutation({
    mutationFn: async ({ weekId, fileIds }: { weekId: string; fileIds: string[] }) => {
      return apiRequest("POST", `/api/training-weeks/${weekId}/deck/reorder`, { fileIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "Files reordered" });
    },
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = weeks.findIndex((w) => w.id === active.id);
      const newIndex = weeks.findIndex((w) => w.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderWeekMutation.mutate({ weekId: active.id as string, newPosition: newIndex + 1 });
      }
    }
    setActiveId(null);
  };

  const handleFileDragStart = (event: DragStartEvent) => {
    setActiveFileId(event.active.id as string);
  };

  const handleFileDragEnd = (event: DragEndEvent, weekId: string) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const week = weeks.find(w => w.id === weekId);
      if (week?.deckFiles) {
        const oldIndex = week.deckFiles.findIndex((f) => f.id === active.id);
        const newIndex = week.deckFiles.findIndex((f) => f.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const reorderedFiles = arrayMove(week.deckFiles, oldIndex, newIndex);
          reorderFilesMutation.mutate({ weekId, fileIds: reorderedFiles.map(f => f.id) });
        }
      }
    }
    setActiveFileId(null);
  };

  const handleGetUploadParams = async () => {
    try {
      const response = await apiRequest("POST", "/api/objects/upload", {});
      const data = await response.json();
      return { method: "PUT" as const, url: data.uploadURL };
    } catch (error) {
      toast({ title: "Upload error", description: "Failed to get upload URL", variant: "destructive" });
      throw error;
    }
  };

  const handleUploadComplete = (weekId: string) => (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const files = result.successful
        .filter(file => file.uploadURL && file.name)
        .map(file => ({ fileUrl: file.uploadURL!, fileName: file.name!, fileSize: file.size || 0 }));
      if (files.length > 0) {
        uploadDeckMutation.mutate({ weekId, files });
      }
    }
  };

  const onSaveField = (weekId: string, field: string, value: string, onSuccess?: () => void) => {
    updateWeekMutation.mutate({ id: weekId, data: { [field]: value } }, { onSuccess });
  };

  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  if (isLoadingCourse) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="h-12 w-12 sm:h-14 sm:w-14 flex items-center justify-center flex-shrink-0 bg-primary rounded-sm p-1">
              <img src={logoImage} alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                {course?.name || "Course"}
              </h1>
              <p className="text-xs sm:text-sm text-white/80 hidden sm:block">
                Weeks & Content
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
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
              className="hidden sm:flex bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="sm:hidden h-8 w-8 bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            data-testid="button-back-to-courses"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Courses
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-6 sm:mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold">Training Weeks</h2>
          {isAdmin && (
            <Button
              onClick={() => createWeekMutation.mutate()}
              disabled={createWeekMutation.isPending}
              data-testid="button-add-week"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Week
            </Button>
          )}
        </div>

        {isLoadingWeeks ? (
          <div className="text-center py-12 text-muted-foreground">Loading weeks...</div>
        ) : sortedWeeks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {isAdmin ? "No weeks yet. Click 'Add Week' to get started!" : "No weeks in this course yet."}
          </div>
        ) : isAdmin ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedWeeks.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              <Accordion type="multiple" className="space-y-4">
                {sortedWeeks.map((week) => (
                  <SortableWeekItem
                    key={week.id}
                    week={week}
                    isAdmin={isAdmin}
                    courseId={courseId!}
                    navigate={navigate}
                    sensors={sensors}
                    activeFileId={activeFileId}
                    isSavingWeek={updateWeekMutation.isPending}
                    onDeleteWeek={setDeleteWeekId}
                    onViewFile={setViewingFile}
                    onDeleteFile={(weekId, fileId) => deleteDeckFileMutation.mutate({ weekId, fileId })}
                    onGetUploadParams={handleGetUploadParams}
                    onUploadComplete={handleUploadComplete}
                    onFileDragStart={handleFileDragStart}
                    onFileDragEnd={handleFileDragEnd}
                    onSaveField={onSaveField}
                  />
                ))}
              </Accordion>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeId ? (
                <div className="border rounded-lg overflow-hidden bg-card shadow-2xl ring-2 ring-primary scale-105 opacity-95">
                  <div className="flex items-center gap-3 p-4">
                    <GripVertical className="h-5 w-5 text-primary" />
                    <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/30">
                      <span className="text-sm font-bold text-primary">
                        Module {sortedWeeks.find(w => w.id === activeId)?.weekNumber}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <Accordion type="multiple" className="space-y-4">
            {sortedWeeks.map((week) => (
              <SortableWeekItem
                key={week.id}
                week={week}
                isAdmin={isAdmin}
                courseId={courseId!}
                navigate={navigate}
                sensors={sensors}
                activeFileId={activeFileId}
                isSavingWeek={updateWeekMutation.isPending}
                onDeleteWeek={setDeleteWeekId}
                onViewFile={setViewingFile}
                onDeleteFile={(weekId, fileId) => deleteDeckFileMutation.mutate({ weekId, fileId })}
                onGetUploadParams={handleGetUploadParams}
                onUploadComplete={handleUploadComplete}
                onFileDragStart={handleFileDragStart}
                onFileDragEnd={handleFileDragEnd}
                onSaveField={onSaveField}
              />
            ))}
          </Accordion>
        )}
      </main>

      {deleteWeekId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background p-6 rounded-lg max-w-sm">
            <h3 className="text-lg font-bold mb-2">Delete Week?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This action cannot be undone. All content in this week will be deleted.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteWeekId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteWeekMutation.mutate(deleteWeekId)}
                disabled={deleteWeekMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-auto">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-screen overflow-auto relative">
            <div className="sticky top-0 right-0 p-2 flex justify-end z-10 bg-background/95 border-b">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewingFile(null)}
                data-testid="button-close-file-preview"
              >
                Close
              </Button>
            </div>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-2">{viewingFile.name}</p>
              <FilePreview
                fileName={viewingFile.name}
                fileUrl={viewingFile.url}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
