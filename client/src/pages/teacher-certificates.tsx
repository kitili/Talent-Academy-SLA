import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { AcademyShell } from "@/components/AcademyShell";
import { SilverleafCertificate } from "@/components/SilverleafCertificate";
import { Award } from "lucide-react";

type AcademyPath = {
  cohortsRequired: number;
  cohortsCompleted: number;
  done?: boolean;
  cohorts?: Array<{ id: string; name: string }>;
};

/** "A and B", "A, B and C". */
function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function certificateKindLabel(cert: any) {
  if (cert.design === "advanced" || cert.kind === "distinction") return "Advanced Level";
  if (cert.kind === "course") return "Course completion";
  return "Graduation";
}

const SECTION = "rounded-xl border border-sl-line bg-sl-surface";

export default function TeacherCertificates() {
  const { user, logoutMutation } = useAuth();

  const { data: me } = useQuery<any>({ queryKey: ["/api/teacher/me"] });
  const teacherId = user?.id || me?.id;
  const { data: certificates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/teacher", teacherId, "certificates"],
    enabled: Boolean(teacherId),
  });
  const { data: path } = useQuery<AcademyPath>({
    queryKey: ["/api/teacher/academy-path"],
    enabled: Boolean(teacherId) && user?.role === "teacher",
  });

  if (!user || user.role !== "teacher") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sl-ground">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-semibold text-sl-ink">Access Denied</h1>
          <p className="text-sl-muted">This page is for Fellows only.</p>
        </div>
      </div>
    );
  }

  const required = path?.cohortsRequired ?? 0;
  const completed = Math.min(path?.cohortsCompleted ?? 0, required);
  const cohortNames = (path?.cohorts ?? []).map((cohort) => cohort.name);

  return (
    <AcademyShell
      title="Certificates"
      userLabel={user.username}
      onLogout={() => logoutMutation.mutate()}
      desk="fellow"
      current="certificates"
    >
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-semibold text-sl-ink">Certificates</h1>
        <span className="text-sm text-sl-muted">Certificates your Admin has issued to you.</span>
      </div>

      <section aria-labelledby="yours" className={`${SECTION} overflow-hidden`}>
        <h2 id="yours" className="m-0 border-b border-sl-line px-5 py-4 text-lg font-semibold text-sl-ink">
          Your certificates
        </h2>
        {isLoading ? (
          <div className="flex flex-col gap-2.5 px-5 py-[18px]" aria-busy="true">
            <div className="h-3 w-1/3 rounded bg-sl-neutral-soft" />
            <div className="h-3 w-2/3 rounded bg-sl-neutral-soft" />
          </div>
        ) : certificates.length === 0 ? (
          <div className="flex flex-col gap-1.5 px-5 py-[18px]">
            <p className="m-0 text-[15px] font-medium text-sl-ink">No certificates yet.</p>
            <p className="m-0 max-w-[640px] text-sm leading-normal text-sl-muted">
              A course certificate after every module of a course is complete; the Fellowship certificate after you finish{" "}
              {required > 0 ? `${required} cohorts` : "the cohorts your academy asks for"}. Your Admin issues them.
            </p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-5">
            {certificates.map((cert) => (
              <li key={cert.id} className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sl-line px-[18px] py-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-[10px] bg-sl-accent-soft">
                      <Award className="h-[22px] w-[22px] text-sl-accent" />
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="m-0 text-base font-semibold text-sl-ink">{cert.courseName}</h3>
                      <span className="text-sm text-sl-muted">
                        {certificateKindLabel(cert)} · Issued {new Date(cert.generatedAt).toLocaleDateString()} by Silverleaf Academy
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <Link
                      href={`/teacher/certificates/${cert.id}`}
                      className="inline-flex min-h-[44px] items-center rounded-lg border border-sl-control bg-sl-surface px-4 text-[15px] text-sl-ink no-underline"
                      data-testid={`button-view-cert-${cert.id}`}
                    >
                      View
                    </Link>
                    <Link
                      href={`/teacher/certificates/${cert.id}?print=1`}
                      className="inline-flex min-h-[44px] items-center rounded-lg bg-sl-accent-strong px-4 text-[15px] font-semibold text-white no-underline"
                      data-testid={`button-download-cert-${cert.id}`}
                    >
                      Download PDF
                    </Link>
                  </div>
                </div>
                <div className="max-w-[560px]" role="img" aria-label={`Your ${certificateKindLabel(cert).toLowerCase()} certificate for ${cert.courseName}`}>
                  <SilverleafCertificate
                    design={cert.design}
                    kind={cert.kind}
                    name={cert.teacherName}
                    body={cert.appreciationText}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {path && (
        <section aria-labelledby="path" className={`${SECTION} flex flex-col gap-3 px-5 py-[18px]`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="path" className="m-0 text-lg font-semibold text-sl-ink">Academy path</h2>
            <span className="text-[15px] font-semibold text-sl-ink">{completed} of {required} cohorts finished</span>
          </div>
          <div
            role="progressbar"
            aria-label="Academy path"
            aria-valuemin={0}
            aria-valuemax={required}
            aria-valuenow={completed}
            className="flex gap-1.5"
          >
            {Array.from({ length: required }, (_, index) => (
              <span key={index} className={`h-2 flex-1 rounded ${index < completed ? "bg-sl-done" : "bg-sl-neutral-soft"}`} />
            ))}
          </div>
          <span className="text-sm text-sl-muted">
            {cohortNames.length > 0 ? `In ${listNames(cohortNames)}. ` : "You are not in a cohort yet. An admin places you in one. "}
            Your course progress is on{" "}
            <Link href="/teacher/dashboard?tab=progress" className="text-sl-accent underline">Progress</Link>.
          </span>
        </section>
      )}
    </AcademyShell>
  );
}
