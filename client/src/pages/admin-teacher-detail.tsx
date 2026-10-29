import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AcademyShell } from "@/components/AcademyShell";
import { deskName } from "@shared/deskName";
import { format } from "date-fns";
import { FELLOW_TYPES, FELLOW_TYPE_LABELS, fellowTypeOf } from "@shared/academyPeople";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AccessDenied,
  Breadcrumb,
  Chip,
  MoreActions,
  ResetPasswordDialog,
  StatusChip,
  cardClass,
  linkClass,
  orderedSteps,
  plural,
  secondaryButton,
  type PathPayload,
  type Tone,
} from "@/components/AdminParts";
import { Loading, SkeletonBar, SkeletonCard, SkeletonHeading, SkeletonRows } from "@/components/Skeletons";

interface TeacherDetail {
  id: string;
  teacherId: number;
  name: string;
  email: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  fellowType?: string;
  lastLogin?: string;
  progress?: number;
  filesViewed?: number;
  courseCompletion?: number;
  completedLessons?: string[];
  activityTimeline?: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
}

type AttendanceRow = {
  id: string;
  cohorts: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  marked: number;
  rate: number | null;
};

type Module = { id: string; weekNumber: number; competencyFocus?: string; deckFiles?: unknown[] | null };
type Certificate = { id: string; courseName?: string; certificateType?: string };

export default function AdminTeacherDetail() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const retype = useMutation({
    mutationFn: async (fellowType: string) => {
      const res = await apiRequest("PATCH", `/api/trainer/fellows/${teacherId}/type`, { fellowType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers", teacherId] });
      toast({ title: "Kind of Fellow saved" });
    },
    onError: (error: Error) => toast({ title: "Could not change the kind", description: error.message, variant: "destructive" }),
  });
  const [, params] = useRoute("/admin/teachers/:id");
  const [resetOpen, setResetOpen] = useState(false);
  const [editing, setEditing] = useState<{ name: string; email: string } | null>(null);

  const teacherId = params?.id;
  const isAdmin = user?.role === "admin";

  // Fetch teacher details
  const { data: teacher, isLoading } = useQuery<TeacherDetail>({
    queryKey: ["/api/admin/teachers", teacherId],
    enabled: !!teacherId,
  });

  // Cohorts, steps and trainers (the read the Cohorts page makes).
  const { data: path } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: isAdmin,
  });
  const { data: attendance } = useQuery<{ teachers: AttendanceRow[] }>({
    queryKey: ["/api/admin/attendance-summary"],
    enabled: isAdmin,
  });
  const { data: certificates } = useQuery<Certificate[]>({
    queryKey: ["/api/teacher", teacherId, "certificates"],
    enabled: !!teacherId && isAdmin,
  });

  // Fetch reflections for this teacher
  const { data: reflections } = useQuery<any[]>({
    queryKey: ["/api/reflections/teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const response = await fetch(`/api/reflections/teacher/${teacherId}`);
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // Fetch trainer comments for this teacher
  const { data: trainerComments } = useQuery<any[]>({
    queryKey: ["/api/trainer/comments/teacher", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const response = await fetch(`/api/trainer/comments/teacher/${teacherId}`);
      if (!response.ok) return [];
      return await response.json();
    },
  });

  // The cohorts this Fellow is ticked into, with the steps they sit on.
  const mine = (path?.cohorts ?? [])
    .map((cohort) => {
      const steps = orderedSteps(cohort);
      const onSteps = steps.flatMap((step, index) => ((step.teachers || []).some((person) => person.id === teacherId) ? [{ step, number: index + 1 }] : []));
      return { cohort, onSteps };
    })
    .filter((row) => row.onSteps.length > 0);
  const courseRows = new Map<string, { id: string; name: string; where: string }>();
  for (const { cohort, onSteps } of mine) {
    for (const { step, number } of onSteps) {
      for (const course of step.courses) {
        if (!courseRows.has(course.id)) courseRows.set(course.id, { id: course.id, name: course.name, where: `${cohort.name} · Step ${number}` });
      }
    }
  }
  const courseList = Array.from(courseRows.values());
  const moduleReads = useQueries({
    queries: courseList.map((course) => ({
      queryKey: ["/api/courses", course.id, "weeks"],
      enabled: isAdmin,
    })),
  });

  const updateTeacherMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/teachers/${teacherId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Fellow updated" });
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers", teacherId] });
    },
    onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/admin/dismiss-teacher/${teacherId}`);
    },
    onSuccess: () => {
      toast({ title: "Fellow removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
      navigate("/admin/teachers");
    },
    onError: (error: Error) => toast({ title: "Remove failed", description: error.message, variant: "destructive" }),
  });

  // Guard: only admins can access this page
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  if (user?.role !== "admin") {
    return <AccessDenied />;
  }

  const shell = (children: React.ReactNode) => (
    <AcademyShell
      title="Silverleaf Academy"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      desk="admin"
      current="people"
    >
      <div className="flex flex-col gap-5">{children}</div>
    </AcademyShell>
  );

  const trail = [
    { label: "People", href: "/admin/people" },
    { label: "Fellows", href: "/admin/teachers", testId: "button-back-teachers" },
  ];

  if (isLoading) {
    return shell(
      <>
        <Breadcrumb trail={trail} current="Fellow" />
        <SkeletonHeading />
        <SkeletonCard label="Loading the Fellow" lines={4} />
        <SkeletonCard label="Loading cohorts and steps" lines={3} />
      </>,
    );
  }

  if (!teacher) {
    return shell(
      <>
        <Breadcrumb trail={trail} current="Fellow" />
        <div className={`${cardClass} p-8 text-center text-sl-muted`}>Fellow not found</div>
      </>,
    );
  }

  const row = attendance?.teachers.find((entry) => entry.id === teacher.id);
  const myCertificates = certificates ?? [];
  const courseStatus = courseList.map((course, index) => {
    const read = moduleReads[index];
    const modules = ((read?.data as Module[] | undefined) ?? []).slice().sort((a, b) => a.weekNumber - b.weekNumber);
    const files = modules.reduce((sum, module) => sum + (module.deckFiles?.length ?? 0), 0);
    const ready = !!read && !read.isLoading && !read.isError;
    const failed = !!read && read.isError;
    let tone: Tone = "neutral";
    let label = failed ? "Could not load" : "";
    if (ready) {
      if (modules.length === 0) label = "No modules yet";
      else if (files === 0) {
        tone = "attention";
        label = "No lesson files yet";
      } else label = "Has lesson files";
    }
    const moduleText = !ready ? "" : modules.length === 0 ? "0" : modules.length === 1 ? `1 · ${modules[0].competencyFocus || "Module 1"}` : String(modules.length);
    return { ...course, ready, failed, modules, files, tone, label, moduleText };
  });
  const noModules = courseStatus.filter((course) => course.ready && course.modules.length === 0);
  const noFiles = courseStatus.filter((course) => course.ready && course.modules.length > 0 && course.files === 0);
  const completable = courseStatus.filter((course) => course.ready && course.files > 0).length;
  const allRead = courseStatus.length > 0 && courseStatus.every((course) => course.ready);
  const blockers = [
    noModules.length > 0 ? `${noModules.length === 1 ? "one has" : `${noModules.length} have`} no modules` : "",
    noFiles.length > 0 ? `${noFiles.map((course) => course.name).join(", ")} ${noFiles.length === 1 ? "has" : "have"} no lesson file` : "",
  ].filter(Boolean);

  return shell(
    <>
      <Breadcrumb trail={trail} current={teacher.name} />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{teacher.name}</h1>
            <StatusChip status={teacher.approvalStatus} />
          </div>
          <p className="text-sm text-sl-muted">Fellow · {FELLOW_TYPE_LABELS[fellowTypeOf(teacher.fellowType)]} · Fellow ID {teacher.teacherId} · {teacher.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-sl-muted">
            Kind
            <select
              className="min-h-11 rounded-lg border border-sl-control bg-sl-surface px-3 text-sm text-sl-ink"
              value={fellowTypeOf(teacher.fellowType)}
              onChange={(event) => retype.mutate(event.target.value)}
              data-testid="select-fellow-type"
            >
              {FELLOW_TYPES.map((type) => <option key={type} value={type}>{FELLOW_TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <button type="button" className={secondaryButton} onClick={() => setResetOpen(true)} data-testid="button-reset-person-password">
            Reset password…
          </button>
          <MoreActions
            testId="button-more-actions"
            actions={[
              { label: "Edit details…", onSelect: () => setEditing({ name: teacher.name, email: teacher.email }), testId: "button-edit-teacher" },
              {
                label: "Remove Fellow…",
                danger: true,
                testId: "button-remove-teacher",
                onSelect: () => {
                  if (window.confirm(`Remove ${teacher.name}?`)) deleteTeacherMutation.mutate();
                },
              },
            ]}
          />
        </div>
      </div>

      <section aria-labelledby="cohorts-and-steps" className={`${cardClass} overflow-hidden`}>
        <h2 id="cohorts-and-steps" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
          Cohorts and steps
          {path && <span className="font-medium text-sl-muted"> · {mine.length}</span>}
        </h2>
        {!path ? (
          <SkeletonRows label="Loading cohorts and steps" rows={2} />
        ) : mine.length === 0 ? (
          <p className="px-5 py-4 text-[15px] text-sl-muted">
            This Fellow is not on any step yet. Tick them on a step under{" "}
            <a href="/admin/batches" className={linkClass} onClick={(event) => { event.preventDefault(); navigate("/admin/batches"); }}>Cohorts</a>.
          </p>
        ) : (
          <ul>
            {mine.map(({ cohort, onSteps }) => {
              const trainerNames = (cohort.trainerIds || []).map((id) => path.trainers.find((trainer) => trainer.id === id)?.username).filter(Boolean);
              const noTrainer = trainerNames.length === 0;
              const emptyNames = onSteps.filter(({ step }) => step.courses.length === 0).map(({ step }) => step.name);
              const emptyOnes = emptyNames.length ? [`${emptyNames.join(" and ")} ${emptyNames.length === 1 ? "has" : "have"} no course`] : [];
              const flag = [noTrainer ? "No trainer" : "", ...emptyOnes].filter(Boolean).join(" · ");
              return (
                <li key={cohort.id} className="flex flex-col gap-2.5 border-b border-sl-line px-5 py-4 last:border-b-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <a
                      href={`/admin/batches?cohort=${cohort.id}`}
                      className={`${linkClass} font-semibold no-underline hover:underline`}
                      onClick={(event) => { event.preventDefault(); navigate(`/admin/batches?cohort=${cohort.id}`); }}
                    >
                      {cohort.name}
                    </a>
                    <span className="text-[13px] text-sl-muted">{noTrainer ? "No trainer" : `Trainers: ${trainerNames.join(", ")}`}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onSteps.map(({ step, number }) => (
                      <span key={step.id} className="rounded-lg border border-sl-line bg-sl-ground px-2.5 py-1 text-[13px] text-sl-ink">
                        Step {number} · {step.name}
                      </span>
                    ))}
                  </div>
                  {flag && <span className="self-start"><Chip tone={noTrainer ? "risk" : "attention"}>{flag}</Chip></span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="course-progress" className={`${cardClass} overflow-hidden`}>
        <h2 id="course-progress" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
          Course progress
          {path && <span className="font-medium text-sl-muted"> · {plural(courseList.length, "course")}</span>}
        </h2>
        {!path ? (
          <SkeletonRows label="Loading course progress" rows={3} />
        ) : courseStatus.length === 0 ? (
          <p className="px-5 py-4 text-[15px] text-sl-muted">No course is placed on this Fellow's steps yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Course</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Modules</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {courseStatus.map((course) => (
                    <tr key={course.id} className="border-t border-sl-line">
                      <th scope="row" className="px-5 py-3 text-left font-medium text-sl-ink">
                        <span className="flex flex-col gap-0.5">
                          <span>{course.name}</span>
                          <span className="text-[13px] font-normal text-sl-muted">{course.where}</span>
                        </span>
                      </th>
                      <td className="px-3 py-3 text-sl-muted">
                        {course.ready || course.failed ? course.moduleText : <SkeletonBar className="h-4 w-24" />}
                      </td>
                      <td className="px-5 py-3">
                        {course.ready || course.failed ? <Chip tone={course.tone}>{course.label}</Chip> : <SkeletonBar className="h-6 w-28 rounded-full" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allRead && (
              <p className="border-t border-sl-line px-5 py-3 text-[13px] leading-relaxed text-sl-muted">
                {completable === 0 && blockers.length > 0 ? `No course can be complete yet: ${blockers.join(", and ")}. ` : ""}
                A course needs at least one lesson file before it can be complete.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="progress-so-far" className={`${cardClass} p-5`}>
        <h2 id="progress-so-far" className="mb-3 text-lg font-semibold text-sl-ink">Progress so far</h2>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-4 text-sm">
          <div><dt className="text-sl-muted">Overall progress</dt><dd className="mt-1 text-[22px] font-semibold text-sl-ink">{teacher.progress || 0}%</dd></div>
          <div><dt className="text-sl-muted">Course completion</dt><dd className="mt-1 text-[22px] font-semibold text-sl-ink">{teacher.courseCompletion || 0}%</dd></div>
          <div><dt className="text-sl-muted">Files viewed</dt><dd className="mt-1 text-[22px] font-semibold text-sl-ink">{teacher.filesViewed || 0}</dd></div>
          <div><dt className="text-sl-muted">Joined</dt><dd className="mt-1 text-[22px] font-semibold text-sl-ink">{format(new Date(teacher.createdAt), "d MMM yyyy")}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-sl-muted">
          {teacher.lastLogin ? `Last active: ${format(new Date(teacher.lastLogin), "PPP p")}` : "Last active is not recorded yet."}
        </p>
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4">
        <section aria-labelledby="person-attendance" className={`${cardClass} flex flex-col gap-2.5 px-5 py-4`}>
          <h2 id="person-attendance" className="text-lg font-semibold text-sl-ink">Attendance</h2>
          {!attendance ? (
            <Loading label="Loading attendance"><SkeletonBar className="h-10 w-full" /></Loading>
          ) : !row || row.marked === 0 ? (
            <p className="text-[15px] text-sl-ink">No marks yet.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[26px] font-semibold text-sl-ink">{row.rate ?? 0}%</span>
                <span className="text-sm text-sl-muted">{row.present} present of {plural(row.marked, "mark")}</span>
              </div>
              <p className="text-sm text-sl-muted">
                {row.late} late · {row.absent} absent · {row.excused} excused{row.cohorts ? ` · in ${row.cohorts}` : ""}
              </p>
            </>
          )}
          <a href="/admin/attendance" className={`${linkClass} w-fit text-sm`} onClick={(event) => { event.preventDefault(); navigate("/admin/attendance"); }}>
            See the marks
          </a>
        </section>

        <section aria-labelledby="person-certificates" className={`${cardClass} flex flex-col gap-2.5 px-5 py-4`}>
          <h2 id="person-certificates" className="text-lg font-semibold text-sl-ink">Certificates</h2>
          {certificates === undefined ? (
            <Loading label="Loading certificates"><SkeletonBar className="h-10 w-full" /></Loading>
          ) : myCertificates.length === 0 ? (
            <p className="text-[15px] text-sl-ink">None issued yet.</p>
          ) : (
            <p className="text-[15px] text-sl-ink">{plural(myCertificates.length, "certificate")} issued.</p>
          )}
          <p className="text-sm leading-relaxed text-sl-muted">
            {path ? `A Fellow finishes the academy path after ${plural(path.cohortsRequired, "cohort")}. ` : ""}
            Fellowship and Advanced Level wait for the path; a course certificate waits for every module.
          </p>
          <a href="/admin/certificates" className={`${linkClass} w-fit text-sm`} onClick={(event) => { event.preventDefault(); navigate("/admin/certificates"); }}>
            Go to Certificates
          </a>
        </section>

        <section aria-labelledby="person-quizzes" className={`${cardClass} flex flex-col gap-2.5 px-5 py-4`}>
          <h2 id="person-quizzes" className="text-lg font-semibold text-sl-ink">Quizzes</h2>
          <p className="text-sm leading-relaxed text-sl-muted">
            Tries and scores are in each cohort room's Gradebook.
          </p>
          {!path && <Loading label="Loading cohorts"><SkeletonBar className="h-4 w-40" /></Loading>}
          <ul className="flex flex-col gap-1 text-sm">
            {mine.map(({ cohort }) => (
              <li key={cohort.id}>
                <a href={`/cohorts/${cohort.id}`} className={linkClass} onClick={(event) => { event.preventDefault(); navigate(`/cohorts/${cohort.id}`); }}>
                  Open {cohort.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Completed Lessons */}
      {teacher.completedLessons && teacher.completedLessons.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Completed Lessons</h2>
          <div className="space-y-2">
            {teacher.completedLessons.map((lesson, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg bg-sl-ground p-3"
                data-testid={`completed-lesson-${idx}`}
              >
                <span className="font-medium text-sl-ink">{lesson}</span>
                <Chip tone="done">Completed</Chip>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity Timeline */}
      {teacher.activityTimeline && teacher.activityTimeline.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Activity Timeline</h2>
          <div className="space-y-3">
            {teacher.activityTimeline.map((activity, idx) => (
              <div
                key={idx}
                className="flex items-start gap-4 rounded-lg bg-sl-ground p-4"
                data-testid={`activity-${idx}`}
              >
                <div className="flex-1">
                  <p className="font-medium capitalize text-sl-ink">{activity.action}</p>
                  {activity.details && <p className="text-sm text-sl-muted">{activity.details}</p>}
                </div>
                <p className="whitespace-nowrap text-sm text-sl-muted">
                  {format(new Date(activity.timestamp), "MMM d, HH:mm")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reflections */}
      {reflections && reflections.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Reflections</h2>
          <div className="space-y-3">
            {reflections.map((reflection: any, idx: number) => (
              <div key={reflection.id || idx} className="rounded-lg bg-sl-ground p-4" data-testid={`reflection-${idx}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {reflection.rating && <Chip>{reflection.rating}/5</Chip>}
                  </div>
                  <p className="text-sm text-sl-muted">
                    {reflection.submittedAt ? format(new Date(reflection.submittedAt), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <p className="text-sm text-sl-ink">{reflection.content}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Trainer Comments */}
      {trainerComments && trainerComments.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Trainer Comments</h2>
          <div className="space-y-3">
            {trainerComments.map((comment: any, idx: number) => (
              <div key={comment.id || idx} className="rounded-lg bg-sl-ground p-4" data-testid={`trainer-comment-${idx}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className="capitalize"><Chip>{comment.category}</Chip></span>
                  <p className="text-sm text-sl-muted">
                    {comment.createdAt ? format(new Date(comment.createdAt), "MMM d, yyyy") : ""}
                  </p>
                </div>
                <p className="text-sm text-sl-ink">{comment.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} personName={teacher.name} identifier={String(teacher.teacherId)} />

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Fellow</DialogTitle>
            <DialogDescription>Update the Fellow's name and email.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                updateTeacherMutation.mutate(editing);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-teacher-name">Name</Label>
                <Input id="edit-teacher-name" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-teacher-email">Email</Label>
                <Input id="edit-teacher-email" type="email" value={editing.email} onChange={(event) => setEditing({ ...editing, email: event.target.value })} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button type="submit" disabled={updateTeacherMutation.isPending}>Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>,
  );
}
