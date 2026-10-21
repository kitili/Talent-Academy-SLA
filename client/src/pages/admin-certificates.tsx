import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { AcademyShell } from "@/components/AcademyShell";
import { SilverleafCertificate } from "@/components/SilverleafCertificate";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

export default function AdminCertificates() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [design, setDesign] = useState<CertificateDesignId>("fellowship");
  const [occasion, setOccasion] = useState<CertificateOccasion>("graduation");
  const [teacherId, setTeacherId] = useState("");
  const [courseId, setCourseId] = useState("");

  const { data: teachers = [] } = useQuery<Teacher[]>({ queryKey: ["/api/admin/teachers"] });
  const { data: courses = [] } = useQuery<Course[]>({ queryKey: ["/api/courses"] });
  const { data: issued = [] } = useQuery<Issued[]>({ queryKey: ["/api/admin/certificates"] });

  const activeTeachers = teachers.filter((teacher) => teacher.approvalStatus !== "inactive");
  const teacher = activeTeachers.find((row) => row.id === teacherId);
  const course = courses.find((row) => row.id === courseId);
  const previewName = teacher?.name || "";
  const previewBody = useMemo(
    () => wordingForIssue(design, occasion, occasion === "course" ? course?.name : undefined),
    [design, occasion, course?.name],
  );

  const issueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/certificates/issue", {
        teacherId,
        design,
        occasion,
        courseId: occasion === "course" ? courseId : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/certificates"] });
      toast({ title: "Certificate issued" });
    },
    onError: (error: Error) => {
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
      subtitle="Official Silverleaf templates. Name is filled when you issue. Words are written at graduation or course completion."
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
            <Label>Teacher</Label>
            <Select value={teacherId} onValueChange={setTeacherId}>
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
            <Select value={occasion} onValueChange={(value) => setOccasion(value as CertificateOccasion)}>
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
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger data-testid="select-certificate-course">
                  <SelectValue placeholder="Choose the completed course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => window.print()}
            disabled={!canIssue}
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
