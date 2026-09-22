import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link, useLocation, useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ArrowLeft, CheckCircle, FileText } from "lucide-react";

interface BatchCertificateTemplate {
  id: string;
  batchId: string;
  courseId: string;
  appreciationText: string;
  adminName1?: string;
  adminName2?: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
}

export default function AdminCertificateApproval() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/certificates/:batchId");
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [appreciationText, setAppreciationText] = useState("");
  const [adminName1, setAdminName1] = useState("");
  const [adminName2, setAdminName2] = useState("");

  const batchId = params?.batchId;

  const { data: batch, isLoading: loadingBatch } = useQuery({
    queryKey: [`/api/batches/${batchId}`],
    enabled: !!batchId,
  });

  const { data: template, isLoading: loadingTemplate } = useQuery({
    queryKey: [`/api/batches/${batchId}/certificate-template`],
    enabled: !!batchId && isAdmin,
    onSuccess: (data) => {
      if (data) {
        setAppreciationText(data.appreciationText);
        setAdminName1(data.adminName1 || "");
        setAdminName2(data.adminName2 || "");
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const batchCourses = await apiRequest("GET", `/api/batches/${batchId}/courses`);
      const courseId = batchCourses[0]?.id;
      
      return apiRequest("POST", `/api/batches/${batchId}/certificate-template`, {
        courseId,
        appreciationText,
        adminName1,
        adminName2,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/batches/${batchId}/certificate-template`] });
      toast({ title: "Template saved successfully" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/batches/${batchId}/certificate-template/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/batches/${batchId}/certificate-template`] });
      toast({ title: "Certificate template approved" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const batchCourses = await apiRequest("GET", `/api/batches/${batchId}/courses`);
      const courseId = batchCourses[0]?.id;
      return apiRequest("POST", `/api/batches/${batchId}/courses/${courseId}/generate-certificates`, {});
    },
    onSuccess: () => {
      toast({ title: "Certificates generated successfully" });
    },
  });

  if (!user || (user.role !== "admin" && user.role !== "trainer")) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
        <div>Access denied. Admin or Trainer access required.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <Button onClick={() => navigate("/admin")} variant="outline" className="mb-4 sm:mb-6 md:mb-8">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Certificate Template for {batch?.name || "Batch"}
            </CardTitle>
            <CardDescription>Review and approve the certificate template</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loadingTemplate ? (
              <p>Loading template...</p>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Appreciation Text</label>
                    <Textarea
                      value={appreciationText}
                      onChange={(e) => setAppreciationText(e.target.value)}
                      placeholder="In recognition of successfully completing the training program"
                      className="mt-2"
                      data-testid="input-appreciation-text"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Admin Name 1</label>
                      <Input
                        value={adminName1}
                        onChange={(e) => setAdminName1(e.target.value)}
                        placeholder="First admin name"
                        className="mt-2"
                        data-testid="input-admin-name-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Admin Name 2</label>
                      <Input
                        value={adminName2}
                        onChange={(e) => setAdminName2(e.target.value)}
                        placeholder="Second admin name (optional)"
                        className="mt-2"
                        data-testid="input-admin-name-2"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm font-medium mb-2">Preview</p>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>{appreciationText || "No appreciation text"}</p>
                      <p className="mt-4">Signed by:</p>
                      <p>{adminName1 || "Admin Name 1"}</p>
                      {adminName2 && <p>{adminName2}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-template"
                  >
                    Save Template
                  </Button>

                  {template?.status === "draft" && (
                    <Button
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                      variant="default"
                      data-testid="button-approve-template"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" /> Approve Template
                    </Button>
                  )}

                  {template?.status === "approved" && (
                    <>
                      <Button
                        onClick={() => generateMutation.mutate()}
                        disabled={generateMutation.isPending}
                        variant="default"
                        data-testid="button-generate-certs"
                      >
                        Generate Certificates
                      </Button>
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Approved
                      </span>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
