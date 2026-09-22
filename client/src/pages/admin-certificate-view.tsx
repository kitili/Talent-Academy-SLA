import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import logoImage from "@assets/image_1760460046116.png";

interface TeacherCertificate {
  id: string;
  teacherId: string;
  batchId: string;
  courseId: string;
  templateId: string;
  teacherName: string;
  courseName: string;
  appreciationText: string;
  adminName1?: string;
  adminName2?: string;
  generatedAt: string;
}

export default function AdminCertificateView() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/certificates/batch/:batchId/view");
  const { isAdmin } = useAuth();
  const batchId = params?.batchId;

  const { data: certs = [], isLoading } = useQuery({
    queryKey: [`/api/batches/${batchId}/certificates`],
    enabled: !!batchId && isAdmin,
  });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <Button onClick={() => navigate("/admin")} variant="outline" className="mb-4 sm:mb-6 md:mb-8">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8" data-testid="text-certificates-title">Batch Certificates</h1>

        {isLoading ? (
          <p>Loading certificates...</p>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {certs.length > 0 ? (
              certs.map((cert: any) => (
                <Card key={cert.id} className="p-4 sm:p-8 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 border-2 border-amber-200 dark:border-amber-800">
                  <div className="text-center space-y-6">
                    <div className="flex justify-center">
                      <img src={logoImage} alt="Silverleaf Academy" className="w-20 h-20" data-testid="img-academy-logo" />
                    </div>

                    <div>
                      <h2 className="text-2xl font-serif font-bold text-amber-900 dark:text-amber-100">Certificate of Completion</h2>
                      <div className="h-1 w-32 bg-amber-300 dark:bg-amber-700 mx-auto mt-2"></div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-sm text-amber-800 dark:text-amber-200">This is to certify that</p>
                      <p className="text-xl sm:text-3xl font-bold text-amber-900 dark:text-amber-100 break-words" data-testid={`text-teacher-name-${cert.id}`}>
                        {cert.teacherName}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-200">has successfully completed the course</p>
                      <p className="text-xl font-semibold text-amber-900 dark:text-amber-100">{cert.courseName}</p>
                    </div>

                    <p className="text-sm italic text-amber-800 dark:text-amber-200 max-w-md mx-auto">
                      {cert.appreciationText}
                    </p>

                    <div className="flex justify-around pt-8">
                      {cert.adminName1 && (
                        <div className="text-center">
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">_________________</p>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{cert.adminName1}</p>
                        </div>
                      )}
                      {cert.adminName2 && (
                        <div className="text-center">
                          <p className="text-xs text-amber-700 dark:text-amber-300 mb-4">_________________</p>
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{cert.adminName2}</p>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Generated on {new Date(cert.generatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">No certificates generated yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
