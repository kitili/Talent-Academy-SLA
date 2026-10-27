import { useState, useEffect, useRef, type ReactNode } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import posthog from "posthog-js";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Circle, Maximize2, Minimize2, ZoomIn, ZoomOut, List, Lock } from "lucide-react";
import { Document, Page, pdfjs } from 'react-pdf';
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { FileQuizDialog } from "@/components/FileQuizDialog";
import { useScreenshotProtection } from "@/hooks/use-screenshot-protection";
import { ScreenshotWarning } from "@/components/ScreenshotWarning";
import { TableOfContents } from "@/components/TableOfContents";
import { AcademyShell } from "@/components/AcademyShell";
import { sanitizeLessonHtml } from "@shared/htmlSanitize";
import { MODULE_QUIZ_PASS_PERCENT } from "@shared/constants";
import { DiscussionThread } from "@/components/DiscussionThread";
import { saveLastLesson } from "@/lib/lastLessonCache";
import type { TocEntry } from "@shared/schema";
import { youtubeEmbedSrc } from "@shared/youtube";

function YouTubeLesson({ id, title }: { id: string; title: string }) {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingTop: "56.25%" }}>
        <iframe
          src={youtubeEmbedSrc(id)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// DocumentViewer component for displaying DOCX files converted to HTML
function DocumentViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const response = await fetch(url);
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid response format: expected JSON');
        }
        
        const data = await response.json();
        if (data.html) {
          setHtml(data.html);
          setError(null);
        } else {
          throw new Error('No HTML content in response');
        }
      } catch (error) {
        console.error('Error loading document:', error);
        setError('Failed to load document. Please try again.');
        setHtml('');
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [url]);

  if (loading) {
    return <div className="flex items-center justify-center w-full p-12"><p className="text-muted-foreground">Loading document...</p></div>;
  }

  if (error) {
    return <div className="flex items-center justify-center w-full p-12"><p className="text-destructive">{error}</p></div>;
  }

  return (
    <div 
      ref={contentRef}
      className="w-full p-8 bg-white dark:bg-slate-900 text-black dark:text-white prose dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const SECTION = "rounded-xl border border-sl-line bg-sl-surface";
const BUTTON_BASE = "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm disabled:opacity-50";
const SECONDARY = `${BUTTON_BASE} border border-sl-control bg-sl-surface text-sl-ink`;
const PRIMARY = `${BUTTON_BASE} bg-sl-accent-strong font-semibold text-white`;

/** For a lesson file with no approved quiz: reading it is what completes it (D6). */
function MarkReadButton({ done, disabled, onClick }: { done: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${SECONDARY} font-semibold`} disabled={done || disabled} onClick={onClick}>
      {done ? (
        <><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-sl-done" />Read</>
      ) : (
        "Mark as read"
      )}
    </button>
  );
}

function LessonPage({ html, onRead }: { html: string; onRead: () => void }) {
  return (
    <article className="sl-lesson mx-auto max-w-2xl p-6 sm:p-8">
      <div
        className="prose max-w-none text-sl-ink"
        dangerouslySetInnerHTML={{ __html: sanitizeLessonHtml(html) }}
      />
      <button type="button" className={`${PRIMARY} mt-6`} onClick={onRead}>
        I have read this lesson
      </button>
    </article>
  );
}

interface DeckFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  lessonHtml?: string;
  toc?: TocEntry[];
  youtubeId?: string;
  /** From the server: `locked`, `completed`, or the progress row's status (C2, D6). */
  status?: string;
  /** Whether the file has an approved quiz. With none, the Fellow marks it read to continue (D6). */
  quizApproved?: boolean;
  quizPassed?: boolean;
  done?: boolean;
  progress?: {
    status: string;
    completedAt: Date | null;
  };
}

interface WeekProgress {
  total: number;
  completed: number;
  percentage: number;
}

const hasExtension = (name: string | undefined, extensions: string[]) =>
  extensions.some((extension) => (name || "").toLowerCase().endsWith(extension));

export default function TeacherContentView() {
  const params = useParams<{ courseId?: string; weekId: string }>();
  const weekId = params.weekId;
  // No courseId for teachers
  const [, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0); // Fullscreen zoom
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [hasMarkedComplete, setHasMarkedComplete] = useState<boolean>(false);
  const [fileQuizDialogOpen, setFileQuizDialogOpen] = useState<boolean>(false);
  const [selectedQuizFileId, setSelectedQuizFileId] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState<string>('');
  const [documentLoadError, setDocumentLoadError] = useState<boolean>(false);

  // Track which file's ToC is expanded
  const [expandedTocFileId, setExpandedTocFileId] = useState<string | null>(null);

  // Track intended page when switching files via ToC navigation
  const [intendedPage, setIntendedPage] = useState<number | null>(null);

  // Track previous file ID to detect actual file changes
  const prevFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (weekId) sessionStorage.setItem("sl-last-week", weekId);
  }, [weekId]);

  // Pinch-to-zoom state for the slides on a phone
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const lastPinchDistance = useRef<number | null>(null);

  // The reader's width: a slide page is drawn to fit it.
  const [readerEl, setReaderEl] = useState<HTMLDivElement | null>(null);
  const [readerWidth, setReaderWidth] = useState<number>(640);
  useEffect(() => {
    if (!readerEl) return;
    const observer = new ResizeObserver(([entry]) => setReaderWidth(Math.floor(entry.contentRect.width)));
    observer.observe(readerEl);
    return () => observer.disconnect();
  }, [readerEl]);
  const pdfWidth = Math.max(260, readerWidth - 24) * zoomScale;

  const handlePdfTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastPinchDistance.current !== null) {
        const delta = dist / lastPinchDistance.current;
        setZoomScale(prev => Math.min(3, Math.max(0.8, prev * delta)));
      }
      lastPinchDistance.current = dist;
    }
  };
  const handlePdfTouchEnd = () => { lastPinchDistance.current = null; };

  // Screenshot protection
  const { showWarning, dismissWarning } = useScreenshotProtection(weekId);

  // Fetch deck files with progress from the unified content endpoint
  const { data: contentData, isLoading, error: contentError } = useQuery<{ week: any; content: DeckFile[] }>({
    queryKey: ['/api/teachers/weeks', weekId, 'content'],
    enabled: !!weekId,
  });

  const deckFiles = contentData?.content || [];
  const currentWeek = contentData?.week;

  const { data: assignedWeeks = [] } = useQuery<any[]>({
    queryKey: ["/api/teacher/assigned-weeks"],
  });
  const courseModules = [...assignedWeeks]
    .filter((w: any) => (w.courseId || w.courseName) === (currentWeek?.courseId || currentWeek?.courseName))
    .sort((a: any, b: any) => (a.weekNumber || 0) - (b.weekNumber || 0));
  const currentModuleIndex = courseModules.findIndex((w: any) => w.id === weekId);
  const previousModule = currentModuleIndex > 0 ? courseModules[currentModuleIndex - 1] : null;
  const nextModule = currentModuleIndex >= 0 && currentModuleIndex < courseModules.length - 1
    ? courseModules[currentModuleIndex + 1]
    : null;
  const nextModuleLocked = !!nextModule?.locked;

  // The cohort and step this module sits in, for the breadcrumb: the Fellow's path lists each cohort's steps and courses.
  const { data: academyPath } = useQuery<any>({
    queryKey: ["/api/teacher/academy-path"],
  });
  const thisModule = assignedWeeks.find((w: any) => w.id === weekId);
  const courseName: string = thisModule?.courseName || currentWeek?.courseName || "";
  const pathCohort = (academyPath?.cohorts || []).find((cohort: any) => cohort.id === thisModule?.batchId);
  const stepIndex = pathCohort
    ? (pathCohort.batches || []).findIndex((step: any) => (step.courses || []).some((course: any) => course.id === (thisModule?.courseId || currentWeek?.courseId)))
    : -1;

  // Fetch quiz passage data for all files in the week
  const { data: fileQuizData = {} } = useQuery<Record<string, any>>({
    queryKey: [`/api/teacher/week/${weekId}/file-quizzes`],
    enabled: !!weekId,
  });

  // Calculate week progress from deck files; the server says which files are done.
  const weekProgress: WeekProgress = {
    total: deckFiles.length,
    completed: deckFiles.filter((f) => f.done).length,
    percentage: deckFiles.length > 0
      ? Math.round((deckFiles.filter((f) => f.done).length / deckFiles.length) * 100)
      : 0,
  };

  // Mark a file read. The server decides what that means: with no approved quiz it completes the file.
  const saveProgressMutation = useMutation({
    mutationFn: async (data: {
      deckFileId: string;
      status: string;
      completedAt?: Date;
    }) => {
      return apiRequest('POST', `/api/teachers/weeks/${weekId}/content/${data.deckFileId}/viewed`, {
        weekId,
        ...data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/teachers/weeks', weekId, 'content'] });
      queryClient.invalidateQueries({ queryKey: ["/api/teacher/assigned-weeks"] });
    },
  });

  // Get selected file
  const selectedFile = deckFiles.find(file => file.id === selectedFileId);

  useEffect(() => {
    if (selectedFile?.lessonHtml && weekId) {
      saveLastLesson({
        weekId,
        title: selectedFile.fileName || currentWeek?.competencyFocus || "Lesson",
        html: selectedFile.lessonHtml,
      });
    }
  }, [selectedFile?.id, selectedFile?.lessonHtml, weekId, selectedFile?.fileName, currentWeek?.competencyFocus]);

  // Auto-select first file
  useEffect(() => {
    if (deckFiles.length > 0 && !selectedFileId) {
      const firstFile = deckFiles[0];
      setSelectedFileId(firstFile.id);
      setHasMarkedComplete(Boolean(firstFile.done));
      posthog.capture("file_opened", { weekId, fileId: firstFile.id, fileName: firstFile.fileName, source: "auto_select" });
    }
  }, [deckFiles, selectedFileId, weekId]);

  // Fetch presigned URL when file is selected
  useEffect(() => {
    const fetchViewUrl = async () => {
      if (!selectedFile) {
        setViewUrl(null);
        setDocumentLoadError(false);
        return;
      }

      if (selectedFile.lessonHtml) {
        setViewUrl(null);
        setDocumentLoadError(false);
        return;
      }

      try {
        const fileName = (selectedFile.fileName || "").toLowerCase();
        const isPptx = fileName.endsWith('.pptx') || fileName.endsWith('.ppt');
        const isDocx = fileName.endsWith('.docx') || fileName.endsWith('.doc');

        if (isPptx) {
          const convertUrl = `/api/files/convert-to-pdf?url=${encodeURIComponent(selectedFile.fileUrl)}`;
          const probe = await fetch(convertUrl, { credentials: "include" });
          const type = probe.headers.get("content-type") || "";
          if (!probe.ok || !type.includes("pdf")) {
            setDocumentLoadError(true);
            setViewUrl(null);
            return;
          }
          setDocumentLoadError(false);
          setViewUrl(convertUrl);
        } else if (isDocx) {
          // For Word documents, convert to HTML using mammoth
          const convertUrl = `/api/files/convert-to-html?url=${encodeURIComponent(selectedFile.fileUrl)}`;
          setDocumentLoadError(false);
          setViewUrl(convertUrl);
        } else {
          // For all other files (videos, documents, etc.), use the proxy endpoint
          // This ensures files are served with inline disposition headers
          const proxyUrl = `/api/files/proxy?url=${encodeURIComponent(selectedFile.fileUrl)}`;
          setDocumentLoadError(false);
          setViewUrl(proxyUrl);
        }
      } catch (error) {
        console.error('Error fetching view URL:', error);
        // Fallback to proxy endpoint
        setDocumentLoadError(false);
        setViewUrl(`/api/files/proxy?url=${encodeURIComponent(selectedFile.fileUrl)}`);
      }
    };

    fetchViewUrl();

    // Only reset page number if the file actually changed
    const currentFileId = selectedFile?.id || null;
    if (currentFileId !== prevFileIdRef.current) {
      // File changed - use intended page if available, otherwise reset to 1
      if (intendedPage !== null) {
        setPageNumber(intendedPage);
        setIntendedPage(null);
      } else {
        setPageNumber(1);
      }
      prevFileIdRef.current = currentFileId;
    }
  }, [selectedFile, intendedPage]);

  // Handle file click
  const handleFileClick = (file: DeckFile) => {
    setSelectedFileId(file.id);
    setHasMarkedComplete(Boolean(file.done));
    // Auto-expand ToC for newly selected file if it has one
    if (file.toc && file.toc.length > 0) {
      setExpandedTocFileId(file.id);
    }
    posthog.capture("file_opened", { weekId, fileId: file.id, fileName: file.fileName });
  };

  // Track completion when user reaches the last page
  useEffect(() => {
    if (!selectedFile || hasMarkedComplete || selectedFile.done) {
      return;
    }

    // Mark as complete when user reaches the last page
    if (numPages > 0 && pageNumber === numPages) {
      saveProgressMutation.mutate({
        deckFileId: selectedFile.id,
        status: 'completed',
        completedAt: new Date(),
      });
      setHasMarkedComplete(true);
      posthog.capture("content_completed", { weekId, fileId: selectedFile.id, fileName: selectedFile.fileName, totalPages: numPages });
    }
  }, [selectedFile, pageNumber, numPages, hasMarkedComplete, saveProgressMutation]);

  // Handle direct page input
  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow numbers
    if (value === '' || /^\d+$/.test(value)) {
      setPageInputValue(value);
    }
  };

  const handlePageInputSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const targetPage = parseInt(pageInputValue);
    if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= numPages) {
      setPageNumber(targetPage);
      setPageInputValue(''); // Clear input after successful jump
    } else if (pageInputValue !== '') {
      // Invalid page - shake or show feedback
      setPageInputValue('');
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handlePageInputSubmit();
    } else if (e.key === 'Escape') {
      setPageInputValue('');
    }
  };

  const shell = (children: ReactNode) => (
    <AcademyShell
      title="Learning"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      desk="fellow"
      current="learning"
    >
      {children}
    </AcademyShell>
  );

  if (isLoading) {
    return shell(
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the module">
        <div className="h-7 w-1/2 rounded bg-sl-neutral-soft" />
        <div className="h-4 w-1/3 rounded bg-sl-neutral-soft" />
        <div className="h-40 rounded-xl bg-sl-neutral-soft" />
      </div>
    );
  }

  if (contentError) {
    // The server refuses with `{ error, code }`; show its sentence.
    let refusal: { error?: string; code?: string; locked?: boolean } = {};
    try {
      refusal = JSON.parse(contentError.message.replace(/^\d+:\s*/, ""));
    } catch {
      refusal = {};
    }
    const locked = refusal.locked === true || refusal.code === "MODULE_LOCKED";
    return shell(
      <section className={`${SECTION} flex flex-col items-start gap-3 px-5 py-6`}>
        <Lock aria-hidden="true" className="h-8 w-8 text-sl-muted" />
        <h1 className="m-0 text-xl font-semibold text-sl-ink">{locked ? "Module locked" : "Unable to load this module"}</h1>
        <p className="m-0 max-w-md text-sl-muted">
          {locked
            ? "Finish the module before this one, and the course before this course, to unlock it."
            : refusal.error || contentError.message}
        </p>
        <button type="button" className={PRIMARY} onClick={() => navigate("/teacher/dashboard?tab=learning")}>
          Back to Learning
        </button>
      </section>
    );
  }

  const isPdfFile = Boolean(selectedFile) && hasExtension(selectedFile?.fileName, ['.pdf', '.pptx', '.ppt']);
  const youtubeId = selectedFile?.youtubeId;
  const isVideoFile = Boolean(selectedFile) && !youtubeId && hasExtension(selectedFile?.fileName, ['.mp4', '.webm', '.mov']);
  const isDocxFile = Boolean(selectedFile) && hasExtension(selectedFile?.fileName, ['.docx', '.doc']);

  const crumbs = [
    { label: "Learning", href: "/teacher/dashboard?tab=learning", test: "button-back-to-weeks" },
    ...(pathCohort ? [{ label: pathCohort.name as string, href: "/teacher/dashboard?tab=learning" }] : []),
    ...(stepIndex >= 0 ? [{ label: `Step ${stepIndex + 1}`, href: "/teacher/dashboard?tab=learning" }] : []),
  ] as Array<{ label: string; href: string; test?: string }>;

  const objectiveLines: string[] = (currentWeek?.objective || "")
    .split(/(?=\d+\.)/)
    .map((line: string) => line.trim())
    .filter(Boolean);

  const openQuiz = (fileId: string) => {
    setSelectedQuizFileId(fileId);
    setFileQuizDialogOpen(true);
  };
  const quizFileIndex = deckFiles.findIndex((file) => file.id === selectedQuizFileId);
  const fileAfterQuiz = quizFileIndex >= 0 ? deckFiles[quizFileIndex + 1] : undefined;

  const pagerButton = `${SECONDARY} px-3.5`;

  return shell(
    <>
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm text-sl-muted">
          {crumbs.map((crumb, index) => (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              <Link href={crumb.href} className="text-sl-accent underline" data-testid={crumb.test}>{crumb.label}</Link>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </li>
          ))}
          <li>
            <span aria-current="page" className="font-medium text-sl-ink">{courseName || `Module ${currentWeek?.weekNumber ?? ""}`}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-semibold text-sl-ink">
            Module {currentWeek?.weekNumber}{currentWeek?.competencyFocus ? ` · ${currentWeek.competencyFocus}` : ""}
          </h1>
          <span className="text-sm text-sl-muted">
            {[courseName, pathCohort?.name, `pass mark ${MODULE_QUIZ_PASS_PERCENT}%`].filter(Boolean).join(" · ")}
          </span>
        </div>
        {(previousModule || nextModule) && (
          <div className="flex gap-2">
            <button
              type="button"
              className={SECONDARY}
              disabled={!previousModule}
              onClick={() => previousModule && navigate(`/teacher/week/${previousModule.id}/content`)}
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              Previous module
            </button>
            <button
              type="button"
              className={SECONDARY}
              disabled={!nextModule || nextModuleLocked}
              onClick={() => nextModule && !nextModuleLocked && navigate(`/teacher/week/${nextModule.id}/content`)}
            >
              Next module
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <section aria-labelledby="objective" className={`${SECTION} flex flex-col gap-2 px-5 py-[18px]`}>
        <h2 id="objective" className="m-0 text-lg font-semibold text-sl-ink">Objective</h2>
        {objectiveLines.length > 0 ? (
          <div className="flex max-w-[680px] flex-col gap-1 text-[15px] leading-relaxed text-sl-neutral">
            {objectiveLines.map((line, index) => <p key={index} className="m-0">{line}</p>)}
          </div>
        ) : (
          <p className="m-0 text-sm text-sl-muted">No objective has been written for this module yet.</p>
        )}
      </section>

      <section aria-labelledby="files" className={`${SECTION} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sl-line px-5 py-4">
          <h2 id="files" className="m-0 text-lg font-semibold text-sl-ink">Lesson files</h2>
          {weekProgress.total > 0 && (
            <span className="text-sm text-sl-muted">
              {weekProgress.completed} of {weekProgress.total} lesson {weekProgress.total === 1 ? "file" : "files"} done
            </span>
          )}
        </div>

        {deckFiles.length === 0 ? (
          <div className="flex flex-col gap-1 px-5 py-[18px]">
            <p className="m-0 text-[15px] font-medium text-sl-ink">No lesson file yet</p>
            <p className="m-0 text-sm text-sl-muted">Your trainer will add one; this module does not hold you up.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 px-5 py-[18px]">
            {selectedFile && (
              <>
                <h3 className="m-0 text-[17px] font-semibold text-sl-ink">{selectedFile.fileName}</h3>
                <div role="region" aria-label="Lesson file viewer" className="overflow-hidden rounded-[10px] border border-sl-control bg-sl-surface">
                  <div
                    ref={setReaderEl}
                    className="relative flex min-h-[260px] flex-col text-sl-ink"
                    onTouchMove={isPdfFile ? handlePdfTouchMove : undefined}
                    onTouchEnd={isPdfFile ? handlePdfTouchEnd : undefined}
                    style={isPdfFile ? { touchAction: zoomScale > 1 ? 'none' : 'pan-y' } : undefined}
                  >
                    {youtubeId ? (
                      <YouTubeLesson id={youtubeId} title={selectedFile.fileName} />
                    ) : selectedFile.lessonHtml ? (
                      <LessonPage
                        html={selectedFile.lessonHtml}
                        onRead={() => saveProgressMutation.mutate({ deckFileId: selectedFile.id, status: "completed", completedAt: new Date() })}
                      />
                    ) : isPdfFile ? (
                      <div className="flex min-h-[260px] justify-center overflow-auto bg-white p-3 text-black">
                        {viewUrl ? (
                          <>
                            <Document
                              file={viewUrl}
                              onLoadSuccess={({ numPages }) => {
                                setNumPages(numPages);
                                setDocumentLoadError(false);
                              }}
                              onLoadError={(error) => {
                                console.error('PDF load error:', error);
                                setDocumentLoadError(true);
                              }}
                              className="flex-shrink-0"
                            >
                              <Page
                                pageNumber={pageNumber}
                                width={pdfWidth}
                                devicePixelRatio={window.devicePixelRatio || 1}
                                renderTextLayer={true}
                                renderAnnotationLayer={true}
                              />
                            </Document>
                            {zoomScale > 1.05 && (
                              <button
                                type="button"
                                onClick={() => setZoomScale(1.0)}
                                className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
                              >
                                Reset zoom
                              </button>
                            )}
                          </>
                        ) : (
                          <p className="m-0 p-8 text-center text-sm text-sl-muted">
                            {documentLoadError
                              ? "This presentation could not be opened. You can still take the quiz, or ask your trainer to upload the slides again."
                              : "Loading document..."}
                          </p>
                        )}
                        {documentLoadError && viewUrl && (
                          <p className="m-0 p-8 text-sm text-sl-muted">Preview not available</p>
                        )}
                      </div>
                    ) : isVideoFile ? (
                      <div className="flex flex-col items-center justify-center p-4">
                        {viewUrl && (
                          <video
                            src={viewUrl}
                            controls
                            controlsList="nodownload"
                            className="h-auto w-full max-w-4xl rounded-lg bg-black"
                            data-testid="video-viewer"
                          >
                            Your browser does not support the video tag.
                          </video>
                        )}
                      </div>
                    ) : viewUrl ? (
                      <div className="flex w-full flex-col gap-4 p-4">
                        {hasExtension(selectedFile.fileName, ['.txt']) ? (
                          <textarea
                            readOnly
                            aria-label={selectedFile.fileName}
                            className="min-h-[600px] w-full resize-none rounded-lg border-0 bg-sl-surface p-6 font-mono text-sl-ink"
                            data-testid="text-viewer"
                            style={{ lineHeight: '1.5' }}
                            onContextMenu={(e) => e.preventDefault()}
                          />
                        ) : isDocxFile ? (
                          <div className="overflow-hidden rounded-lg bg-white dark:bg-slate-900">
                            <DocumentViewer url={viewUrl} />
                          </div>
                        ) : (
                          <iframe
                            src={viewUrl}
                            className="pointer-events-auto min-h-[600px] w-full select-none border-0"
                            title={selectedFile.fileName}
                            data-testid="file-viewer"
                            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                            sandbox="allow-same-origin allow-scripts"
                            onContextMenu={(e) => e.preventDefault()}
                          />
                        )}
                        <div className="flex justify-center">
                          <button type="button" className={PRIMARY} onClick={() => setIsFullscreen(true)} data-testid="button-fullscreen">
                            <Maximize2 aria-hidden="true" className="h-4 w-4" />
                            Fullscreen view
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="m-0 p-8 text-center text-sl-muted">Loading file...</p>
                    )}
                  </div>

                  {isPdfFile && viewUrl && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-sl-line bg-sl-ground px-3.5 py-2.5">
                      <button type="button" className={pagerButton} onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
                        Previous page
                      </button>
                      <span aria-live="polite" className="flex items-center gap-1.5 text-sm text-sl-neutral">
                        Page
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Go to page"
                          value={pageInputValue}
                          onChange={handlePageInputChange}
                          onKeyDown={handlePageInputKeyDown}
                          onBlur={handlePageInputSubmit}
                          placeholder={pageNumber.toString()}
                          className="h-9 w-14 rounded-md border border-sl-control bg-sl-surface text-center text-sm text-sl-ink"
                          data-testid="input-page-number"
                        />
                        of {numPages}
                      </span>
                      <button type="button" className={pagerButton} onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>
                        Next page
                      </button>
                      <button type="button" className={pagerButton} onClick={() => setIsFullscreen(true)} data-testid="button-fullscreen-normal">
                        <Maximize2 aria-hidden="true" className="h-4 w-4" />
                        Fullscreen
                      </button>
                      {pageNumber === numPages && numPages > 0 && (
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-sl-done">
                          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                          Last page reached
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {deckFiles.map((file) => {
                const quizStatus = fileQuizData[file.id];
                const hasPassedQuiz = file.quizPassed === true || quizStatus?.passed === true || quizStatus?.hasPassed === true;
                const hasToc = file.toc && file.toc.length > 0;
                const isTocExpanded = expandedTocFileId === file.id;
                // The server locks a file until the one before it is done (C2, D6).
                const isLocked = file.status === "locked";
                const isSelected = selectedFileId === file.id;
                const subline = isLocked
                  ? "Locked until the lesson file before it is done"
                  : file.quizApproved
                    ? hasPassedQuiz ? "Quiz passed · done" : "Done once you pass its quiz"
                    : file.done ? "Read · done" : "No quiz on this file · done once you mark it read";

                return (
                  <li
                    key={file.id}
                    className={`flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 ${
                      isSelected ? "border-sl-accent bg-sl-accent-soft" : "border-sl-line"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleFileClick(file)}
                        disabled={isLocked}
                        aria-current={isSelected ? "true" : undefined}
                        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 bg-transparent p-0 text-left disabled:cursor-not-allowed disabled:opacity-60"
                        data-testid={`button-file-${file.id}`}
                      >
                        {isLocked ? (
                          <Lock aria-hidden="true" className="h-5 w-5 flex-none text-sl-muted" />
                        ) : file.done ? (
                          <CheckCircle2 aria-hidden="true" className="h-5 w-5 flex-none text-sl-done" />
                        ) : (
                          <Circle aria-hidden="true" className="h-5 w-5 flex-none text-sl-muted" />
                        )}
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate text-[15px] text-sl-ink">{file.fileName}</span>
                          <span className="text-[13px] text-sl-muted">{subline}</span>
                        </span>
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        {hasToc && (
                          <button
                            type="button"
                            onClick={() => setExpandedTocFileId(isTocExpanded ? null : file.id)}
                            className={`${SECONDARY} px-3`}
                            data-testid={`button-toggle-toc-${file.id}`}
                            aria-expanded={isTocExpanded}
                            aria-label={isTocExpanded ? "Hide contents" : "View contents"}
                          >
                            <List aria-hidden="true" className="h-3.5 w-3.5" />
                            Contents
                            <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isTocExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        )}
                        {/* A file with an approved quiz is done when the quiz is passed; one without, when marked read (D6). */}
                        {!file.quizApproved ? (
                          <MarkReadButton
                            done={Boolean(file.done)}
                            disabled={isLocked || saveProgressMutation.isPending}
                            onClick={() => saveProgressMutation.mutate({ deckFileId: file.id, status: "completed" })}
                          />
                        ) : (
                          <button
                            type="button"
                            className={hasPassedQuiz ? `${SECONDARY} font-semibold` : PRIMARY}
                            disabled={isLocked}
                            onClick={() => openQuiz(file.id)}
                            data-testid={`button-file-quiz-${file.id}`}
                          >
                            {hasPassedQuiz ? (
                              <><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-sl-done" />Quiz passed</>
                            ) : (
                              `Take the quiz · pass at ${MODULE_QUIZ_PASS_PERCENT}%`
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded ToC - shown beneath the file when expanded */}
                    {hasToc && isTocExpanded && (
                      <div className="overflow-hidden rounded-lg border border-sl-line bg-sl-surface">
                        <TableOfContents
                          toc={file.toc || []}
                          currentPage={isSelected ? pageNumber : 1}
                          onPageSelect={(page) => {
                            // If selecting a ToC entry for a different file, set the intended page first
                            if (!isSelected) {
                              setIntendedPage(page);
                              handleFileClick(file);
                            } else {
                              // Same file, just navigate to the page
                              setPageNumber(page);
                            }
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="m-0 text-xs text-sl-muted">Reaching the last page of a slide file counts as reading it.</p>
          </div>
        )}
      </section>

      {weekId ? <DiscussionThread weekId={weekId} cohortName={pathCohort?.name} /> : null}

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="h-[100dvh] w-full max-w-[100vw] gap-0 p-0">
          <div className="flex h-full flex-col bg-background">
            {/* Fullscreen header */}
            <div className="flex flex-shrink-0 items-center justify-between border-b bg-card p-4">
              <h2 className="text-lg font-semibold">{selectedFile?.fileName}</h2>
            </div>

            {/* Fullscreen content - scrollable with fixed control bar */}
            <div className="relative flex-1 overflow-y-auto bg-muted/20 pb-24">
              {selectedFile && (
                isPdfFile ? (
                  <div className="flex flex-col items-center p-6">
                    {viewUrl ? (
                      <>
                        <div className="select-none" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                          <Document
                            file={viewUrl}
                            onLoadSuccess={({ numPages }) => {
                              setNumPages(numPages);
                              setDocumentLoadError(false);
                            }}
                            onLoadError={(error) => {
                              console.error('PDF load error:', error);
                              setDocumentLoadError(true);
                            }}
                            className="shadow-2xl"
                          >
                            <Page
                              pageNumber={pageNumber}
                              scale={scale}
                              devicePixelRatio={window.devicePixelRatio || 1}
                              renderTextLayer={true}
                              renderAnnotationLayer={true}
                            />
                          </Document>
                        </div>
                        {documentLoadError && (
                          <div className="mt-4 flex h-96 items-center justify-center rounded-xl bg-muted">
                            <p className="text-xs text-muted-foreground">Preview not available</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-8 text-center text-muted-foreground">
                        {documentLoadError
                          ? "This presentation could not be opened. You can still take the quiz, or ask your trainer to upload the slides again."
                          : "Loading document..."}
                      </div>
                    )}
                  </div>
                ) : isDocxFile ? (
                  <div className="flex h-full items-start justify-center overflow-auto p-6">
                    <div className="max-h-[calc(100vh-180px)] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl dark:bg-slate-900">
                      <DocumentViewer url={viewUrl || ''} />
                    </div>
                  </div>
                ) : isVideoFile ? (
                  <div className="flex h-full flex-col items-center justify-center">
                    <video
                      src={viewUrl || ''}
                      controls
                      controlsList="nodownload"
                      className="h-full w-full bg-black object-contain"
                      data-testid="video-viewer-fullscreen"
                    >
                      Your browser does not support the video tag.
                    </video>
                  </div>
                ) : (
                  <iframe
                    src={viewUrl || ''}
                    className="h-full w-full select-none border-0"
                    title={selectedFile?.fileName || 'Document'}
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    sandbox="allow-same-origin allow-scripts"
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )
              )}
            </div>

            {/* Fixed Control Bar for Fullscreen - Always visible at bottom */}
            {isPdfFile && (
              <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-card/95 shadow-2xl backdrop-blur-sm">
                <div className="mx-auto max-w-7xl px-4 py-4">
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    {/* Page Navigation Controls */}
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <Button
                        onClick={() => setPageNumber(p => Math.max(1, p - 1))}
                        disabled={pageNumber <= 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>

                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                          Page
                        </span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={pageInputValue}
                          onChange={handlePageInputChange}
                          onKeyDown={handlePageInputKeyDown}
                          onBlur={handlePageInputSubmit}
                          placeholder={pageNumber.toString()}
                          className="h-8 w-16 text-center text-sm"
                          data-testid="input-page-number-fullscreen"
                        />
                        <span className="whitespace-nowrap text-sm text-muted-foreground">
                          of {numPages}
                        </span>
                      </div>

                      <Button
                        onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}
                        disabled={pageNumber >= numPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>

                    {/* Zoom Controls */}
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <Button
                        onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
                        variant="outline"
                        size="sm"
                        aria-label="Zoom out"
                        data-testid="button-zoom-out-fullscreen"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                      <span className="min-w-16 text-center text-sm font-medium text-muted-foreground">
                        {Math.round(scale * 100)}%
                      </span>
                      <Button
                        onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
                        variant="outline"
                        size="sm"
                        aria-label="Zoom in"
                        data-testid="button-zoom-in-fullscreen"
                      >
                        <ZoomIn className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Exit Fullscreen Button */}
                    <Button
                      onClick={() => setIsFullscreen(false)}
                      variant="outline"
                      size="sm"
                      data-testid="button-exit-fullscreen-control"
                    >
                      <Minimize2 className="mr-1 h-4 w-4" />
                      Exit Fullscreen
                    </Button>

                    {/* Completion Indicator */}
                    {pageNumber === numPages && numPages > 0 && (
                      <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold text-primary">Last page reached!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* File Quiz Dialog */}
      {selectedQuizFileId && (
        <FileQuizDialog
          weekId={weekId || ''}
          fileId={selectedQuizFileId}
          fileName={deckFiles.find(f => f.id === selectedQuizFileId)?.fileName || ''}
          open={fileQuizDialogOpen}
          onOpenChange={setFileQuizDialogOpen}
          canGenerateQuiz={false}
          onNextFile={fileAfterQuiz ? () => {
            setFileQuizDialogOpen(false);
            handleFileClick(fileAfterQuiz);
          } : undefined}
        />
      )}

      {/* Screenshot Warning Overlay */}
      <ScreenshotWarning visible={showWarning} onDismiss={dismissWarning} />
    </>
  );
}
