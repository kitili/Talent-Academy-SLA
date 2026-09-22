import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Users, Award, BarChart3, ArrowRight, FileText, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DashboardStats {
  totalTrainers: number;
  totalTeachers: number;
  totalCourses: number;
  activeUsers: number;
}

export default function AdminHome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Guard: only admins can access this page
  if (user && user.role !== "admin") {
    navigate("/");
    return null;
  }

  // Reset password state
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserIdentifier, setResetUserIdentifier] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");

  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userIdentifier, newPassword }: { userIdentifier: string; newPassword: string }) => {
      return apiRequest("POST", "/api/admin/reset-user-password", { userIdentifier, newPassword });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setResetPasswordOpen(false);
      setResetUserIdentifier("");
      setResetNewPassword("");
    },
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            Only administrators can access this page.
          </p>
          <Button onClick={() => navigate("/")} variant="outline">
            Go Home
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Manage trainers, teachers, and view system statistics
            </p>
          </div>
          <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-reset-password">
                Reset User Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset User Password</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="userIdentifier">Username or Email</Label>
                  <Input
                    id="userIdentifier"
                    placeholder="admin or admin@example.com"
                    value={resetUserIdentifier}
                    onChange={(e) => setResetUserIdentifier(e.target.value)}
                    data-testid="input-user-identifier"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <PasswordInput
                    id="newPassword"
                    placeholder="Enter new password (min 6 characters)"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    data-testid="input-new-password"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetPasswordOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    resetPasswordMutation.mutate({
                      userIdentifier: resetUserIdentifier,
                      newPassword: resetNewPassword,
                    });
                  }}
                  disabled={resetPasswordMutation.isPending}
                >
                  Reset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Total Trainers
                  </p>
                  <p className="text-3xl font-bold">
                    {stats?.totalTrainers || 0}
                  </p>
                </div>
                <Award className="h-10 w-10 text-primary/30" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Total Teachers
                  </p>
                  <p className="text-3xl font-bold">
                    {stats?.totalTeachers || 0}
                  </p>
                </div>
                <Users className="h-10 w-10 text-primary/30" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Total Courses
                  </p>
                  <p className="text-3xl font-bold">
                    {stats?.totalCourses || 0}
                  </p>
                </div>
                <BarChart3 className="h-10 w-10 text-primary/30" />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Active Users
                  </p>
                  <p className="text-3xl font-bold">
                    {stats?.activeUsers || 0}
                  </p>
                </div>
                <Users className="h-10 w-10 text-primary/30" />
              </div>
            </Card>
          </div>
        )}

        {/* Quick Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/trainers")}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold mb-2">Trainers</h3>
                <p className="text-muted-foreground">
                  Manage all trainers and their approvals
                </p>
              </div>
              <Award className="h-12 w-12 text-primary/20" />
            </div>
            <Button 
              variant="outline" 
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/admin/trainers");
              }}
              data-testid="button-go-trainers"
            >
              View Trainers
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/teachers")}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold mb-2">Teachers</h3>
                <p className="text-muted-foreground">
                  Manage all teachers and view their progress
                </p>
              </div>
              <Users className="h-12 w-12 text-primary/20" />
            </div>
            <Button 
              variant="outline" 
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/admin/teachers");
              }}
              data-testid="button-go-teachers"
            >
              View Teachers
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/batches")}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold mb-2">Batches</h3>
                <p className="text-muted-foreground">
                  View all batches and assign trainers
                </p>
              </div>
              <Layers className="h-12 w-12 text-primary/20" />
            </div>
            <Button 
              variant="outline" 
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/admin/batches");
              }}
              data-testid="button-go-batches"
            >
              Manage Batches
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/analytics")}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold mb-2">Analytics</h3>
                <p className="text-muted-foreground">
                  View batch, course, and teacher statistics
                </p>
              </div>
              <BarChart3 className="h-12 w-12 text-primary/20" />
            </div>
            <Button 
              variant="outline" 
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/admin/analytics");
              }}
              data-testid="button-go-analytics"
            >
              View Analytics
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>

          <Card className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => navigate("/admin/teachers")}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold mb-2">Certificates</h3>
                <p className="text-muted-foreground">
                  Approve templates and generate certificates
                </p>
              </div>
              <FileText className="h-12 w-12 text-primary/20" />
            </div>
            <Button 
              variant="outline" 
              className="mt-4 w-full"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/admin/teachers");
              }}
              data-testid="button-go-certificates"
            >
              Manage Certificates
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
