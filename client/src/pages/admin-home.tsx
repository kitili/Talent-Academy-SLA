import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { AcademyShell } from "@/components/AcademyShell";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import {
  AccessDenied,
  Chip,
  PageHeader,
  SkeletonRows,
  cardClass,
  cohortFellows,
  cohortHasTrainer,
  dangerButton,
  emptyStepNumbers,
  linkClass,
  orderedSteps,
  plural,
  primaryButton,
  secondaryButton,
  stepWords,
  type PathPayload,
  type Tone,
} from "@/components/AdminParts";
import { deskName } from "@shared/deskName";
import { ADMIN_TOUR } from "@shared/guidedTour";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";

interface DashboardStats {
  totalTrainers: number;
  totalTeachers: number;
  totalCourses: number;
  activeUsers: number;
  pendingTrainers?: number;
  pendingTeachers?: number;
}

type AttentionRow = {
  key: string;
  tone: Tone;
  chip: string;
  title: string;
  detail: string;
  action: string;
  href: string;
  testId?: string;
};

export default function AdminHome() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Reset password state
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserIdentifier, setResetUserIdentifier] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [freshOpen, setFreshOpen] = useState(false);
  const [freshPhrase, setFreshPhrase] = useState("");
  const [freshAreas, setFreshAreas] = useState<string[]>([]);
  const [freshTeachers, setFreshTeachers] = useState<string[]>([]);
  const [freshTrainers, setFreshTrainers] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const tour = useGuidedTour("sla-tour-admin-v3");

  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
  });

  // Cohorts, steps and who runs them (the read the Cohorts page makes) feed "Needs attention" and the tiles.
  const { data: path, isLoading: pathLoading, isError: pathError } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });
  const { data: attendance } = useQuery<{ teachers: { marked: number; present: number; late: number }[] }>({
    queryKey: ["/api/admin/attendance-summary"],
    enabled: user?.role === "admin",
  });

  // Reset password mutation
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

  const announceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/announce", { title: noticeTitle, message: noticeMessage });
      return res.json();
    },
    onSuccess: (data: { sent?: number }) => {
      toast({ title: "Notice sent", description: `${data.sent || 0} people on the academy desks.` });
      setNoticeOpen(false);
      setNoticeTitle("");
      setNoticeMessage("");
    },
    onError: (error: Error) => toast({ title: "Could not send notice", description: error.message, variant: "destructive" }),
  });

  const { data: freshTrainerList = [] } = useQuery<{ id: string; username: string; email?: string }[]>({
    queryKey: ["/api/admin/trainers"],
    enabled: freshOpen,
  });
  const { data: freshTeacherList = [] } = useQuery<{ id: string; name: string; email?: string }[]>({
    queryKey: ["/api/admin/teachers"],
    enabled: freshOpen,
  });

  useEffect(() => {
    if (tour.open) setFreshOpen(false);
  }, [tour.open]);

  const freshStartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/fresh-start", {
        confirm: freshPhrase.trim(),
        areas: freshAreas,
        teacherIds: freshTeachers,
        trainerIds: freshTrainers,
      });
      return res.json();
    },
    onSuccess: (data: { removedRows?: number; people?: number }) => {
      toast({
        title: "Selected activity cleared",
        description: `${data.removedRows || 0} rows removed for ${data.people || 0} people. Other people stay as they are. Logins are unchanged.`,
      });
      setFreshOpen(false);
      setFreshPhrase("");
      setFreshAreas([]);
      setFreshTeachers([]);
      setFreshTrainers([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
    },
    onError: (error: Error) => toast({ title: "Could not clear activity", description: error.message, variant: "destructive" }),
  });

  const toggleId = (list: string[], id: string, setList: (next: string[]) => void) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };
  const personNeedle = personQuery.trim().toLowerCase();
  const visibleTrainers = freshTrainerList.filter((trainer) =>
    `${trainer.username} ${trainer.email || ""}`.toLowerCase().includes(personNeedle),
  );
  const visibleTeachers = freshTeacherList.filter((teacher) =>
    `${teacher.name} ${teacher.email || ""}`.toLowerCase().includes(personNeedle),
  );
  const freshReady = freshPhrase.trim() === "CLEAR ACTIVITY"
    && freshAreas.length > 0
    && (freshTeachers.length > 0 || freshTrainers.length > 0);

  if (user?.role !== "admin") {
    return (
      <AccessDenied>
        <button type="button" className={`${secondaryButton} mt-6`} onClick={() => navigate("/")}>
          Go home
        </button>
      </AccessDenied>
    );
  }

  const pendingTrainers = stats?.pendingTrainers || 0;
  const pendingFellows = stats?.pendingTeachers || 0;
  const cohorts = path?.cohorts ?? [];

  // One row per thing the Admin can fix, built only from what the server already sends.
  const attention: AttentionRow[] = [];
  if (pendingTrainers + pendingFellows > 0) {
    attention.push({
      key: "approvals",
      tone: "attention",
      chip: "Waiting",
      title: `${plural(pendingTrainers + pendingFellows, "request")} waiting for approval`,
      detail: `${plural(pendingTrainers, "trainer")} and ${plural(pendingFellows, "Fellow")} asked for a desk.`,
      action: "Review approvals",
      href: "/approvals",
      testId: "button-needs-attention",
    });
  }
  for (const cohort of cohorts) {
    if (!cohortHasTrainer(cohort)) {
      const fellows = cohortFellows(cohort).length;
      attention.push({
        key: `trainer-${cohort.id}`,
        tone: "risk",
        chip: "No trainer",
        title: `${cohort.name} has no trainer`,
        detail: `${plural(fellows, "Fellow")} ${fellows === 1 ? "is" : "are"} enrolled. Trainers do not see this cohort until one is assigned.`,
        action: "Assign a trainer",
        href: `/admin/batches?cohort=${cohort.id}`,
      });
    }
    const empty = emptyStepNumbers(cohort);
    if (empty.length > 0) {
      const steps = orderedSteps(cohort);
      const names = empty.map((number) => steps[number - 1].name);
      attention.push({
        key: `steps-${cohort.id}`,
        tone: "attention",
        chip: "Empty steps",
        title: `${cohort.name}: ${stepWords(empty)} ${empty.length === 1 ? "has" : "have"} no course`,
        detail: `${names.slice(0, -1).join(", ")}${names.length > 1 ? ", and " : ""}${names[names.length - 1]} ${names.length === 1 ? "holds" : "hold"} no course yet.`,
        action: "Place a course",
        href: `/admin/batches?cohort=${cohort.id}`,
      });
    }
  }

  const openCohorts = cohorts.filter((cohort) => (cohort.status || "open") !== "closed").length;
  const placedCourses = new Set(cohorts.flatMap((cohort) => cohort.batches.flatMap((step) => step.courses.map((course) => course.id)))).size;
  const marks = (attendance?.teachers || []).reduce((sum, row) => sum + row.marked, 0);
  const attended = (attendance?.teachers || []).reduce((sum, row) => sum + row.present + row.late, 0);
  const pathReady = !pathLoading && !pathError;
  const figures: Array<{ label: string; value: string; note: string; ready: boolean }> = [
    { label: "Fellows", value: String(stats?.totalTeachers ?? 0), note: "approved", ready: !isLoading },
    { label: "Trainers", value: String(stats?.totalTrainers ?? 0), note: "approved", ready: !isLoading },
    { label: "Open cohorts", value: String(openCohorts), note: `${cohorts.length - openCohorts} closed`, ready: pathReady },
    { label: "Courses", value: String(stats?.totalCourses ?? 0), note: `${placedCourses} on cohorts`, ready: !isLoading && pathReady },
    {
      label: "Attendance",
      value: marks ? `${Math.round((attended / marks) * 100)}%` : "None yet",
      note: marks ? plural(marks, "mark") : "No marks yet",
      ready: attendance !== undefined,
    },
  ];

  return (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      showAdminNav
      desk="admin"
      current="home"
      onLogout={() => logoutMutation.mutate()}
      actions={
        <TourButton onClick={tour.replay} testId="button-admin-tour" tone="light" tourId="admin-tour" />
      }
    >
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Home"
          detail={format(new Date(), "EEEE d MMMM")}
          actions={
            <button type="button" className={primaryButton} onClick={() => navigate("/admin/batches?add=1")} data-testid="button-home-add-cohort">
              Add a cohort
            </button>
          }
        />

        <section aria-labelledby="needs-attention" className={`${cardClass} overflow-hidden`} data-tour="admin-pictures">
          <h2 id="needs-attention" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
            Needs attention
            {pathReady && !isLoading && <span className="font-medium text-sl-muted"> · {attention.length}</span>}
          </h2>
          {pathLoading || isLoading ? (
            <SkeletonRows />
          ) : (
            <>
              {pathError && (
                <p className="border-b border-sl-line px-5 py-4 text-sm text-sl-muted">
                  The cohorts did not load, so the cohort checks are not shown. Refresh the page to try again.
                </p>
              )}
              {attention.length === 0 && pathReady && (
                <p className="border-b border-sl-line px-5 py-4 text-[15px] text-sl-muted">
                  Nothing needs attention. Every cohort has a trainer and a course on each step.
                </p>
              )}
              <ul>
                {attention.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-line px-5 py-4">
                    <div className="flex min-w-0 flex-1 basis-80 items-start gap-3">
                      <Chip tone={item.tone}>{item.chip}</Chip>
                      <div className="min-w-0">
                        <p className="font-semibold text-sl-ink">{item.title}</p>
                        <p className="text-sm text-sl-muted">{item.detail}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`${secondaryButton} font-medium text-sl-accent`}
                      onClick={() => navigate(item.href)}
                      data-testid={item.testId}
                    >
                      {item.action}
                    </button>
                  </li>
                ))}
              </ul>
              {pendingTrainers + pendingFellows === 0 && (
                <p className="px-5 py-4 text-sm text-sl-muted">Approvals: nobody is waiting.</p>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="academy-glance" className="flex flex-col gap-3" data-tour="admin-stats">
          <h2 id="academy-glance" className="text-lg font-semibold text-sl-ink">The academy at a glance</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
            {figures.map((figure) => (
              <div key={figure.label} className={`${cardClass} p-4`}>
                <p className="text-sm text-sl-muted">{figure.label}</p>
                {figure.ready ? (
                  <>
                    <p className="mt-1 text-[28px] font-semibold leading-tight text-sl-ink">{figure.value}</p>
                    <p className="mt-1 text-sm text-sl-muted">{figure.note}</p>
                  </>
                ) : (
                  <div className="mt-2 h-14 animate-pulse rounded bg-sl-neutral-soft" aria-busy="true" />
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section aria-labelledby="home-tools" className={`${cardClass} flex flex-col gap-4 p-5`}>
            <h2 id="home-tools" className="text-lg font-semibold text-sl-ink">Tools</h2>
            <div className="flex flex-wrap gap-2">
              <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={secondaryButton} data-testid="button-academy-notice" data-tour="admin-notice">
                    Send an academy notice
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send an academy notice</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="notice-title">Title</Label>
                      <Input id="notice-title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Step 3 starts Monday" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notice-message">Message</Label>
                      <Input id="notice-message" value={noticeMessage} onChange={(e) => setNoticeMessage(e.target.value)} placeholder="Trainers and Fellows will see this on their desk." />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setNoticeOpen(false)}>Cancel</Button>
                    <Button
                      onClick={() => announceMutation.mutate()}
                      disabled={announceMutation.isPending || !noticeTitle.trim() || !noticeMessage.trim()}
                    >
                      Send
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
                <DialogTrigger asChild>
                  <button type="button" className={secondaryButton} data-testid="button-reset-password" data-tour="admin-password">
                    Reset a password
                  </button>
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
            </div>
            <a href="/api/admin/approval-history?format=csv" className={`${linkClass} w-fit`} data-testid="link-export-approval-history">
              Export approval history
            </a>
          </section>

          <section aria-labelledby="home-fresh" className="flex flex-col gap-3 rounded-xl border border-sl-risk bg-sl-surface p-5" data-tour="admin-fresh">
            <h2 id="home-fresh" className="text-lg font-semibold text-sl-ink">Start fresh</h2>
            <p className="text-[15px] text-sl-muted">
              Clears cohorts, progress, quizzes, certificates or notices for the people you choose.
              It does not clear the whole academy. Logins and courses stay. You type CLEAR ACTIVITY to confirm.
            </p>
            <Dialog open={freshOpen && !tour.open} onOpenChange={setFreshOpen}>
              <DialogTrigger asChild>
                <button type="button" className={`${dangerButton} w-fit`} data-testid="button-fresh-start" disabled={tour.open}>
                  Clear previous activity…
                </button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Clear previous activity</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Tick each area on its own, then tick the trainers or Fellows it applies to.
                    Everyone else keeps their work. Type CLEAR ACTIVITY to confirm.
                  </p>
                  <div className="space-y-2">
                    <Label>Areas</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ["cohorts", "Cohorts"],
                        ["progress", "Progress"],
                        ["quizzes", "Quizzes"],
                        ["certificates", "Certificates"],
                        ["notices", "Notices"],
                      ].map(([id, label]) => (
                        <label key={id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={freshAreas.includes(id)}
                            onCheckedChange={() => toggleId(freshAreas, id, setFreshAreas)}
                            data-testid={`check-area-${id}`}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person-query">People</Label>
                    <Input
                      id="person-query"
                      value={personQuery}
                      onChange={(e) => setPersonQuery(e.target.value)}
                      placeholder="Find a trainer or Fellow"
                      data-testid="input-fresh-person"
                    />
                    <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
                      {visibleTrainers.map((trainer) => (
                        <label key={trainer.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={freshTrainers.includes(trainer.id)}
                            onCheckedChange={() => toggleId(freshTrainers, trainer.id, setFreshTrainers)}
                            data-testid={`check-trainer-${trainer.id}`}
                          />
                          <span>{trainer.username} <span className="text-muted-foreground">trainer</span></span>
                        </label>
                      ))}
                      {visibleTeachers.map((teacher) => (
                        <label key={teacher.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={freshTeachers.includes(teacher.id)}
                            onCheckedChange={() => toggleId(freshTeachers, teacher.id, setFreshTeachers)}
                            data-testid={`check-teacher-${teacher.id}`}
                          />
                          <span>{teacher.name} <span className="text-muted-foreground">Fellow</span></span>
                        </label>
                      ))}
                      {visibleTrainers.length + visibleTeachers.length === 0 && (
                        <p className="text-sm text-muted-foreground">No matching people.</p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fresh-phrase">Confirmation</Label>
                    <Input
                      id="fresh-phrase"
                      value={freshPhrase}
                      onChange={(e) => setFreshPhrase(e.target.value)}
                      placeholder="CLEAR ACTIVITY"
                      data-testid="input-fresh-phrase"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFreshOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    data-testid="button-confirm-fresh-start"
                    disabled={freshStartMutation.isPending || !freshReady}
                    onClick={() => freshStartMutation.mutate()}
                  >
                    Clear activity
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </section>
        </div>
      </div>
      <GuidedTour
        open={tour.open}
        steps={ADMIN_TOUR}
        index={tour.index}
        onIndex={tour.setIndex}
        onClose={tour.close}
      />
    </AcademyShell>
  );
}
