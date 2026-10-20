import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Users, Award, BarChart3, ArrowRight, FileText, Layers, CheckCircle, Megaphone, ClipboardList } from "lucide-react";
import { AcademyShell } from "@/components/AcademyShell";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import { PlaceBanner, PlaceCover, type PlaceName } from "@/components/PlaceArt";
import { ADMIN_TOUR } from "@shared/guidedTour";
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
import { clearSessionUser } from "@/lib/sessionUser";

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
  const [freshOpen, setFreshOpen] = useState(false);
  const [freshPhrase, setFreshPhrase] = useState("");
  const tour = useGuidedTour("sla-tour-admin-v1");

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

  const freshStartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/fresh-start", { confirm: freshPhrase.trim() });
      return res.json();
    },
    onSuccess: (data: { removedRows?: number }) => {
      toast({
        title: "Academy activity cleared",
        description: `${data.removedRows || 0} rows removed. Sign in again with the same account. The password is unchanged.`,
      });
      setFreshOpen(false);
      setFreshPhrase("");
      clearSessionUser();
      window.setTimeout(() => window.location.assign("/auth"), 900);
    },
    onError: (error: Error) => toast({ title: "Could not clear activity", description: error.message, variant: "destructive" }),
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
          <TourButton onClick={tour.replay} testId="button-admin-tour" />
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
        <PlaceBanner
          place="library"
          title={`Welcome back${user?.username ? `, ${user.username}` : ""}`}
          subtitle="Trainers, teachers, cohorts, and the gradebook."
        />

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" data-tour="admin-stats">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8" data-tour="admin-stats">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-tour="admin-nav">
          {[
            { href: "/admin/handover", title: "Handover", text: "Three weeks for Silverleaf staff", icon: ClipboardList, test: "button-go-handover", place: "library" as PlaceName },
            { href: "/approvals", title: "Approvals", text: "People waiting to come in", icon: CheckCircle, test: "button-go-approvals", place: "classroom" as PlaceName },
            { href: "/admin/trainers", title: "Trainers", text: "Approvals and accounts", icon: Award, test: "button-go-trainers", place: "hall" as PlaceName },
            { href: "/admin/teachers", title: "Teachers", text: "Progress and files viewed", icon: Users, test: "button-go-teachers", place: "garden" as PlaceName },
            { href: "/admin/batches", title: "Cohorts", text: "Rooms, quizzes, and certificates", icon: Layers, test: "button-go-batches", place: "classroom" as PlaceName },
            { href: "/admin/analytics", title: "Analytics", text: "How the academy is moving", icon: BarChart3, test: "button-go-analytics", place: "library" as PlaceName },
            { href: "/courses", title: "Courses", text: "Modules and lesson files", icon: FileText, test: "button-go-courses", place: "lessons" as PlaceName },
          ].map((item) => (
              <button
                key={item.href}
                type="button"
                data-testid={item.test}
                onClick={() => navigate(item.href)}
                className="sl-nav-card overflow-hidden rounded-2xl text-left"
              >
                <span className="sl-place-tile block">
                  <PlaceCover place={item.place} className="h-[7.5rem]" />
                </span>
                <span className="flex items-center gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">{item.text}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </button>
          ))}
        </div>

        <Card className="p-4 border-destructive/30" data-tour="admin-fresh">
          <p className="font-semibold">Start fresh</p>
          <p className="text-sm text-muted-foreground mt-1">
            Clears courses, cohorts, progress, quizzes, certificates, notices, and messages.
            Admin, trainer, and teacher logins stay. Passwords are not shown or changed.
          </p>
          <Dialog open={freshOpen} onOpenChange={setFreshOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="mt-3" data-testid="button-fresh-start">
                Clear previous activity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear previous activity</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <p className="text-sm text-muted-foreground">
                  This removes what people have done in the academy so you can import again.
                  Accounts remain. Everyone is signed out and uses the same password to come back.
                  Type CLEAR ACTIVITY to confirm.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="fresh-phrase">Confirmation</Label>
                  <Input
                    id="fresh-phrase"
                    value={freshPhrase}
                    onChange={(e) => setFreshPhrase(e.target.value)}
                    placeholder="CLEAR ACTIVITY"
                    data-testid="input-fresh-phrase"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFreshOpen(false)}>Cancel</Button>
                <Button
                  variant="destructive"
                  data-testid="button-confirm-fresh-start"
                  disabled={freshStartMutation.isPending || freshPhrase.trim() !== "CLEAR ACTIVITY"}
                  onClick={() => freshStartMutation.mutate()}
                >
                  Clear activity
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Card>
        <GuidedTour
          open={tour.open}
          steps={ADMIN_TOUR}
          index={tour.index}
          onIndex={tour.setIndex}
          onClose={tour.close}
        />
    </AcademyShell>
  );
}
