import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import posthog from "posthog-js";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ChevronUp, ChevronDown, ChevronRight, Eye, ExternalLink, GripVertical, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { ObjectUploader } from "@/components/ObjectUploader";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { AcademyShell } from "@/components/AcademyShell";
import type { Course, QuizQuestion, TrainingWeek } from "@shared/schema";
import { deskName } from "@shared/deskName";
import { FileQuizEditDialog } from "@/components/FileQuizEditDialog";
import type { UploadResult } from "@uppy/core";
import { FilePreview } from "@/components/FilePreview";
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

// Buttons, fields and chips follow design/board/CourseEditor.dc.html with the sl-* tokens.
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_ICON = `inline-flex h-11 w-11 items-center justify-center rounded-lg border border-sl-control bg-sl-surface text-sl-neutral hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;

type Tone = "risk" | "attention" | "done" | "neutral";
const CHIP: Record<Tone, string> = {
  risk: "bg-sl-risk-soft text-sl-risk",
  attention: "bg-sl-attention-soft text-sl-attention",
  done: "bg-sl-done-soft text-sl-done",
  neutral: "bg-sl-neutral-soft text-sl-neutral",
};

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[tone]}`}>{children}</span>;
}

// ─── Sortable File Item (must be defined outside parent component) ───────────

/** `GET /api/training-weeks/:weekId/quiz-status`: each lesson file's cached quiz, with its answers (staff only). */
type QuizStatus = Record<string, { generated: boolean; questionCount: number; approved: boolean; questions?: QuizQuestion[] }>;

const NO_QUESTIONS: QuizQuestion[] = [];

/** A lesson file's quiz chip: Fellows take a quiz only once a person has approved it (D5). */
function quizChip(quiz?: { generated: boolean; questionCount: number; approved: boolean }): { tone: Tone; label: string } | null {
  if (!quiz) return null;
  if (!quiz.generated) return { tone: "neutral", label: "No quiz yet" };
  if (quiz.approved) return { tone: "done", label: `Quiz approved · ${quiz.questionCount} ${quiz.questionCount === 1 ? "question" : "questions"}` };
  return { tone: "attention", label: "Quiz draft · waiting for you" };
}

function fileKind(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "PowerPoint";
  if (name.endsWith(".docx") || name.endsWith(".doc")) return "Word";
  if (name.endsWith(".mp4") || name.endsWith(".webm") || name.endsWith(".mov")) return "Video";
  return "File";
}

interface SortableFileItemProps {
  file: { id: string; fileName: string; fileUrl: string; fileSize: number };
  weekId: string;
  position: number;
  count: number;
  quiz?: { generated: boolean; questionCount: number; approved: boolean };
  onView: () => void;
  onDelete: () => void;
  onEditQuiz: () => void;
  onMove: (delta: number) => void;
}

function SortableFileItem({ file, position, count, quiz, onView, onDelete, onEditQuiz, onMove }: SortableFileItemProps) {
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
  const chip = quizChip(quiz);
  const isDraft = Boolean(quiz?.generated && !quiz.approved);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex flex-wrap items-center justify-between gap-2.5 rounded-[10px] border border-sl-line bg-sl-surface px-3 py-2.5 ${
        isDragging ? "shadow-lg ring-2 ring-sl-accent" : ""
      }`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex gap-1">
          <button type="button" className={BTN_ICON} aria-label={`Move lesson file ${position} up`} disabled={position === 1} onClick={() => onMove(-1)}>
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className={BTN_ICON} aria-label={`Move lesson file ${position} down`} disabled={position === count} onClick={() => onMove(1)}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={`${BTN_ICON} cursor-grab touch-none select-none active:cursor-grabbing`}
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-file-${file.id}`}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-medium text-sl-ink">{file.fileName}</span>
          <span className="text-[13px] text-sl-muted">{fileKind(file.fileName)}</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
        <button
          type="button"
          className={isDraft ? BTN_PRIMARY : BTN_SECONDARY}
          onClick={onEditQuiz}
          title="Review, edit and approve the quiz Fellows take on this file"
          data-testid={`button-edit-quiz-${file.id}`}
        >
          {isDraft ? "Review and approve" : quiz?.generated ? "Edit quiz" : "Create quiz"}
        </button>
        <button type="button" className={BTN_ICON} onClick={onView} aria-label={`Preview ${file.fileName}`} data-testid={`button-view-${file.id}`}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={`${BTN_ICON} hover:text-sl-risk`} onClick={onDelete} aria-label={`Delete ${file.fileName}`} data-testid={`button-delete-file-${file.id}`}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

// ─── Sortable Module Item (must be defined outside parent component) ──────────

interface SortableWeekItemProps {
  week: TrainingWeek;
  isAdmin: boolean;
  courseId: string;
  position: number;
  count: number;
  navigate: (path: string) => void;
  sensors: ReturnType<typeof useSensors>;
  activeFileId: string | null;
  isSavingWeek: boolean;
  onDeleteWeek: (id: string) => void;
  onMoveWeek: (weekId: string, delta: number) => void;
  onMoveFile: (weekId: string, fileId: string, delta: number) => void;
  onViewFile: (file: { url: string; name: string }) => void;
  onDeleteFile: (weekId: string, fileId: string) => void;
  onGetUploadParams: () => Promise<{ method: "PUT"; url: string }>;
  onUploadComplete: (weekId: string) => (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => void;
  onFileDragStart: (event: DragStartEvent) => void;
  onFileDragEnd: (event: DragEndEvent, weekId: string) => void;
  onSaveField: (weekId: string, field: string, value: string, onSuccess?: () => void) => void;
  onEditQuiz: (weekId: string, file: { id: string; fileName: string }) => void;
}

function SortableWeekItem({
  week,
  isAdmin,
  courseId,
  position,
  count,
  navigate,
  sensors,
  activeFileId,
  isSavingWeek,
  onDeleteWeek,
  onMoveWeek,
  onMoveFile,
  onViewFile,
  onDeleteFile,
  onGetUploadParams,
  onUploadComplete,
  onFileDragStart,
  onFileDragEnd,
  onSaveField,
  onEditQuiz,
}: SortableWeekItemProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const { data: quizStatus } = useQuery<QuizStatus>({
    queryKey: [`/api/training-weeks/${week.id}/quiz-status`],
    enabled: isAdmin && (week.deckFiles?.length ?? 0) > 0,
  });
  const [editValue, setEditValue] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const { toast } = useToast();
  const addYoutube = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/training-weeks/${week.id}/external-link`, {
        url: youtubeUrl,
        title: "YouTube lesson",
      });
      return res.json();
    },
    onSuccess: () => {
      setYoutubeUrl("");
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "YouTube lesson added" });
    },
    onError: (error: Error) => {
      toast({ title: "Could not add YouTube", description: error.message, variant: "destructive" });
    },
  });
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

  const name = week.competencyFocus || "Untitled module";
  const files = week.deckFiles ?? [];

  // Not an editor: the module is a row that opens its content.
  if (!isAdmin) {
    return (
      <article
        ref={setNodeRef}
        style={style}
        className="rounded-xl border border-sl-line bg-sl-surface"
        data-testid={`card-week-${week.id}`}
      >
        <button
          type="button"
          onClick={() => navigate(`/courses/${courseId}/weeks/${week.id}`)}
          className={`flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left hover:bg-sl-neutral-soft ${FOCUS}`}
          data-testid={`button-open-week-${week.id}`}
        >
          <span className="text-[17px] font-semibold text-sl-ink">Module {week.weekNumber} · {name}</span>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-sl-muted" aria-hidden="true" />
        </button>
      </article>
    );
  }

  const editable = (field: "competencyFocus" | "objective", label: string, testKey: string, current: string, empty: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${week.id}-${testKey}`} className="text-sm font-medium text-sl-ink">{label}</label>
      {editingField === field ? (
        <div className="space-y-2">
          <textarea
            id={`${week.id}-${testKey}`}
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            data-testid={`textarea-${testKey}-${week.id}`}
            rows={2}
            className={`${FIELD} min-h-[80px] resize-y`}
          />
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} onClick={handleCellSave} disabled={isSavingWeek}>
              Save
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={handleCellCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          id={`${week.id}-${testKey}`}
          onClick={() => handleCellEdit(field, current)}
          className={`${FIELD} min-h-[44px] cursor-text text-left ${current ? "" : "text-sl-muted"}`}
          data-testid={`text-${testKey}-${week.id}`}
        >
          {current || empty}
        </button>
      )}
    </div>
  );

  return (
    <article
      ref={setNodeRef}
      style={style}
      aria-labelledby={`module-title-${week.id}`}
      className={`flex flex-col gap-4 rounded-xl border border-sl-line bg-sl-surface px-5 py-[18px] ${
        isDragging ? "shadow-2xl ring-2 ring-sl-accent" : ""
      }`}
      data-testid={`card-week-${week.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`module-title-${week.id}`} className="text-[17px] font-semibold text-sl-ink">Module {week.weekNumber} · {name}</h3>
        <div className="flex gap-1">
          <button type="button" className={BTN_ICON} aria-label={`Move Module ${week.weekNumber} up`} disabled={position === 1} onClick={() => onMoveWeek(week.id, -1)}>
            <ChevronUp className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button type="button" className={BTN_ICON} aria-label={`Move Module ${week.weekNumber} down`} disabled={position === count} onClick={() => onMoveWeek(week.id, 1)}>
            <ChevronDown className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${BTN_ICON} cursor-grab touch-none select-none active:cursor-grabbing`}
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-${week.id}`}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={BTN_ICON}
            onClick={() => navigate(`/courses/${courseId}/weeks/${week.id}`)}
            data-testid={`button-preview-week-${week.id}`}
            aria-label="Preview module content"
          >
            <Eye className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${BTN_ICON} hover:text-sl-risk`}
            onClick={() => onDeleteWeek(week.id)}
            data-testid={`button-delete-week-${week.id}`}
            aria-label="Delete module"
          >
            <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      {editable("competencyFocus", "Module name", "competency", week.competencyFocus || "", "Name this module")}
      {editable("objective", "Objective", "objective", week.objective || "", "What a Fellow can do after this module")}

      <div className="flex flex-col gap-2.5 border-t border-sl-line pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[15px] font-semibold text-sl-ink">Lesson files{files.length === 0 ? ": none yet" : ` · ${files.length}`}</span>
            {files.length === 0 && (
              <span className="text-[13px] text-sl-muted">Until this module has a lesson file, the course cannot be complete.</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              className={BTN_PRIMARY}
              aria-describedby={`upload-hint-${week.id}`}
              aria-expanded={uploaderOpen}
              onClick={() => setUploaderOpen((open) => !open)}
              data-testid={`button-upload-file-${week.id}`}
            >
              {uploaderOpen ? "Close the uploader" : "Upload a lesson file"}
            </button>
            <span id={`upload-hint-${week.id}`} className="text-[13px] text-sl-muted">PDF or PowerPoint</span>
          </div>
        </div>
        <p className="rounded-lg bg-sl-ground px-3 py-2.5 text-sm leading-relaxed text-sl-muted">
          After you upload, AI drafts a quiz from the file. The draft waits for you to approve it; Fellows see the quiz only after that.
        </p>

        {uploaderOpen && (
          <ObjectUploader
            onGetUploadParameters={onGetUploadParams}
            onComplete={(result) => {
              onUploadComplete(week.id)(result);
              setUploaderOpen(false);
            }}
            maxNumberOfFiles={10}
            key={`uploader-${week.id}`}
          />
        )}

        {files.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onFileDragStart}
            onDragEnd={(event) => onFileDragEnd(event, week.id)}
          >
            <SortableContext
              items={files.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {files.map((file, index) => (
                  <SortableFileItem
                    key={file.id}
                    file={file}
                    weekId={week.id}
                    position={index + 1}
                    count={files.length}
                    quiz={quizStatus?.[file.id]}
                    onEditQuiz={() => onEditQuiz(week.id, { id: file.id, fileName: file.fileName })}
                    onMove={(delta) => onMoveFile(week.id, file.id, delta)}
                    onView={() => {
                      onViewFile({ url: file.fileUrl, name: file.fileName });
                      posthog.capture("admin_file_previewed", { weekId: week.id, fileId: file.id, fileName: file.fileName });
                    }}
                    onDelete={() => onDeleteFile(week.id, file.id)}
                  />
                ))}
              </ol>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeFileId ? (
                <div className="flex items-center gap-2 rounded-lg border border-sl-line bg-sl-surface p-2 opacity-95 shadow-2xl ring-2 ring-sl-accent">
                  <GripVertical className="h-5 w-5 text-sl-accent" aria-hidden="true" />
                  <span className="text-sm font-semibold text-sl-ink">{files.find(f => f.id === activeFileId)?.fileName}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <details className="text-sm text-sl-muted">
          <summary className={`min-h-[44px] cursor-pointer py-3 text-sl-accent ${FOCUS}`}>Add a video link or import a SCORM / HTML zip</summary>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`youtube-${week.id}`} className="sr-only">YouTube link for this module</label>
            <input
              id={`youtube-${week.id}`}
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="YouTube link for this module"
              className={`${FIELD} flex-1`}
              data-testid={`input-youtube-${week.id}`}
            />
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={!youtubeUrl.trim() || addYoutube.isPending}
              onClick={() => addYoutube.mutate()}
              data-testid={`button-youtube-${week.id}`}
            >
              Add video
            </button>
          </div>
          <label className={`mt-2 inline-flex min-h-[44px] cursor-pointer items-center text-sl-accent hover:underline ${FOCUS}`}>
            <input
              type="file"
              accept=".zip,application/zip"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const form = new FormData();
                form.append("package", file);
                const res = await fetch(`/api/training-weeks/${week.id}/import-package`, {
                  method: "POST",
                  body: form,
                  credentials: "include",
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  console.error(data.error || "Import failed");
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
              }}
            />
            Import SCORM / HTML zip
          </label>
        </details>
      </div>
    </article>
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
  const [editQuiz, setEditQuiz] = useState<{ weekId: string; fileId: string; fileName: string } | null>(null);

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

  const { data: courseData, isLoading: isLoadingCourse } = useQuery<Course>({
    queryKey: ["/api/courses", courseId],
    enabled: !!courseId,
  });
  const course = courseData;

  const { data: weeks = [], isLoading: isLoadingWeeks } = useQuery<TrainingWeek[]>({
    queryKey: ["/api/courses", courseId, "weeks"],
    enabled: !!courseId,
  });

  // The cohorts that hold this course (a Trainer sees the ones they run) and, for an Admin, the Step it sits on.
  const { data: courseCohorts = [] } = useQuery<any[]>({
    queryKey: ["/api/courses", courseId, "batches"],
    enabled: !!courseId && isTrainer,
  });
  const { data: academyPath } = useQuery<any>({
    queryKey: ["/api/admin/academy-path"],
    enabled: isAdmin,
  });
  const crumbCohort = courseCohorts.length === 1 ? courseCohorts[0] : null;
  const crumbStep = useMemo(() => {
    const steps: any[] = academyPath?.cohorts?.find((cohort: any) => cohort.id === crumbCohort?.id)?.batches ?? [];
    const index = steps.findIndex((step: any) => (step.courses ?? []).some((c: any) => c.id === courseId));
    return index === -1 ? null : `Step ${index + 1}`;
  }, [academyPath, crumbCohort, courseId]);

  // The quiz being reviewed: trainers approve their own courses' quizzes here (D5); the server checks the course is theirs.
  const { data: editQuizStatus, isLoading: isLoadingEditQuiz } = useQuery<QuizStatus>({
    queryKey: [`/api/training-weeks/${editQuiz?.weekId}/quiz-status`],
    enabled: isTrainer && !!editQuiz,
  });
  const editQuizEntry = editQuiz ? editQuizStatus?.[editQuiz.fileId] : undefined;

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
      toast({ title: "Module added" });
    },
  });

  const updateWeekMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TrainingWeek> }) => {
      return apiRequest("PATCH", `/api/training-weeks/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      toast({ title: "Module updated" });
    },
  });

  const deleteWeekMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/training-weeks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses", courseId, "weeks"] });
      setDeleteWeekId(null);
      toast({ title: "Module deleted" });
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
      toast({ title: "Module reordered" });
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

  const sortedWeeks = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);

  // The up/down buttons use the same reorder routes as dragging.
  const handleMoveWeek = (weekId: string, delta: number) => {
    const index = sortedWeeks.findIndex((w) => w.id === weekId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= sortedWeeks.length) return;
    reorderWeekMutation.mutate({ weekId, newPosition: target + 1 });
  };

  const handleMoveFile = (weekId: string, fileId: string, delta: number) => {
    const files = weeks.find((w) => w.id === weekId)?.deckFiles;
    if (!files) return;
    const index = files.findIndex((f) => f.id === fileId);
    const target = index + delta;
    if (index === -1 || target < 0 || target >= files.length) return;
    reorderFilesMutation.mutate({ weekId, fileIds: arrayMove(files, index, target).map((f) => f.id) });
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

  const backHref = user?.role === "admin" ? "/admin/batches" : user?.role === "trainer" ? "/trainer/batches?tab=cohorts" : user?.role === "teacher" ? "/teacher/dashboard" : "/";
  const cohortHref = crumbCohort ? `/cohorts/${crumbCohort.id}` : null;
  const goTo = (href: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    navigate(href);
  };
  const LINK = `text-sl-accent no-underline hover:underline ${FOCUS}`;

  const renderWeek = (week: TrainingWeek, index: number) => (
    <SortableWeekItem
      key={week.id}
      week={week}
      isAdmin={isTrainer}
      courseId={courseId!}
      position={index + 1}
      count={sortedWeeks.length}
      navigate={navigate}
      sensors={sensors}
      activeFileId={activeFileId}
      isSavingWeek={updateWeekMutation.isPending}
      onDeleteWeek={setDeleteWeekId}
      onMoveWeek={handleMoveWeek}
      onMoveFile={handleMoveFile}
      onViewFile={setViewingFile}
      onDeleteFile={(weekId, fileId) => deleteDeckFileMutation.mutate({ weekId, fileId })}
      onGetUploadParams={handleGetUploadParams}
      onUploadComplete={handleUploadComplete}
      onFileDragStart={handleFileDragStart}
      onFileDragEnd={handleFileDragEnd}
      onSaveField={onSaveField}
      onEditQuiz={(weekId, file) => setEditQuiz({ weekId, fileId: file.id, fileName: file.fileName })}
    />
  );

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      desk={isAdmin ? "admin" : user?.role === "teacher" ? "fellow" : "trainer"}
      current={user?.role === "teacher" ? "learning" : "cohorts"}
      actions={
        <ProfileSettingsDialog
          userType="admin"
          currentEmail={user?.email || undefined}
        />
      }
    >
      {isLoadingCourse ? (
        <p className="py-12 text-center text-sl-muted">Loading...</p>
      ) : (
        <>
          <nav aria-label="Breadcrumb">
            <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-sl-muted">
              <li>
                <a href={backHref} onClick={goTo(backHref)} className={LINK} data-testid="button-back-to-courses">
                  {user?.role === "teacher" ? "Back to desk" : "Cohorts"}
                </a>
              </li>
              {cohortHref && crumbCohort && (
                <>
                  <li aria-hidden="true">›</li>
                  <li>
                    <a href={cohortHref} onClick={goTo(cohortHref)} className={LINK}>{crumbCohort.name}</a>
                  </li>
                </>
              )}
              {crumbStep && (
                <>
                  <li aria-hidden="true">›</li>
                  <li>{crumbStep}</li>
                </>
              )}
              <li aria-hidden="true">›</li>
              <li aria-current="page" className="text-sl-ink">{course?.name || "Course"}</li>
            </ol>
          </nav>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{course?.name || "Course"}</h1>
              {course && (
                <Chip tone={course.publishStatus === "published" ? "done" : "neutral"}>
                  {course.publishStatus === "published" ? "Published" : "Draft"}
                </Chip>
              )}
            </div>
            {course?.description && <p className="text-sm leading-relaxed text-sl-muted">{course.description}</p>}
            {!isAdmin && isTrainer && (
              <p className="text-sm leading-relaxed text-sl-muted">
                You can edit this course's modules, lesson files and quizzes. Only an Admin can rename or delete the course.
              </p>
            )}
            {isTrainer && (
              <p className="text-xs text-sl-muted" data-testid="lesson-stages">
                Plan each module as Introduction, Competence development, Design, then Realisation.
              </p>
            )}
          </div>

          <section aria-labelledby="modules-heading" className="flex flex-col gap-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="modules-heading" className="text-lg font-semibold text-sl-ink">
                Modules{" "}
                <span className="font-medium text-sl-muted">· {isLoadingWeeks ? "…" : sortedWeeks.length} · Fellows take them in this order</span>
              </h2>
              {isTrainer && (
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  onClick={() => createWeekMutation.mutate()}
                  disabled={createWeekMutation.isPending}
                  data-testid="button-add-week"
                >
                  Add a module
                </button>
              )}
            </div>

            {isLoadingWeeks ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-24 rounded-xl bg-sl-neutral-soft" />
              </div>
            ) : sortedWeeks.length === 0 ? (
              <p className="py-8 text-sm text-sl-muted">
                {isTrainer ? "No modules yet. Click Add a module to get started." : "No modules in this course yet."}
              </p>
            ) : isTrainer ? (
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
                  <div className="flex flex-col gap-4">
                    {sortedWeeks.map(renderWeek)}
                  </div>
                </SortableContext>
                <DragOverlay dropAnimation={null}>
                  {activeId ? (
                    <div className="rounded-xl border border-sl-line bg-sl-surface opacity-95 shadow-2xl ring-2 ring-sl-accent">
                      <div className="flex items-center gap-3 p-4">
                        <GripVertical className="h-5 w-5 text-sl-accent" aria-hidden="true" />
                        <span className="text-[17px] font-semibold text-sl-ink">
                          Module {sortedWeeks.find(w => w.id === activeId)?.weekNumber}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            ) : (
              <div className="flex flex-col gap-4">
                {sortedWeeks.map(renderWeek)}
              </div>
            )}
          </section>
        </>
      )}

      {isTrainer && editQuiz && !isLoadingEditQuiz && (
        <FileQuizEditDialog
          open={!!editQuiz}
          onClose={() => setEditQuiz(null)}
          weekId={editQuiz.weekId}
          fileId={editQuiz.fileId}
          fileName={editQuiz.fileName}
          initialQuestions={editQuizEntry?.questions ?? NO_QUESTIONS}
          approved={editQuizEntry?.approved ?? false}
          onQuizStatusChange={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/training-weeks/${editQuiz.weekId}/quiz-status`] });
          }}
        />
      )}

      {deleteWeekId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-module-title">
          <div className="max-w-sm rounded-xl border border-sl-line bg-sl-surface p-6">
            <h3 id="delete-module-title" className="mb-2 text-lg font-semibold text-sl-ink">Delete module?</h3>
            <p className="mb-4 text-sm text-sl-muted">
              This action cannot be undone. All content in this module will be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={() => setDeleteWeekId(null)}>
                Cancel
              </button>
              <button
                type="button"
                className={`inline-flex min-h-[44px] items-center justify-center rounded-lg bg-sl-risk-soft px-4 py-2.5 text-sm font-semibold text-sl-risk ring-1 ring-sl-risk hover:opacity-90 disabled:opacity-50 ${FOCUS}`}
                onClick={() => deleteWeekMutation.mutate(deleteWeekId)}
                disabled={deleteWeekMutation.isPending}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/50 p-4">
          <div className="relative max-h-screen w-full max-w-4xl overflow-auto rounded-xl border border-sl-line bg-sl-surface">
            <div className="sticky right-0 top-0 z-10 flex justify-end border-b border-sl-line bg-sl-surface p-2">
              <button
                type="button"
                className={BTN_SECONDARY}
                onClick={() => setViewingFile(null)}
                data-testid="button-close-file-preview"
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <p className="mb-2 text-sm text-sl-muted">{viewingFile.name}</p>
              <FilePreview
                fileName={viewingFile.name}
                fileUrl={viewingFile.url}
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
    </AcademyShell>
  );
}
