import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { TeacherLearnerNav } from "@/components/TeacherLearnerNav";
import { PlaceCover } from "@/components/PlaceArt";
import { ArrowLeft, Award, Download } from "lucide-react";

export default function TeacherCertificates() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();

  const { data: me } = useQuery<any>({ queryKey: ["/api/teacher/me"] });
  const teacherId = user?.id || me?.id;
  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["/api/teacher", teacherId, "certificates"],
    enabled: Boolean(teacherId),
  });

  if (!user || user.role !== "teacher") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground">This page is for teachers only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sl-page sl-bg-paper min-h-screen pb-20 sm:pb-0">
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-white">My Certificates</h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/teacher/dashboard")}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="sl-sheet container mx-auto my-4 sm:my-6 px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading certificates...</div>
        ) : certificates.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border bg-white text-center">
            <PlaceCover place="certificate" className="h-52" />
            <div className="py-8 px-4">
              <h2 className="text-xl font-semibold mb-2">No certificates yet</h2>
              <p className="text-muted-foreground">
                Complete the modules and quizzes in your courses to earn one.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <Card key={cert.id} className="flex flex-col hover-elevate overflow-hidden">
                <PlaceCover place="certificate" className="h-32" />
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Award className="h-8 w-8 text-primary flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {new Date(cert.generatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="mt-2">{cert.courseName}</CardTitle>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {cert.kind === "distinction" ? "Distinction — highest qualification" : "Graduation — attended and completed"}
                  </p>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground mb-4 flex-1">
                    {cert.appreciationText}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/teacher/certificates/${cert.id}`)}
                    className="w-full"
                    data-testid={`button-view-cert-${cert.id}`}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    View Certificate
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <TeacherLearnerNav />
    </div>
  );
}
