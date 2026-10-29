import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChevronLeft } from "lucide-react";
import { learningStatus, staffWatchLabel } from "@shared/learningStatus";
import { deadlineLocalValue, parseDeadline } from "@shared/academyPath";
import { deskName } from "@shared/deskName";
import { audienceLabel } from "@shared/academyPeople";
import { AcademyShell } from "@/components/AcademyShell";
import { SkeletonBar, SkeletonCard, SkeletonFigures, SkeletonRows } from "@/components/Skeletons";

// Buttons, fields and chips follow design/board/CohortRoom.dc.html with the sl-* tokens.
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sl-accent";
const BTN_PRIMARY = `inline-flex items-center justify-center rounded-lg bg-sl-accent-strong px-4 py-2.5 min-h-[44px] text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const BTN_SECONDARY = `inline-flex items-center justify-center rounded-lg border border-sl-control bg-sl-surface px-3.5 py-2.5 min-h-[44px] text-sm text-sl-ink hover:bg-sl-neutral-soft disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`;
const FIELD = `w-full rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted ${FOCUS}`;
const LABEL = "text-sm font-medium text-sl-ink";
const PANEL = "rounded-xl border border-sl-line bg-sl-surface";

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

/** The roster's Status column: done for finished, attention when the Trainer can help, neutral otherwise. */
function fellowStatus(percentage: number): { label: string; tone: Tone } {
  const status = learningStatus({ percentage });
  if (status === "Completed" || status === "Passed") return { label: "Completed", tone: "done" };
  if (staffWatchLabel(percentage, status) === "Needs support") return { label: "Needs support", tone: "attention" };
  if (status === "In Progress") return { label: "In progress", tone: "neutral" };
  return { label: "Not started", tone: "neutral" };
}

const TAB_TRIGGER = `h-auto min-h-[44px] rounded-none border-b-2 border-transparent bg-transparent px-3.5 py-3 text-[15px] font-normal text-sl-neutral shadow-none -mb-px data-[state=active]:border-sl-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-sl-accent data-[state=active]:shadow-none ${FOCUS}`;

export default function CohortWorkspace() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isAdmin, logoutMutation } = useAuth();
  // `?tab=work&work=<id>` opens one assessment's marking straight from the Trainer's Assessments page.
  const linked = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const [tab, setTab] = useState(linked.get("tab") || "people");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceMessage, setAnnounceMessage] = useState("");
  const [csvText, setCsvText] = useState("name,email,password\n");
  const [workTitle, setWorkTitle] = useState("");
  const [workInstructions, setWorkInstructions] = useState("");
  const [workDue, setWorkDue] = useState("");
  const [openWorkId, setOpenWorkId] = useState<string | null>(linked.get("work"));
  const [workAudience, setWorkAudience] = useState<string[]>([]);
  const [dueDrafts, setDueDrafts] = useState<Record<string, string>>({});
  const [markDrafts, setMarkDrafts] = useState<Record<string, { score: string; comment: string }>>({});
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("session");
  const [eventStart, setEventStart] = useState("");

  const { data: batch, isLoading } = useQuery<any>({
    queryKey: ["/api/batches", batchId],
    enabled: Boolean(batchId),
  });

  const { data: quizzes = [], isLoading: quizzesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "quizzes"],
    enabled: Boolean(batchId),
  });

  const { data: fileQuizzes = [], isLoading: fileQuizzesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "file-quizzes"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/file-quizzes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: progress = [], isLoading: progressLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "progress"],
    enabled: Boolean(batchId),
  });

  // Only an Admin can read the academy path, so only an Admin sees each Fellow's Step on the roster.
  const { data: academyPath, isLoading: academyPathLoading } = useQuery<any>({
    queryKey: ["/api/admin/academy-path"],
    enabled: Boolean(batchId) && isAdmin,
  });

  const { data: certificates = [], isLoading: certificatesLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "certificates"],
    enabled: Boolean(batchId),
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "events"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/events`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "assignments"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/assignments`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: announcements = [], isLoading: announcementsLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "announcements"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/announcements`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId),
  });

  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<any[]>({
    queryKey: ["/api/batches", batchId, "assignments", openWorkId, "submissions"],
    queryFn: async () => {
      const res = await fetch(`/api/batches/${batchId}/assignments/${openWorkId}/submissions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(batchId && openWorkId),
  });

  const teachers = Array.isArray(batch?.teachers) ? batch.teachers : [];
  const closeToGraduate = useMemo(
    () => progress.filter((row) => (row.overallPercentage || 0) >= 80 && (row.overallPercentage || 0) < 100),
    [progress],
  );
  const stepByFellow = useMemo(() => {
    const steps: any[] = academyPath?.cohorts?.find((cohort: any) => cohort.id === batchId)?.batches ?? [];
    const byFellow = new Map<string, string>();
    steps.forEach((step: any, index: number) => {
      (step.teachers ?? []).forEach((fellow: any) => {
        if (!byFellow.has(fellow.id)) byFellow.set(fellow.id, `Step ${index + 1} · ${step.name}`);
      });
    });
    return byFellow;
  }, [academyPath, batchId]);
  const overview = useMemo(() => {
    const rows = Array.isArray(progress) ? progress : [];
    const statuses = rows.map((row) => learningStatus({ percentage: row.overallPercentage || 0 }));
    return {
      total: teachers.length,
      completed: statuses.filter((s) => s === "Completed" || s === "Passed").length,
      inProgress: statuses.filter((s) => s === "In Progress").length,
      notStarted: statuses.filter((s) => s === "Not Started").length,
      needsSupport: rows.filter((row) => staffWatchLabel(row.overallPercentage || 0, learningStatus({ percentage: row.overallPercentage || 0 })) === "Needs support").length,
    };
  }, [progress, teachers.length]);

  const announce = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/announce`, {
        title: announceTitle,
        message: announceMessage,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Announcement sent to ${data.sent || 0} Fellows` });
      setAnnounceTitle("");
      setAnnounceMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "announcements"] });
    },
    onError: () => toast({ title: "Could not send announcement", variant: "destructive" }),
  });

  const importCsv = useMutation({
    mutationFn: async (csv: string) => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/teachers/import-csv`, { csv });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Imported ${data.enrolled || 0} people (${data.created || 0} new)` });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId] });
    },
    onError: () => toast({ title: "Could not import roster", variant: "destructive" }),
  });

  const createWork = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/assignments`, {
        title: workTitle,
        instructions: workInstructions,
        kind: "assessment",
        dueDate: parseDeadline(workDue)?.toISOString() ?? null,
        teacherIds: workAudience,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Assessment assigned" });
      setWorkTitle("");
      setWorkInstructions("");
      setWorkDue("");
      setWorkAudience([]);
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments"] });
    },
    onError: () => toast({ title: "Could not assign work", variant: "destructive" }),
  });

  const saveWorkDue = useMutation({
    mutationFn: async ({ id, dueDate }: { id: string; dueDate: string | null }) => {
      const res = await apiRequest("PATCH", `/api/batches/${batchId}/assignments/${id}`, { dueDate });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deadline saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments"] });
    },
    onError: () => toast({ title: "Could not save the deadline", variant: "destructive" }),
  });

  const createEvent = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/batches/${batchId}/events`, {
        title: eventTitle,
        eventType,
        startDate: eventStart,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Added to the calendar" });
      setEventTitle("");
      setEventStart("");
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "events"] });
    },
    onError: () => toast({ title: "Could not add event", variant: "destructive" }),
  });

  const markWork = useMutation({
    mutationFn: async (payload: { teacherId: string; trainerScore: string; trainerComment: string }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/batches/${batchId}/assignments/${openWorkId}/submissions/${payload.teacherId}`,
        {
          trainerScore: payload.trainerScore === "" ? null : Number(payload.trainerScore),
          trainerComment: payload.trainerComment,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Feedback saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/batches", batchId, "assignments", openWorkId, "submissions"] });
    },
    onError: () => toast({ title: "Could not save feedback", variant: "destructive" }),
  });

  const backHref = isAdmin ? "/admin/batches" : "/trainer/batches?tab=cohorts";
  const fellowCount = teachers.length;
  const figuresLoading = isLoading || quizzesLoading || fileQuizzesLoading || progressLoading;
  const figures: { label: string; value: number | string }[] = [
    { label: "Fellows", value: fellowCount },
    { label: "Quizzes", value: quizzes.length + fileQuizzes.length },
    { label: "In progress", value: overview.inProgress },
    { label: "Completed", value: overview.completed },
    { label: "Needs support", value: overview.needsSupport },
  ];
  const progressByFellow = new Map<string, any>(progress.map((row: any) => [row.teacherId, row]));
  const assessments = assignments.filter((item: any) => item.kind === "assessment");
  // A Mark submissions link names one assessment; bring it into view once the list has loaded, once.
  const scrolledToLinked = useRef(false);
  useEffect(() => {
    const linkedId = linked.get("work");
    if (!linkedId || scrolledToLinked.current || !assessments.some((item: any) => item.id === linkedId)) return;
    scrolledToLinked.current = true;
    requestAnimationFrame(() => document.getElementById(`work-${linkedId}`)?.scrollIntoView({ block: "start" }));
  }, [assessments]);
  const addFellow = () => {
    const name = addName.replace(/["\r\n,]+/g, " ").trim();
    const email = addEmail.replace(/["\r\n,\s]+/g, "").toLowerCase();
    importCsv.mutate(`name,email\n"${name}","${email}"`, {
      onSuccess: () => {
        setAddOpen(false);
        setAddName("");
        setAddEmail("");
      },
    });
  };

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      desk={isAdmin ? "admin" : "trainer"}
      current="cohorts"
    >
      <a
        href={backHref}
        onClick={(event) => {
          event.preventDefault();
          navigate(backHref);
        }}
        className={`inline-flex min-h-[44px] items-center gap-1 self-start text-sm text-sl-accent no-underline hover:underline ${FOCUS}`}
        data-testid="link-back-to-cohorts"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back to cohorts
      </a>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          {isLoading ? (
            <>
              <h1 className="sr-only">Cohort</h1>
              <SkeletonBar className="h-8 w-56" />
            </>
          ) : (
            <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{batch?.name || "Cohort"}</h1>
          )}
          {batch && (
            <>
              <Chip tone={batch.status === "closed" ? "neutral" : "done"}>{batch.status === "closed" ? "Closed" : "Open"}</Chip>
              <Chip tone={batch.quizzesStatus === "stopped" ? "neutral" : "done"}>{batch.quizzesStatus === "stopped" ? "Quizzes stopped" : "Quizzes on"}</Chip>
            </>
          )}
        </div>
        {batch?.description && <p className="text-sm leading-relaxed text-sl-muted">{batch.description}</p>}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Cohort room" className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-sl-line bg-transparent p-0 text-sl-neutral">
          <TabsTrigger value="people" className={TAB_TRIGGER}>People</TabsTrigger>
          <TabsTrigger value="quizzes" className={TAB_TRIGGER}>Quizzes</TabsTrigger>
          <TabsTrigger value="performance" className={TAB_TRIGGER}>Gradebook</TabsTrigger>
          <TabsTrigger value="graduates" className={TAB_TRIGGER}>Graduates</TabsTrigger>
          <TabsTrigger value="announce" className={TAB_TRIGGER}>Announce</TabsTrigger>
          <TabsTrigger value="calendar" className={TAB_TRIGGER}>Calendar</TabsTrigger>
          <TabsTrigger value="work" className={TAB_TRIGGER}>Assessments</TabsTrigger>
          <TabsTrigger value="import" className={TAB_TRIGGER}>Import</TabsTrigger>
        </TabsList>

        <TabsContent value="people" className="mt-5 space-y-6">
          <section className={`${PANEL} overflow-hidden`} aria-labelledby="roster-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-line px-5 py-3.5">
              <h2 id="roster-heading" className="text-lg font-semibold text-sl-ink">
                Roster{" "}
                {!isLoading && (
                  <span className="font-medium text-sl-muted">
                    · {`${fellowCount} ${fellowCount === 1 ? "Fellow" : "Fellows"}`}
                  </span>
                )}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => setTab("import")} data-testid="button-import-roster">
                  Import a roster (CSV)
                </button>
                <button type="button" className={BTN_PRIMARY} onClick={() => setAddOpen(true)} data-testid="button-add-fellow">
                  Add a Fellow
                </button>
              </div>
            </div>
            {isLoading ? (
              <SkeletonRows label="Loading the roster" rows={4} />
            ) : teachers.length === 0 ? (
              <p className="px-5 py-8 text-sm text-sl-muted">
                No Fellows in this cohort yet. Add a Fellow, or import a roster (CSV), and they will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-sl-muted">
                      <th scope="col" className="px-5 py-2.5 font-medium">Fellow</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Email</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Fellow ID</th>
                      {isAdmin && <th scope="col" className="px-3 py-2.5 font-medium">Step</th>}
                      <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map((teacher: any) => {
                      const row = progressByFellow.get(teacher.id);
                      const status = row ? fellowStatus(row.overallPercentage || 0) : null;
                      return (
                        <tr key={teacher.id} className="border-t border-sl-line text-sl-ink">
                          <th scope="row" className="px-5 py-3.5 text-left font-semibold">
                            {isAdmin ? (
                              <a
                                href={`/admin/teachers/${teacher.id}`}
                                onClick={(event) => {
                                  event.preventDefault();
                                  navigate(`/admin/teachers/${teacher.id}`);
                                }}
                                className="text-sl-accent no-underline hover:underline"
                              >
                                {teacher.name}
                              </a>
                            ) : (
                              teacher.name
                            )}
                          </th>
                          <td className="px-3 py-3.5">{teacher.email}</td>
                          <td className="px-3 py-3.5">{teacher.teacherId}</td>
                          {isAdmin && <td className="px-3 py-3.5">{academyPathLoading ? <SkeletonBar className="h-4 w-28" /> : stepByFellow.get(teacher.id) ?? "—"}</td>}
                          <td className="px-5 py-3.5">{progressLoading ? <SkeletonBar className="h-6 w-20 rounded-full" /> : status ? <Chip tone={status.tone}>{status.label}</Chip> : <span className="text-sl-muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3" aria-labelledby="figures-heading">
            <h2 id="figures-heading" className="text-lg font-semibold text-sl-ink">This cohort in figures</h2>
            {figuresLoading ? (
              <SkeletonFigures label="Loading this cohort in figures" count={5} line />
            ) : (
              <p className={`${PANEL} flex flex-wrap gap-x-7 gap-y-2 px-5 py-3.5 text-[15px]`}>
                {figures.map((figure) => (
                  <span key={figure.label}>
                    <span className="text-sl-muted">{figure.label}</span> <span className="font-semibold text-sl-ink">{figure.value}</span>
                  </span>
                ))}
              </p>
            )}
          </section>
        </TabsContent>

        <TabsContent value="quizzes" className="mt-5 space-y-3">
          {quizzesLoading || fileQuizzesLoading ? (
            <>
              <SkeletonCard label="Loading quizzes" lines={1} />
              <SkeletonCard label="Loading quizzes" lines={1} />
            </>
          ) : quizzes.length === 0 && fileQuizzes.length === 0 ? (
            <Empty text="No quizzes in this cohort yet. A Trainer assigns a module quiz on Assessments (on the Trainer desk), and an Admin can on Analytics." />
          ) : (
            <>
              {quizzes.map((quiz: any) => (
                <div key={quiz.id} className={`${PANEL} px-5 py-4`}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-sl-ink">{quiz.title || "Module quiz"}</h3>
                    <Chip tone="neutral">{quiz.status || "ready"}</Chip>
                  </div>
                  <p className="mt-1 text-sm text-sl-muted">{quiz.description || "Module quiz for this cohort"}</p>
                </div>
              ))}
              {fileQuizzes.map((quiz: any) => (
                <div key={quiz.id || quiz.file_id || quiz.deckFileId} className={`${PANEL} px-5 py-4`}>
                  <h3 className="text-base font-semibold text-sl-ink">{quiz.file_name || quiz.fileName || "Slide quiz"}</h3>
                  <p className="mt-1 text-sm text-sl-muted">Questions from the lesson slides</p>
                </div>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="performance" className="mt-5 space-y-3">
          <div className="flex justify-end">
            <a className={`${BTN_SECONDARY} no-underline`} href={`/api/batches/${batchId}/gradebook.csv`} download>
              Download gradebook CSV
            </a>
          </div>
          {progressLoading ? (
            <div className={PANEL}>
              <p className="border-b border-sl-line px-5 py-2.5 text-sm font-medium text-sl-muted">Fellow</p>
              <SkeletonRows label="Loading the gradebook" rows={4} />
            </div>
          ) : progress.length === 0 ? (
            <Empty text="The gradebook fills in as Fellows finish modules and quizzes." />
          ) : (
            <div className={`${PANEL} overflow-x-auto`}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Fellow</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Course %</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Quiz avg</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Quizzes</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {progress.map((row: any) => {
                    const pct = row.overallPercentage || 0;
                    const status = fellowStatus(pct);
                    return (
                      <tr key={row.teacherId || row.id} className="border-t border-sl-line text-sl-ink">
                        <th scope="row" className="px-5 py-3.5 text-left font-semibold">{row.name || row.teacherName}</th>
                        <td className="px-3 py-3.5">{pct}%</td>
                        <td className="px-3 py-3.5">{row.reportCard?.averageScore ?? 0}%</td>
                        <td className="px-3 py-3.5">{row.reportCard?.totalQuizzesTaken ?? 0}</td>
                        <td className="px-5 py-3.5"><Chip tone={status.tone}>{status.label}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="graduates" className="mt-5 space-y-3">
          {certificatesLoading ? (
            <SkeletonCard label="Loading graduates" lines={2} />
          ) : certificates.length === 0 ? (
            <div className={`${PANEL} space-y-3 px-5 py-4`}>
              <h3 className="text-base font-semibold text-sl-ink">No graduates yet</h3>
              <p className="text-sm text-sl-muted">
                Certificates appear after an Admin issues one to a Fellow who has completed the course. Nobody is missing from the system — this cohort simply has not certified anyone.
              </p>
              {progressLoading && <SkeletonBar className="h-4 w-48" />}
              {closeToGraduate.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-sl-ink">Closest to graduating</p>
                  {closeToGraduate.map((row: any) => (
                    <p key={row.teacherId} className="text-sm text-sl-muted">
                      {row.name || row.teacherName} · {row.overallPercentage}%
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : certificates.map((cert: any) => (
            <div key={cert.id} className={`${PANEL} flex items-center justify-between gap-2 px-5 py-4`}>
              <h3 className="text-base font-semibold text-sl-ink">{cert.teacherName || cert.name || "Graduate"}</h3>
              <Chip tone="done">{cert.status || "issued"}</Chip>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="calendar" className="mt-5 space-y-4">
          <div className={`${PANEL} space-y-3 px-5 py-4`}>
            <div>
              <h3 className="text-base font-semibold text-sl-ink">Schedule a session or deadline</h3>
              <p className="text-sm text-sl-muted">Fellows see this on their dashboard calendar.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-title" className={LABEL}>Title</label>
              <input id="event-title" className={FIELD} value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-type" className={LABEL}>Type</label>
              <select id="event-type" className={FIELD} value={eventType} onChange={(e) => setEventType(e.target.value)}>
                <option value="session">Session</option>
                <option value="deadline">Deadline</option>
                <option value="assessment">Assessment</option>
                <option value="general">General</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="event-start" className={LABEL}>Starts</label>
              <input id="event-start" className={FIELD} type="datetime-local" value={eventStart} onChange={(e) => setEventStart(e.target.value)} />
            </div>
            <button type="button" className={BTN_PRIMARY} disabled={!eventTitle.trim() || !eventStart || createEvent.isPending} onClick={() => createEvent.mutate()}>
              Add to calendar
            </button>
          </div>
          {eventsLoading ? (
            <>
              <SkeletonCard label="Loading the calendar" lines={1} />
              <SkeletonCard label="Loading the calendar" lines={1} />
            </>
          ) : events.length === 0 ? (
            <Empty text="Nothing on the calendar yet." />
          ) : events.map((event: any) => (
            <div key={event.id} className={`${PANEL} px-5 py-4`}>
              <h3 className="text-base font-semibold text-sl-ink">{event.title}</h3>
              <p className="mt-1 text-sm text-sl-muted">
                <span className="capitalize">{event.eventType}</span> · {event.startDate ? new Date(event.startDate).toLocaleString() : ""}
              </p>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="work" className="mt-5 space-y-4">
          <div className={`${PANEL} space-y-3 px-5 py-4`}>
            <div>
              <h3 className="text-base font-semibold text-sl-ink">Assign an assessment</h3>
              <p className="text-sm text-sl-muted">Besides quizzes — written assessments with a due date.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="work-title" className={LABEL}>Title</label>
              <input id="work-title" className={FIELD} value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="work-instructions" className={LABEL}>Instructions</label>
              <textarea id="work-instructions" rows={3} className={`${FIELD} resize-y`} value={workInstructions} onChange={(e) => setWorkInstructions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="work-due" className={LABEL}>Due</label>
              <input id="work-due" className={FIELD} type="datetime-local" value={workDue} onChange={(e) => setWorkDue(e.target.value)} />
            </div>
            <fieldset className="space-y-1.5" data-testid="work-audience">
              <legend className={LABEL}>Who sits this</legend>
              <p className="text-xs text-sl-muted">Tick Fellows to give it only to them. Leave every box empty for the whole cohort.</p>
              {teachers.length === 0 ? (
                <p className="text-xs text-sl-muted">No Fellows are in this cohort yet.</p>
              ) : (
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {teachers.map((teacher: any) => (
                    <label key={teacher.id} className="flex items-center gap-2 text-sm text-sl-ink">
                      <input
                        type="checkbox"
                        checked={workAudience.includes(teacher.id)}
                        onChange={(e) => setWorkAudience((ids) => e.target.checked ? [...ids, teacher.id] : ids.filter((id) => id !== teacher.id))}
                        data-testid={`check-work-teacher-${teacher.id}`}
                      />
                      {teacher.name || teacher.email || "Fellow"}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <button type="button" className={BTN_PRIMARY} disabled={!workTitle.trim() || !workInstructions.trim() || createWork.isPending} onClick={() => createWork.mutate()}>
              Assign assessment
            </button>
          </div>
          {assignmentsLoading ? (
            <>
              <SkeletonCard label="Loading assessments" lines={2} />
              <SkeletonCard label="Loading assessments" lines={2} />
            </>
          ) : assessments.length === 0 ? (
            <Empty text="No assessments in this cohort yet." />
          ) : assessments.map((item: any) => (
            <div key={item.id} id={`work-${item.id}`} className={`${PANEL} scroll-mt-20 space-y-3 px-5 py-4`}>
              <div>
                <h3 className="text-base font-semibold text-sl-ink">{item.title}</h3>
                <p className="mt-1 text-sm text-sl-muted">{item.dueDate ? `Due ${new Date(item.dueDate).toLocaleString()}` : "No due date"}</p>
                <p className="text-sm text-sl-muted" data-testid={`work-given-to-${item.id}`}>Given to {audienceLabel(item.audience)}</p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <label htmlFor={`work-deadline-${item.id}`} className={LABEL}>Deadline</label>
                  <input
                    id={`work-deadline-${item.id}`}
                    className={FIELD}
                    type="datetime-local"
                    value={dueDrafts[item.id] ?? deadlineLocalValue(item.dueDate)}
                    onChange={(event) => setDueDrafts((drafts) => ({ ...drafts, [item.id]: event.target.value }))}
                    data-testid={`input-work-deadline-${item.id}`}
                  />
                </div>
                <button
                  type="button"
                  className={BTN_SECONDARY}
                  disabled={saveWorkDue.isPending}
                  onClick={() => {
                    const draft = dueDrafts[item.id] ?? deadlineLocalValue(item.dueDate);
                    const due = parseDeadline(draft);
                    saveWorkDue.mutate({ id: item.id, dueDate: due ? due.toISOString() : null });
                  }}
                  data-testid={`button-save-work-deadline-${item.id}`}
                >
                  Save deadline
                </button>
              </div>
              <button
                type="button"
                className={openWorkId === item.id ? BTN_PRIMARY : BTN_SECONDARY}
                aria-expanded={openWorkId === item.id}
                onClick={() => setOpenWorkId(openWorkId === item.id ? null : item.id)}
              >
                {openWorkId === item.id ? "Hide submissions" : "Mark submissions"}
              </button>
              {openWorkId === item.id && (
                <div className="space-y-4">
                  {submissionsLoading ? (
                    <SkeletonRows label="Loading submissions" rows={2} className="-mx-5" />
                  ) : submissions.length === 0 ? (
                    <p className="text-sm text-sl-muted">Nobody sits this yet.</p>
                  ) : submissions.map((row: any) => {
                    const teacherId = row.teacher_id || row.teacherId;
                    const draft = markDrafts[teacherId] || {
                      score: row.trainer_score ?? row.trainerScore ?? "",
                      comment: row.trainer_comment || row.trainerComment || "",
                    };
                    if (row.submitted === false) {
                      return (
                        <div key={row.id} className="flex items-center justify-between gap-2 border-t border-sl-line pt-3" data-testid={`waiting-${teacherId}`}>
                          <p className="font-medium text-sl-ink">{row.teacher_name}</p>
                          <p className="text-sm text-sl-muted">Not submitted yet</p>
                        </div>
                      );
                    }
                    return (
                      <div key={row.id} className="space-y-2 border-t border-sl-line pt-3">
                        <p className="font-medium text-sl-ink">
                          {row.teacher_name || row.teacherName}
                          {row.submitted_at && <span className="ml-2 text-xs font-normal text-sl-muted">Submitted {new Date(row.submitted_at).toLocaleString()}</span>}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-sl-muted">{row.response}</p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            className={`${FIELD} w-24`}
                            type="number"
                            min={0}
                            max={100}
                            aria-label={`Score for ${row.teacher_name || row.teacherName}`}
                            placeholder="Score"
                            value={draft.score}
                            onChange={(e) => setMarkDrafts((current) => ({
                              ...current,
                              [teacherId]: { ...draft, score: e.target.value },
                            }))}
                          />
                          <input
                            className={`${FIELD} min-w-[180px] flex-1`}
                            aria-label={`Comment for ${row.teacher_name || row.teacherName}`}
                            placeholder="Comment / rubric note"
                            value={draft.comment}
                            onChange={(e) => setMarkDrafts((current) => ({
                              ...current,
                              [teacherId]: { ...draft, comment: e.target.value },
                            }))}
                          />
                          <button
                            type="button"
                            className={BTN_PRIMARY}
                            disabled={markWork.isPending}
                            onClick={() => markWork.mutate({
                              teacherId,
                              trainerScore: String(draft.score),
                              trainerComment: draft.comment,
                            })}
                          >
                            Save mark
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="import" className="mt-5 space-y-3">
          <div className={`${PANEL} space-y-3 px-5 py-4`}>
            <div>
              <h3 className="text-base font-semibold text-sl-ink">Import a roster (CSV)</h3>
              <p className="text-sm text-sl-muted">CSV with name, email, and optional password. Existing emails are enrolled; new Fellows get Teacher123! if password is blank.</p>
            </div>
            <label htmlFor="roster-csv" className="sr-only">Roster CSV</label>
            <textarea id="roster-csv" rows={8} className={`${FIELD} resize-y font-mono text-sm`} value={csvText} onChange={(e) => setCsvText(e.target.value)} />
            <button type="button" className={BTN_PRIMARY} disabled={importCsv.isPending} onClick={() => importCsv.mutate(csvText)}>
              Import roster
            </button>
          </div>
        </TabsContent>

        <TabsContent value="announce" className="mt-5 space-y-4">
          <div className={`${PANEL} space-y-3 px-5 py-4`}>
            <div>
              <h3 className="text-base font-semibold text-sl-ink">Pin a note to this cohort</h3>
              <p className="text-sm text-sl-muted">Every enrolled Fellow gets it in their bell. Email is sent when RESEND_API_KEY is configured.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="announce-title" className={LABEL}>Title</label>
              <input id="announce-title" className={FIELD} value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="announce-message" className={LABEL}>What should they know?</label>
              <textarea id="announce-message" rows={3} className={`${FIELD} resize-y`} value={announceMessage} onChange={(e) => setAnnounceMessage(e.target.value)} />
            </div>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={!announceTitle.trim() || !announceMessage.trim() || announce.isPending}
              onClick={() => announce.mutate()}
            >
              Send to cohort
            </button>
          </div>
          {announcementsLoading ? (
            <>
              <SkeletonCard label="Loading announcements" lines={2} />
              <SkeletonCard label="Loading announcements" lines={2} />
            </>
          ) : announcements.length === 0 ? (
            <Empty text="No announcements sent yet." />
          ) : announcements.map((item: any, index: number) => (
            <div key={`${item.title}-${index}`} className={`${PANEL} space-y-2 px-5 py-4`}>
              <div>
                <h3 className="text-base font-semibold text-sl-ink">{item.title}</h3>
                <p className="mt-1 text-sm text-sl-muted">
                  {item.recipients || 0} Fellows · {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                </p>
              </div>
              <p className="text-sm text-sl-ink">{item.message}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-sl-line bg-sl-surface text-sl-ink">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-sl-ink">Add a Fellow</DialogTitle>
            <DialogDescription className="text-sm text-sl-muted">
              An existing email is enrolled in this cohort. A new email creates the Fellow, with the default password Teacher123!.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="add-fellow-name" className={LABEL}>Name</label>
            <input id="add-fellow-name" className={FIELD} value={addName} onChange={(e) => setAddName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="add-fellow-email" className={LABEL}>Email</label>
            <input id="add-fellow-email" className={FIELD} type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="button" className={BTN_PRIMARY} disabled={!addName.trim() || !addEmail.includes("@") || importCsv.isPending} onClick={addFellow}>
              Add a Fellow
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AcademyShell>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-sm text-sl-muted">{text}</p>;
}
