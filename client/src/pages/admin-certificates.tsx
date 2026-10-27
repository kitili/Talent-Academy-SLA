import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AcademyShell } from "@/components/AcademyShell";
import { SilverleafCertificate } from "@/components/SilverleafCertificate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SkeletonRows } from "@/components/Skeletons";
import {
  CERTIFICATE_DESIGNS,
  CERTIFICATE_SIGNERS,
  designFromCertificate,
  wordingForIssue,
  type CertificateDesignId,
  type CertificateOccasion,
} from "@shared/certificateDesigns";

type Teacher = { id: string; name: string; email?: string | null; approvalStatus?: string };
type Course = { id: string; name: string };
/** One Fellow as `GET /api/admin/certificates/eligible` computes it: the same rules the issue route refuses by (D4). */
type EligibleFellow = {
  teacherId: string;
  name: string;
  path: { done: boolean; cohortsCompleted: number; cohortsRequired: number };
  courses: Array<{ courseId: string; courseName: string; doneModules: number; totalModules: number; complete: boolean }>;
};
type Issued = {
  id: string;
  teacherName: string;
  courseName: string;
  design?: string | null;
  kind?: string | null;
  appreciationText: string;
  generatedAt: string;
};

const PRINT_CSS = `
@media print {
  @page { size: landscape; margin: 0; }
  body * { visibility: hidden !important; }
  #certificate-print, #certificate-print * { visibility: visible !important; }
  #certificate-print { position: fixed; inset: 0; width: 100vw; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;

/** Issue through the server; a refusal comes back as `{ error, code }` and its sentence is what the admin reads. */
async function issueCertificate(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/certificates/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Could not issue the certificate (${res.status})`);
  return data;
}

const FIELD_TRIGGER = "min-h-11 border-sl-control bg-sl-surface text-[15px] text-sl-ink";
const PRIMARY_BUTTON = "min-h-11 bg-sl-accent-strong px-5 text-[15px] font-semibold text-white hover:bg-sl-accent-strong/90";

/** What the Issued list calls a certificate: the board's three kinds. */
function kindLabel(cert: { design?: string | null; kind?: string | null }) {
  if (cert.kind === "course") return "Course certificate";
  return designFromCertificate(cert) === "advanced" ? "Advanced Level" : "Fellowship";
}

function issuedDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminCertificates() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [design, setDesign] = useState<CertificateDesignId>("fellowship");
  const [occasion, setOccasion] = useState<CertificateOccasion>("graduation");
  const [teacherId, setTeacherId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [refusalText, setRefusalText] = useState("");

  const { data: teachers = [] } = useQuery<Teacher[]>({ queryKey: ["/api/admin/teachers"] });
  const { data: courses = [] } = useQuery<Course[]>({ queryKey: ["/api/courses"] });
  const { data: issued = [], isLoading: issuedLoading } = useQuery<Issued[]>({ queryKey: ["/api/admin/certificates"] });
  const { data: eligible, isError: eligibilityFailed } = useQuery<EligibleFellow[]>({ queryKey: ["/api/admin/certificates/eligible"] });

  const activeTeachers = teachers.filter((teacher) => teacher.approvalStatus !== "inactive");
  const teacher = activeTeachers.find((row) => row.id === teacherId);
  const course = courses.find((row) => row.id === courseId);
  const fellowStatus = eligible?.find((row) => row.teacherId === teacherId);
  const courseStatus = fellowStatus?.courses.find((row) => row.courseId === courseId);
  const courseChoices = fellowStatus
    ? fellowStatus.courses.map((row) => ({ id: row.courseId, name: row.courseName, status: row }))
    : courses.map((row) => ({ id: row.id, name: row.name, status: undefined }));
  const readyForGraduation = (eligible ?? []).filter((row) => row.path.done);
  const readyForCourse = (eligible ?? []).flatMap((row) =>
    row.courses.filter((item) => item.complete).map((item) => ({ fellow: row, course: item })));
  // Why a Fellow is not ready, from the same eligible list the ready rows come from.
  const notReady = (eligible ?? []).flatMap((row) => {
    const reasons: Array<{ key: string; who: string; why: string }> = [];
    if (!row.path.done) {
      reasons.push({
        key: `path-${row.teacherId}`,
        who: `${row.name} · Fellowship or Advanced Level`,
        why: `Academy path: ${row.path.cohortsCompleted} of ${row.path.cohortsRequired} cohorts completed`,
      });
    }
    if (!row.courses.some((item) => item.complete)) {
      reasons.push({ key: `course-${row.teacherId}`, who: `${row.name} · course certificates`, why: "No course is complete yet" });
    }
    return reasons;
  });
  const nothingReady = readyForGraduation.length === 0 && readyForCourse.length === 0;
  const selectionEligible = occasion === "graduation" ? fellowStatus?.path.done === true : courseStatus?.complete === true;
  const selectionStatus = !teacherId || !fellowStatus
    ? ""
    : occasion === "graduation"
      ? `${fellowStatus.path.cohortsCompleted} of ${fellowStatus.path.cohortsRequired} cohorts on the academy path done. ${fellowStatus.path.done ? "Ready for Fellowship or Advanced." : "Not ready for Fellowship or Advanced yet."}`
      : courseStatus
        ? `${courseStatus.doneModules} of ${courseStatus.totalModules} modules complete. ${courseStatus.complete ? "Ready for a course certificate." : "Not ready: every module must be complete."}`
        : "";
  const choose = (nextTeacherId: string, nextOccasion: CertificateOccasion, nextCourseId = "") => {
    setTeacherId(nextTeacherId);
    setOccasion(nextOccasion);
    setCourseId(nextCourseId);
    setRefusalText("");
  };
  /** A ready row fills the form below and brings it into view; issuing is still the button there. */
  const chooseAndShow = (nextTeacherId: string, nextOccasion: CertificateOccasion, nextCourseId = "") => {
    choose(nextTeacherId, nextOccasion, nextCourseId);
    document.getElementById("issue")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const previewName = teacher?.name || "";
  const previewBody = useMemo(
    () => wordingForIssue(design, occasion, occasion === "course" ? course?.name : undefined),
    [design, occasion, course?.name],
  );

  const issueMutation = useMutation({
    mutationFn: () =>
      issueCertificate({
        teacherId,
        design,
        occasion,
        courseId: occasion === "course" ? courseId : undefined,
      }),
    onSuccess: () => {
      setRefusalText("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/certificates"] });
      toast({ title: "Certificate issued" });
    },
    onError: (error: Error) => {
      setRefusalText(error.message);
      toast({ title: "Could not issue certificate", description: error.message, variant: "destructive" });
    },
  });

  if (user && user.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-sl-muted">Only an admin can issue Silverleaf certificates.</p>
      </div>
    );
  }

  const canIssue = Boolean(teacherId) && (occasion === "graduation" || Boolean(courseId));
  const cardClass = (on: boolean) =>
    `flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[15px] text-sl-ink ${on ? "border-sl-accent bg-sl-accent-soft" : "border-sl-control bg-sl-surface"}`;
  // Course certificate keeps whichever template was last chosen; Fellowship and Advanced Level choose the template.
  const kinds = [
    { value: "course", label: "Course certificate", on: occasion === "course", pick: () => choose(teacherId, "course"), testId: "radio-certificate-kind-course" },
    ...(Object.keys(CERTIFICATE_DESIGNS) as CertificateDesignId[]).map((id) => ({
      value: id,
      label: CERTIFICATE_DESIGNS[id].label,
      on: occasion === "graduation" && design === id,
      pick: () => { setDesign(id); choose(teacherId, "graduation"); },
      testId: `button-template-${id}`,
    })),
  ];

  return (
    <AcademyShell
      title="Certificates"
      subtitle="Official Silverleaf templates"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      desk="admin"
      current="certificates"
      scene="paper"
    >
      <style>{PRINT_CSS}</style>
      <div className="flex max-w-[1120px] flex-col gap-6" data-testid="admin-certificates">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-semibold text-sl-ink">Certificates</h1>
          <p className="text-sm leading-relaxed text-sl-muted">
            Issued by hand. The server checks each one: a course certificate needs every module complete; Fellowship and Advanced Level need the academy path done.
          </p>
        </div>

        <section aria-labelledby="ready" className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface" data-testid="certificate-eligible">
          <div className="flex flex-col gap-1 border-b border-sl-line px-5 py-4">
            <h2 id="ready" className="text-lg font-semibold text-sl-ink">Who is ready</h2>
            <span className="text-sm text-sl-muted">Worked out by the server from each Fellow's progress.</span>
          </div>
          {eligibilityFailed ? (
            <p className="px-5 py-4 text-sm text-sl-muted">Could not load who is ready. You can still issue; the server checks each certificate.</p>
          ) : !eligible ? (
            <SkeletonRows label="Working out who is ready" rows={3} />
          ) : (
            <>
              {eligible.length === 0 ? (
                <p className="px-5 py-4 text-sm text-sl-muted">No approved Fellow is on the list yet.</p>
              ) : (
                nothingReady && <p className="px-5 pb-1 pt-3.5 text-[15px] font-semibold text-sl-ink">Nobody is ready yet.</p>
              )}
              <ul>
                {readyForGraduation.map((row) => (
                  <li key={`path-${row.teacherId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-sl-neutral-soft px-5 py-3">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-sl-ink">{row.name} · Fellowship or Advanced Level</span>
                      <span className="text-sm text-sl-muted">Academy path done</span>
                    </span>
                    <Button
                      type="button"
                      className={PRIMARY_BUTTON}
                      onClick={() => chooseAndShow(row.teacherId, "graduation")}
                      data-testid={`button-choose-graduation-${row.teacherId}`}
                    >
                      Issue…
                    </Button>
                  </li>
                ))}
                {readyForCourse.map(({ fellow, course: item }) => (
                  <li key={`course-${fellow.teacherId}-${item.courseId}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-sl-neutral-soft px-5 py-3">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[15px] font-semibold text-sl-ink">{fellow.name} · course certificate</span>
                      <span className="text-sm text-sl-muted">{item.courseName}: every module complete</span>
                    </span>
                    <Button
                      type="button"
                      className={PRIMARY_BUTTON}
                      onClick={() => chooseAndShow(fellow.teacherId, "course", item.courseId)}
                      data-testid={`button-choose-course-${fellow.teacherId}-${item.courseId}`}
                    >
                      Issue…
                    </Button>
                  </li>
                ))}
                {notReady.slice(0, 6).map((row) => (
                  <li key={row.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-sl-neutral-soft px-5 py-3">
                    <span className="text-[15px] text-sl-ink">{row.who}</span>
                    <span className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm text-sl-muted">{row.why}</span>
                      <span className="rounded-full bg-sl-neutral-soft px-2.5 py-0.5 text-xs font-semibold text-sl-neutral">Not ready</span>
                    </span>
                  </li>
                ))}
              </ul>
              {notReady.length > 6 && <p className="px-5 py-3 text-[13px] text-sl-muted">{notReady.length - 6} more are not ready yet.</p>}
            </>
          )}
        </section>

        <section id="issue" aria-labelledby="issue-heading" className="flex scroll-mt-4 flex-col gap-5 rounded-xl border border-sl-line bg-sl-surface p-5">
          <h2 id="issue-heading" className="text-lg font-semibold text-sl-ink">Issue a certificate</h2>
          <div className="flex flex-wrap items-start gap-6">
            <form
              aria-labelledby="issue-heading"
              className="flex min-w-0 flex-[1_1_300px] flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (canIssue && !issueMutation.isPending) issueMutation.mutate();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label>Fellow</Label>
                <Select value={teacherId} onValueChange={(value) => choose(value, occasion)}>
                  <SelectTrigger className={FIELD_TRIGGER} data-testid="select-certificate-teacher" aria-label="Fellow">
                    <SelectValue placeholder="Choose a Fellow" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTeachers.map((row) => (
                      <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[13px] text-sl-muted">The name stays blank on the template until you choose someone.</span>
              </div>

              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" data-testid="select-certificate-occasion">
                <legend className="mb-2 p-0 text-sm font-semibold text-sl-ink">Kind</legend>
                {kinds.map((item) => (
                  <label key={item.value} htmlFor={`kind-${item.value}`} className={cardClass(item.on)}>
                    <input
                      id={`kind-${item.value}`}
                      type="radio"
                      name="cert-kind"
                      value={item.value}
                      checked={item.on}
                      onChange={item.pick}
                      className="m-0 h-[18px] w-[18px] accent-[rgb(var(--sl-accent-strong))]"
                      data-testid={item.testId}
                    />
                    {item.label}
                  </label>
                ))}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <Label>Course</Label>
                <Select value={courseId} onValueChange={(value) => choose(teacherId, "course", value)} disabled={occasion !== "course"}>
                  <SelectTrigger className={FIELD_TRIGGER} data-testid="select-certificate-course" aria-label="Course">
                    <SelectValue placeholder="Choose a course" />
                  </SelectTrigger>
                  <SelectContent>
                    {courseChoices.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                        {row.status ? ` (${row.status.doneModules} of ${row.status.totalModules} modules)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[13px] text-sl-muted">Only for a course certificate.</span>
              </div>

              {selectionStatus && (
                <p className={`text-sm ${selectionEligible ? "text-sl-done" : "text-sl-muted"}`} data-testid="text-certificate-eligibility">
                  {selectionStatus}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" className={PRIMARY_BUTTON} disabled={!canIssue || issueMutation.isPending} data-testid="button-issue-certificate">
                  Issue certificate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 border-sl-control bg-sl-surface px-5 text-[15px] text-sl-ink"
                  onClick={() => window.print()}
                  disabled={!canIssue || !selectionEligible}
                  data-testid="button-print-certificate"
                >
                  Print / save PDF
                </Button>
              </div>
              {refusalText && (
                <div className="flex items-start gap-3 rounded-lg border border-sl-risk/30 bg-sl-risk-soft px-4 py-3.5" role="alert">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-none text-sl-risk">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v6" />
                    <path d="M12 16.5v.5" />
                  </svg>
                  <div className="flex flex-col gap-1">
                    <span className="text-[15px] font-semibold text-sl-risk">Not issued</span>
                    <span className="text-sm leading-relaxed text-sl-ink" data-testid="text-certificate-refusal">{refusalText}</span>
                  </div>
                </div>
              )}
            </form>

            <figure aria-labelledby="preview-label" className="m-0 flex min-w-0 flex-[1_1_380px] flex-col gap-2">
              <figcaption id="preview-label" className="text-[13px] font-semibold text-sl-muted">
                Preview · {occasion === "course" ? "course certificate" : `${CERTIFICATE_DESIGNS[design].label} certificate`}, on the {CERTIFICATE_DESIGNS[design].label} template
              </figcaption>
              <div id="certificate-print">
                <SilverleafCertificate design={design} name={previewName} body={previewBody} />
              </div>
              <p className="text-[13px] text-sl-muted">
                {CERTIFICATE_SIGNERS.left.name}, {CERTIFICATE_SIGNERS.left.title} · {CERTIFICATE_SIGNERS.right.name}, {CERTIFICATE_SIGNERS.right.title}
              </p>
            </figure>
          </div>
        </section>

        <section aria-labelledby="issued" className="overflow-hidden rounded-xl border border-sl-line bg-sl-surface">
          <h2 id="issued" className="px-5 py-4 text-lg font-semibold text-sl-ink">
            Issued
            {!issuedLoading && <span className="font-medium text-sl-muted"> · {issued.length === 0 ? "none yet" : issued.length}</span>}
          </h2>
          {issuedLoading ? (
            <SkeletonRows label="Loading issued certificates" rows={3} className="border-t border-sl-line" />
          ) : issued.length === 0 ? (
            <p className="px-5 pb-4 text-sm leading-relaxed text-sl-muted">
              No certificate has been issued. Each one you issue is listed here, and the Fellow sees it on their Certificates page.
            </p>
          ) : (
            <div className="overflow-x-auto border-t border-sl-line">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Fellow</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Kind</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Course</th>
                  </tr>
                </thead>
                <tbody>
                  {issued.map((cert) => (
                    <tr key={cert.id} className="border-t border-sl-neutral-soft" data-testid={`issued-cert-${cert.id}`}>
                      <td className="px-5 py-3 text-sl-muted">{issuedDate(cert.generatedAt)}</td>
                      <td className="px-3 py-3 text-sl-ink">{cert.teacherName}</td>
                      <td className="px-3 py-3 text-sl-ink">{kindLabel(cert)}</td>
                      <td className="px-5 py-3 text-sl-muted">{cert.kind === "course" ? cert.courseName : "Not tied to a course"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AcademyShell>
  );
}
