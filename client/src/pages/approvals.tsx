import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock, User, GraduationCap, XCircle, ArrowLeft, Download } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AdminNav } from "@/components/AdminNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type User = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
};

type Teacher = {
  id: string;
  teacherId: number;
  name: string;
  username?: string;
  email: string;
  approvalStatus: string;
  createdAt: string;
};

type CurrentUser = {
  id: string;
  role: string;
  username?: string;
};

export default function ApprovalsPage() {
  const { toast } = useToast();

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/user"],
  });

  const { data: pendingAdmins = [], isLoading: adminsLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/pending-trainers"],
    enabled: currentUser?.role === "admin",
  });

  const { data: pendingTeachers = [], isLoading: teachersLoading } = useQuery<Teacher[]>({
    queryKey: [currentUser?.role === "admin" ? "/api/admin/pending-teachers" : "/api/trainer/pending-teachers"],
  });

  const isAdmin = currentUser?.role === "admin";

  const approveAdmin = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiRequest("POST", `/api/admin/approve-trainer/${adminId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Trainer approved",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-trainers"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to approve trainer",
        description: error.message || "An error occurred",
      });
    },
  });

  const approveTeacher = useMutation({
    mutationFn: async (teacherId: string) => {
      const endpoint = isAdmin ? `/api/admin/approve-teacher/${teacherId}` : `/api/trainer/approve-teacher/${teacherId}`;
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Teacher approved",
        description: data.message,
      });
      const pendingKey = isAdmin ? "/api/admin/pending-teachers" : "/api/trainer/pending-teachers";
      queryClient.invalidateQueries({ queryKey: [pendingKey] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to approve teacher",
        description: error.message || "An error occurred",
      });
    },
  });

  const dismissAdmin = useMutation({
    mutationFn: async (adminId: string) => {
      const response = await apiRequest("POST", `/api/admin/dismiss-trainer/${adminId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Trainer dismissed",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-trainers"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to dismiss trainer",
        description: error.message || "An error occurred",
      });
    },
  });

  const dismissTeacher = useMutation({
    mutationFn: async (teacherId: string) => {
      const endpoint = isAdmin ? `/api/admin/dismiss-teacher/${teacherId}` : `/api/trainer/dismiss-teacher/${teacherId}`;
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Teacher dismissed",
        description: data.message,
      });
      const pendingKey = isAdmin ? "/api/admin/pending-teachers" : "/api/trainer/pending-teachers";
      queryClient.invalidateQueries({ queryKey: [pendingKey] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to dismiss teacher",
        description: error.message || "An error occurred",
      });
    },
  });

  return (
    <div className="sl-page sl-bg-hall min-h-screen">
    {isAdmin && <AdminNav />}
    <div className="sl-sheet sl-frame my-6 p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold mb-2">Pending Approvals</h1>
            <p className="text-muted-foreground">
              Review and approve pending account requests
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button variant="outline" asChild>
            <a href="/api/admin/approval-history?format=csv" data-testid="button-export-approvals">
              <Download className="h-4 w-4 mr-2" />
              Export history
            </a>
          </Button>
        )}
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Pending Trainers
            </CardTitle>
            <CardDescription>
              Trainer requests from the sign-in page. Sign them in, then they create their own password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {adminsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading pending admins...
              </div>
            ) : pendingAdmins.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pending trainer approvals
              </div>
            ) : (
              <div className="space-y-4">
                {pendingAdmins.map((admin) => (
                  <div
                    key={admin.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    data-testid={`admin-${admin.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.username}</h3>
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="w-3 h-3" />
                          Pending
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{admin.username}{admin.email ? ` · ${admin.email}` : ""}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Requested {formatDistanceToNow(new Date(admin.createdAt))} ago
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => approveAdmin.mutate(admin.id)}
                        disabled={approveAdmin.isPending || dismissAdmin.isPending}
                        className="gap-2"
                        data-testid={`button-approve-admin-${admin.id}`}
                      >
                        <CheckCircle className="w-4 h-4" />
                        Sign them in
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => dismissAdmin.mutate(admin.id)}
                        disabled={approveAdmin.isPending || dismissAdmin.isPending}
                        className="gap-2"
                        data-testid={`button-dismiss-admin-${admin.id}`}
                      >
                        <XCircle className="w-4 h-4" />
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5" />
            Pending Teachers
          </CardTitle>
          <CardDescription>
            Teacher requests from the sign-in page. Sign them in, then they create their own password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teachersLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading pending teachers...
            </div>
          ) : pendingTeachers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No pending teacher approvals
            </div>
          ) : (
            <div className="space-y-4">
              {pendingTeachers.map((teacher) => (
                <div
                  key={teacher.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                  data-testid={`teacher-${teacher.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{teacher.name}</h3>
                      <Badge variant="outline" className="font-mono">
                        ID: {teacher.teacherId}
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="w-3 h-3" />
                        Pending
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{teacher.username ? `${teacher.username} · ` : ""}{teacher.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Requested {formatDistanceToNow(new Date(teacher.createdAt))} ago
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => approveTeacher.mutate(teacher.id)}
                      disabled={approveTeacher.isPending || dismissTeacher.isPending}
                      className="gap-2"
                      data-testid={`button-approve-teacher-${teacher.id}`}
                    >
                      <CheckCircle className="w-4 h-4" />
                      Sign them in
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => dismissTeacher.mutate(teacher.id)}
                      disabled={approveTeacher.isPending || dismissTeacher.isPending}
                      className="gap-2"
                      data-testid={`button-dismiss-teacher-${teacher.id}`}
                    >
                      <XCircle className="w-4 h-4" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
