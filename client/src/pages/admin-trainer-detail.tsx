import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { AcademyShell } from "@/components/AcademyShell";
import { deskName } from "@shared/deskName";
import { format } from "date-fns";
import {
  AccessDenied,
  Breadcrumb,
  Chip,
  ResetPasswordDialog,
  SkeletonRows,
  StatusChip,
  cardClass,
  cohortFellows,
  emptyStepNumbers,
  linkClass,
  orderedSteps,
  plural,
  secondaryButton,
  stepWords,
  type PathPayload,
} from "@/components/AdminParts";

interface TrainerDetail {
  id: string;
  username: string;
  email?: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  cohortCount?: number;
  completedLessons?: string[];
  activityTimeline?: Array<{
    action: string;
    timestamp: string;
    details?: string;
  }>;
  assignedTeachers?: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export default function AdminTrainerDetail() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/trainers/:id");
  const [resetOpen, setResetOpen] = useState(false);

  const trainerId = params?.id;

  // Fetch trainer details
  const { data: trainer, isLoading } = useQuery<TrainerDetail>({
    queryKey: ["/api/admin/trainers", trainerId],
    enabled: !!trainerId,
  });
  // Cohorts, steps and Fellows (the read the Cohorts page makes).
  const { data: path } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
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
    { label: "Trainers", href: "/admin/trainers", testId: "button-back-trainers" },
  ];

  if (isLoading) {
    return shell(
      <>
        <Breadcrumb trail={trail} current="Trainer" />
        <div className={cardClass}><SkeletonRows rows={4} /></div>
      </>,
    );
  }

  if (!trainer) {
    return shell(
      <>
        <Breadcrumb trail={trail} current="Trainer" />
        <div className={`${cardClass} p-8 text-center text-sl-muted`}>Trainer not found</div>
      </>,
    );
  }

  const running = (path?.cohorts ?? []).filter((cohort) => (cohort.trainerIds || []).includes(trainer.id));

  return shell(
    <>
      <Breadcrumb trail={trail} current={trainer.username} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[28px] font-semibold leading-tight text-sl-ink">{trainer.username}</h1>
            <StatusChip status={trainer.approvalStatus} />
          </div>
          <p className="text-sm text-sl-muted">
            Trainer · {trainer.email || "No email"} · Joined {format(new Date(trainer.createdAt), "d MMM yyyy")} ·{" "}
            {trainer.lastLogin ? `Last active ${format(new Date(trainer.lastLogin), "PPP p")}` : "Last active not recorded"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryButton} onClick={() => setResetOpen(true)} data-testid="button-reset-person-password">
            Reset password…
          </button>
        </div>
      </div>

      <section aria-labelledby="cohorts-and-steps" className={`${cardClass} overflow-hidden`}>
        <h2 id="cohorts-and-steps" className="border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
          Cohorts and steps
          {path && <span className="font-medium text-sl-muted"> · {running.length}</span>}
        </h2>
        {!path ? (
          <SkeletonRows rows={2} />
        ) : running.length === 0 ? (
          <p className="px-5 py-4 text-[15px] text-sl-muted">
            This trainer runs no cohort yet. Assign them under{" "}
            <a href="/admin/batches" className={linkClass} onClick={(event) => { event.preventDefault(); navigate("/admin/batches"); }}>Cohorts</a>.
          </p>
        ) : (
          <ul>
            {running.map((cohort) => {
              const steps = orderedSteps(cohort);
              const empty = emptyStepNumbers(cohort);
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
                    <span className="text-[13px] text-sl-muted">{plural(cohortFellows(cohort).length, "Fellow")}</span>
                  </div>
                  {steps.length === 0 ? (
                    <span className="self-start"><Chip>No steps yet</Chip></span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {steps.map((step, index) => (
                        <span key={step.id} className="rounded-lg border border-sl-line bg-sl-ground px-2.5 py-1 text-[13px] text-sl-ink">
                          Step {index + 1} · {step.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {empty.length > 0 && <span className="self-start"><Chip tone="attention">{stepWords(empty)} {empty.length === 1 ? "has" : "have"} no course</Chip></span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Completed Lessons */}
      {trainer.completedLessons && trainer.completedLessons.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Completed Lessons</h2>
          <div className="space-y-2">
            {trainer.completedLessons.map((lesson, idx) => (
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
      {trainer.activityTimeline && trainer.activityTimeline.length > 0 && (
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-3 text-lg font-semibold text-sl-ink">Activity Timeline</h2>
          <div className="space-y-3">
            {trainer.activityTimeline.map((activity, idx) => (
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

      <ResetPasswordDialog open={resetOpen} onOpenChange={setResetOpen} personName={trainer.username} identifier={trainer.username} />
    </>,
  );
}
