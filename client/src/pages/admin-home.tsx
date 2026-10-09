import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Users, Award, BarChart3, ArrowRight, FileText, Layers, CheckCircle, Megaphone, ClipboardList } from "lucide-react";
import { AcademyShell } from "@/components/AcademyShell";
import {
  Dialog,
  DialogContent,
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
  pendingTrainers?: number;
  pendingTeachers?: number;
}

export default function AdminHome() {
  const { user, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Reset password state
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [resetUserIdentifier, setResetUserIdentifier] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");

  // Fetch dashboard stats
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard-stats"],
  });
  const { data: health } = useQuery<any>({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health");
      return res.json();
    },
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

  const announceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/announce", { title: noticeTitle, message: noticeMessage });
      return res.json();
    },
    onSuccess: (data: { sent?: number }) => {
      toast({ title: "Notice sent", description: `${data.sent || 0} people on the academy desks.` });
      setNoticeOpen(false);
      setNoticeTitle("");
      setNoticeMessage("");
    },
    onError: (error: Error) => toast({ title: "Could not send notice", description: error.message, variant: "destructive" }),
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
    <AcademyShell
      scene="library"
      title="Silverleaf Academy"
      subtitle="Admin operations · trainers, cohorts, and the gradebook"
      userLabel={user?.username}
      onLogout={() => logoutMutation.mutate()}
      actions={
        <>
          <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="bg-white/10 text-white border-white/20 hover:bg-white/20" data-testid="button-academy-notice">
                <Megaphone className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Academy notice</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send an academy notice</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="notice-title">Title</Label>
                  <Input id="notice-title" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="Week 3 starts Monday" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notice-message">Message</Label>
                  <Input id="notice-message" value={noticeMessage} onChange={(e) => setNoticeMessage(e.target.value)} placeholder="Trainers and teachers will see this on their desk." />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNoticeOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => announceMutation.mutate()}
                  disabled={announceMutation.isPending || !noticeTitle.trim() || !noticeMessage.trim()}
                >
                  Send
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={resetPasswordOpen} onOpenChange={setResetPasswordOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="bg-white/10 text-white border-white/20 hover:bg-white/20" data-testid="button-reset-password">
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
        </>
      }
    >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Welcome back{user?.username ? `, ${user.username}` : ""}</h1>
          <p className="text-muted-foreground mt-1">Trainers, teachers, cohorts, and the gradebook.</p>
        </div>

        {health && !health.blob && (
          <Card className="p-4 border-primary/30">
            <p className="font-semibold">Lesson files</p>
            <p className="text-sm text-muted-foreground mt-1">
              This server has no Vercel Blob yet. Uploads stay on this machine until Blob is connected.
            </p>
          </Card>
        )}

        {((stats?.pendingTrainers || 0) + (stats?.pendingTeachers || 0) > 0) && (
          <button
            type="button"
            className="w-full rounded-2xl border border-primary/30 bg-white p-4 text-left sl-rise"
            onClick={() => navigate("/approvals")}
            data-testid="button-needs-attention"
          >
            <p className="font-semibold">Needs attention</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(stats?.pendingTrainers || 0)} trainer{(stats?.pendingTrainers || 0) === 1 ? "" : "s"} and {(stats?.pendingTeachers || 0)} teacher{(stats?.pendingTeachers || 0) === 1 ? "" : "s"} waiting for approval.
            </p>
          </button>
        )}

        {/* Stats Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-6 sl-stat-card sl-rise">
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

            <Card className="p-6 sl-stat-card sl-rise">
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

            <Card className="p-6 sl-stat-card sl-rise">
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

            <Card className="p-6 sl-stat-card sl-rise">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { href: "/admin/handover", title: "Handover", text: "Three weeks for Silverleaf staff", icon: ClipboardList, test: "button-go-handover" },
            { href: "/approvals", title: "Approvals", text: "People waiting to come in", icon: CheckCircle, test: "button-go-approvals" },
            { href: "/admin/trainers", title: "Trainers", text: "Approvals and accounts", icon: Award, test: "button-go-trainers" },
            { href: "/admin/teachers", title: "Teachers", text: "Progress and files viewed", icon: Users, test: "button-go-teachers" },
            { href: "/admin/batches", title: "Cohorts", text: "Rooms, quizzes, and certificates", icon: Layers, test: "button-go-batches" },
            { href: "/admin/analytics", title: "Analytics", text: "How the academy is moving", icon: BarChart3, test: "button-go-analytics" },
            { href: "/courses", title: "Courses", text: "Modules and lesson files", icon: FileText, test: "button-go-courses" },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                data-testid={item.test}
                onClick={() => navigate(item.href)}
                className="sl-nav-card flex items-center gap-3 rounded-2xl p-4 text-left"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="block text-sm text-muted-foreground">{item.text}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            );
          })}
        </div>
    </AcademyShell>
  );
}
