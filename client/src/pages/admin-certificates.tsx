import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { AcademyShell } from "@/components/AcademyShell";
import { SilverleafCertificate } from "@/components/SilverleafCertificate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CERTIFICATE_DESIGNS,
  CERTIFICATE_SIGNERS,
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
  const { data: issued = [] } = useQuery<Issued[]>({ queryKey: ["/api/admin/certificates"] });
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
        <p className="text-sm text-[#3a4a60]">Only an admin can issue Silverleaf certificates.</p>
      </div>
    );
  }

  const canIssue = Boolean(teacherId) && (occasion === "graduation" || Boolean(courseId));

  return (
    <AcademyShell
      title="Certificates"
      subtitle="Official Silverleaf templates. A course certificate needs every module of the course complete; Fellowship and Advanced need the academy path done."
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      showAdminNav
      scene="paper"
    >
      <style>{PRINT_CSS}</style>
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]" data-testid="admin-certificates">
        <section className="space-y-4 rounded-2xl border border-[#102448]/10 bg-white p-4 text-[#17233c] dark:bg-[#162033] dark:text-[#f6f1e8]">
          <div>
            <p className="text-sm font-semibold">Template</p>
            <p className="text-xs text-muted-foreground mt-1">Signatures stay as {CERTIFICATE_SIGNERS.left.name} and {CERTIFICATE_SIGNERS.right.name}.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(CERTIFICATE_DESIGNS) as CertificateDesignId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`button-template-${id}`}
                  onClick={() => setDesign(id)}
                  className={`overflow-hidden rounded-lg border text-left ${
                    design === id ? "border-[#c4842a] ring-2 ring-[#c4842a]/40" : "border-[#102448]/15"
                  }`}
                >
                  <SilverleafCertificate design={id} name="" body={CERTIFICATE_DESIGNS[id].body} />
                  <span className="block px-2 py-1.5 text-xs font-semibold">{CERTIFICATE_DESIGNS[id].label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Fellow</Label>
            <Select value={teacherId} onValueChange={(value) => choose(value, occasion)}>
              <SelectTrigger data-testid="select-certificate-teacher">
                <SelectValue placeholder="Choose who this is for" />
              </SelectTrigger>
              <SelectContent>
                {activeTeachers.map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">The name stays blank on the template until you choose someone.</p>
          </div>

          <div className="space-y-2">
            <Label>When</Label>
            <Select value={occasion} onValueChange={(value) => choose(teacherId, value as CertificateOccasion)}>
              <SelectTrigger data-testid="select-certificate-occasion">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="graduation">Graduation</SelectItem>
                <SelectItem value="course">Course completion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {occasion === "course" && (
            <div className="space-y-2">
              <Label>Course</Label>
              <Select value={courseId} onValueChange={(value) => choose(teacherId, "course", value)}>
                <SelectTrigger data-testid="select-certificate-course">
                  <SelectValue placeholder="Choose the completed course" />
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
            </div>
          )}

          {selectionStatus && (
            <p
              className={`text-xs ${selectionEligible ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}
              data-testid="text-certificate-eligibility"
            >
              {selectionStatus}
            </p>
          )}

          <div className="space-y-2">
            <Label>Words that will be written</Label>
            <p className="rounded-md border border-[#102448]/10 bg-[#fffaf4] p-3 text-xs leading-relaxed dark:bg-[#1c2740]" data-testid="text-generated-wording">
              {previewBody}
            </p>
          </div>

          <Button
            className="w-full"
            disabled={!canIssue || issueMutation.isPending}
            onClick={() => issueMutation.mutate()}
            data-testid="button-issue-certificate"
          >
            <Award className="mr-2 h-4 w-4" />
            Issue certificate
          </Button>
          {refusalText && (
            <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="text-certificate-refusal">
              {refusalText}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => window.print()}
            disabled={!canIssue || !selectionEligible}
            data-testid="button-print-certificate"
          >
            Print / save PDF
          </Button>
        </section>

        <section className="min-w-0 space-y-4">
          <div id="certificate-print">
            <SilverleafCertificate design={design} name={previewName} body={previewBody} />
          </div>
          <p className="text-xs text-muted-foreground">
            {CERTIFICATE_SIGNERS.left.name}, {CERTIFICATE_SIGNERS.left.title} · {CERTIFICATE_SIGNERS.right.name}, {CERTIFICATE_SIGNERS.right.title}
          </p>

          <div className="rounded-2xl border border-[#102448]/10 bg-white p-4 dark:bg-[#162033]" data-testid="certificate-eligible">
            <p className="font-semibold">Ready for a certificate</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Worked out from each Fellow's progress, by the same rules the server checks when you issue.
            </p>
            {eligibilityFailed ? (
              <p className="mt-2 text-sm text-muted-foreground">Could not load who is ready. You can still issue; the server checks each certificate.</p>
            ) : !eligible ? (
              <p className="mt-2 text-sm text-muted-foreground">Working out who is ready...</p>
            ) : readyForGraduation.length === 0 && readyForCourse.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No Fellow has finished a course or the academy path yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {readyForGraduation.map((row) => (
                  <li key={`path-${row.teacherId}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#102448]/10 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{row.name}</span>
                      <span className="text-muted-foreground"> · Academy path done (Fellowship or Advanced)</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => choose(row.teacherId, "graduation")} data-testid={`button-choose-graduation-${row.teacherId}`}>
                      Choose
                    </Button>
                  </li>
                ))}
                {readyForCourse.map(({ fellow, course: item }) => (
                  <li key={`course-${fellow.teacherId}-${item.courseId}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#102448]/10 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{fellow.name}</span>
                      <span className="text-muted-foreground"> · {item.courseName} complete</span>
                    </span>
                    <Button size="sm" variant="outline" onClick={() => choose(fellow.teacherId, "course", item.courseId)} data-testid={`button-choose-course-${fellow.teacherId}-${item.courseId}`}>
                      Choose
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[#102448]/10 bg-white p-4 dark:bg-[#162033]">
            <p className="font-semibold">Issued</p>
            {issued.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet. Issue at graduation or when a course is complete.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {issued.map((cert) => (
                  <li key={cert.id} className="rounded-lg border border-[#102448]/10 px-3 py-2 text-sm" data-testid={`issued-cert-${cert.id}`}>
                    <span className="font-medium">{cert.teacherName}</span>
                    <span className="text-muted-foreground"> · {cert.courseName}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(cert.generatedAt).toLocaleDateString()} · {cert.design === "advanced" || cert.kind === "distinction" ? "Advanced Level" : cert.kind === "course" ? "Course completion" : "Graduation"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AcademyShell>
  );
}
