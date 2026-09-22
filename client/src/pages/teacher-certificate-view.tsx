import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useRoute } from "wouter";
import { Download, ArrowLeft, LogOut, Edit2, Save, X } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import logoImage from "@assets/image_1760460046116.png";

interface Certificate {
  id: string;
  teacherId: string;
  teacherName: string;
  courseName: string;
  appreciationText: string;
  adminName1?: string;
  adminName2?: string;
  completionPercentage: number;
  generatedAt: string;
  batchId: string;
}

export default function TeacherCertificateView() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/teacher/certificates/:certId");
  const { toast } = useToast();

  const certId = params?.certId;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    teacherName: "",
    courseName: "",
    appreciationText: "",
    adminName1: "",
    adminName2: "",
  });

  const canEdit = user?.role === "admin" || user?.role === "trainer";

  const { data: certificate, isLoading } = useQuery<Certificate>({
    queryKey: ["/api/certificates", certId],
    enabled: !!user?.id && !!certId,
  });

  // Track certificate view
  useEffect(() => {
    if (certificate && certId) {
      posthog.capture("certificate_viewed", { certificateId: certId, courseName: certificate.courseName });
    }
  }, [certificate, certId]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<Certificate>) => {
      const response = await apiRequest("PATCH", `/api/certificates/${certId}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/certificates", certId] });
      setIsEditing(false);
      toast({ title: "Certificate updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update certificate", description: error.message, variant: "destructive" });
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Please Log In</h1>
          <p className="text-muted-foreground">You need to be logged in to view certificates.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading certificate...</p>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Certificate Not Found</h1>
          <Button onClick={() => window.history.back()} className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const startEditing = () => {
    setEditData({
      teacherName: certificate.teacherName,
      courseName: certificate.courseName,
      appreciationText: certificate.appreciationText,
      adminName1: certificate.adminName1 || "",
      adminName2: certificate.adminName2 || "",
    });
    setIsEditing(true);
  };

  const saveChanges = () => {
    updateMutation.mutate(editData);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const getBackPath = () => {
    if (user.role === "teacher") return "/teacher/certificates";
    if (user.role === "trainer") return "/trainer/batches";
    return "/";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-primary shadow-md no-print">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Certificate</h1>
          <div className="flex items-center gap-3">
            {canEdit && !isEditing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={startEditing}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                data-testid="button-edit-certificate"
              >
                <Edit2 className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {isEditing && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={saveChanges}
                  disabled={updateMutation.isPending}
                  className="bg-green-500/80 hover:bg-green-500 text-white border-green-600"
                  data-testid="button-save-certificate"
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={cancelEditing}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20"
                  data-testid="button-cancel-edit"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrint}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              data-testid="button-download-certificate"
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(getBackPath())}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20"
              data-testid="button-back"
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
              data-testid="button-logout"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 flex justify-center">
        {/* Certificate Card with decorative border */}
        <Card className="w-full max-w-4xl bg-white text-black print:shadow-none relative overflow-hidden">
          {/* Decorative corner ornaments */}
          <div className="absolute top-0 left-0 w-24 h-24 border-l-4 border-t-4 border-primary" />
          <div className="absolute top-0 right-0 w-24 h-24 border-r-4 border-t-4 border-primary" />
          <div className="absolute bottom-0 left-0 w-24 h-24 border-l-4 border-b-4 border-primary" />
          <div className="absolute bottom-0 right-0 w-24 h-24 border-r-4 border-b-4 border-primary" />
          
          <div className="p-12 text-center space-y-6">
            {/* Header with Logo and Institute Name */}
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="h-20 w-20 bg-primary rounded-full p-3 shadow-lg">
                  <img src={logoImage} alt="Silverleaf Academy Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-primary tracking-wide">SILVERLEAF ACADEMY</h2>
                <p className="text-sm text-gray-500 tracking-widest uppercase mt-1">Excellence in Education</p>
              </div>
            </div>

            {/* Decorative Line */}
            <div className="flex items-center justify-center gap-4 py-2">
              <div className="h-0.5 w-16 bg-gradient-to-r from-transparent to-primary" />
              <div className="h-3 w-3 rotate-45 border-2 border-primary" />
              <div className="h-0.5 w-16 bg-gradient-to-l from-transparent to-primary" />
            </div>

            {/* Certificate Title */}
            <div className="py-4">
              <h1 className="text-5xl font-serif font-bold text-primary tracking-wide">
                Certificate of Completion
              </h1>
            </div>

            {/* This is to certify text */}
            <p className="text-lg text-gray-600 italic">This is to certify that</p>

            {/* Teacher Name - prominently displayed */}
            <div className="py-4">
              {isEditing ? (
                <Input
                  value={editData.teacherName}
                  onChange={(e) => setEditData({ ...editData, teacherName: e.target.value })}
                  className="text-center text-3xl font-bold border-primary max-w-md mx-auto"
                  data-testid="input-teacher-name"
                />
              ) : (
                <div className="inline-block border-b-4 border-primary px-8 pb-2">
                  <p className="text-4xl font-bold text-primary font-serif" data-testid="text-teacher-name">
                    {certificate.teacherName}
                  </p>
                </div>
              )}
            </div>

            {/* Completion Details */}
            <div className="space-y-4 py-4">
              <p className="text-lg text-gray-700">
                has successfully completed the training course
              </p>
              {isEditing ? (
                <Input
                  value={editData.courseName}
                  onChange={(e) => setEditData({ ...editData, courseName: e.target.value })}
                  className="text-center text-xl font-bold border-primary max-w-md mx-auto"
                  data-testid="input-course-name"
                />
              ) : (
                <p className="text-2xl font-bold text-primary" data-testid="text-course-name">
                  "{certificate.courseName}"
                </p>
              )}
              <p className="text-lg text-gray-700">
                with a completion rate of{" "}
                <span className="font-bold text-primary text-xl" data-testid="text-completion-percentage">
                  {certificate.completionPercentage || 100}%
                </span>
              </p>
            </div>

            {/* Appreciation Text */}
            <div className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 rounded-lg mx-8 my-6">
              {isEditing ? (
                <Textarea
                  value={editData.appreciationText}
                  onChange={(e) => setEditData({ ...editData, appreciationText: e.target.value })}
                  className="text-center border-primary"
                  rows={3}
                  data-testid="input-appreciation-text"
                />
              ) : (
                <p className="text-base leading-relaxed text-gray-700 italic" data-testid="text-appreciation">
                  "{certificate.appreciationText}"
                </p>
              )}
            </div>

            {/* Award Statement */}
            <div className="py-4">
              <p className="text-lg text-gray-600">
                This certificate is hereby awarded to{" "}
                <span className="font-semibold text-primary">{certificate.teacherName}</span>
              </p>
              <p className="text-lg text-gray-600">
                in recognition of their dedication and achievement.
              </p>
            </div>

            {/* Date */}
            <p className="text-sm text-gray-500 py-2" data-testid="text-generated-date">
              Awarded on {new Date(certificate.generatedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>

            {/* Decorative Line before signatures */}
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="h-0.5 flex-1 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-12 pt-4 pb-8">
              <div className="space-y-2">
                <div className="h-16 flex items-end justify-center">
                  <div className="w-32 border-b-2 border-gray-400" />
                </div>
                <div>
                  {isEditing ? (
                    <Input
                      value={editData.adminName1}
                      onChange={(e) => setEditData({ ...editData, adminName1: e.target.value })}
                      className="text-center border-primary max-w-[200px] mx-auto"
                      placeholder="Signatory Name"
                      data-testid="input-admin-name-1"
                    />
                  ) : (
                    <p className="font-semibold text-gray-800" data-testid="text-admin-name-1">
                      {certificate.adminName1 || "Administrator"}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">Authorized Signatory</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-16 flex items-end justify-center">
                  <div className="w-32 border-b-2 border-gray-400" />
                </div>
                <div>
                  {isEditing ? (
                    <Input
                      value={editData.adminName2}
                      onChange={(e) => setEditData({ ...editData, adminName2: e.target.value })}
                      className="text-center border-primary max-w-[200px] mx-auto"
                      placeholder="Director Name"
                      data-testid="input-admin-name-2"
                    />
                  ) : (
                    <p className="font-semibold text-gray-800" data-testid="text-admin-name-2">
                      {certificate.adminName2 || "Director"}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">Program Director</p>
                </div>
              </div>
            </div>

            {/* Footer - Certificate ID */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400" data-testid="text-certificate-id">
                Certificate ID: {certificate.id}
              </p>
            </div>
          </div>
        </Card>
      </main>

      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .no-print {
            display: none;
          }
          main {
            padding: 0;
          }
        }
      `}</style>
    </div>
  );
}
