import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Download, Award, ArrowLeft } from "lucide-react";

export default function TeacherCertificates() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();

  const { data: certificates = [], isLoading } = useQuery({
    queryKey: ["/api/teacher", user?.id, "certificates"],
    enabled: !!user?.id,
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
    <div className="min-h-screen bg-background">
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

      <main className="container mx-auto px-4 sm:px-6 py-8">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading certificates...</div>
        ) : certificates.length === 0 ? (
          <div className="text-center py-12">
            <Award className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
            <h2 className="text-xl font-semibold mb-2">No Certificates Yet</h2>
            <p className="text-muted-foreground">
              Complete all weeks and quizzes in your courses to earn certificates.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {certificates.map((cert) => (
              <Card key={cert.id} className="flex flex-col hover-elevate">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Award className="h-8 w-8 text-primary flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {new Date(cert.generatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="mt-2">{cert.courseName}</CardTitle>
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
    </div>
  );
}
