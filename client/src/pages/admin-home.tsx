import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Megaphone } from "lucide-react";
import { AcademyShell } from "@/components/AcademyShell";
import { GuidedTour, TourButton, useGuidedTour } from "@/components/GuidedTour";
import { PlaceCover, type PlaceName } from "@/components/PlaceArt";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [freshAreas, setFreshAreas] = useState<string[]>([]);
  const [freshTeachers, setFreshTeachers] = useState<string[]>([]);
  const [freshTrainers, setFreshTrainers] = useState<string[]>([]);
  const [personQuery, setPersonQuery] = useState("");
  const tour = useGuidedTour("sla-tour-admin-v3");

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

  const { data: freshTrainerList = [] } = useQuery<{ id: string; username: string; email?: string }[]>({
    queryKey: ["/api/admin/trainers"],
    enabled: freshOpen,
  });
  const { data: freshTeacherList = [] } = useQuery<{ id: string; name: string; email?: string }[]>({
    queryKey: ["/api/admin/teachers"],
    enabled: freshOpen,
  });

  useEffect(() => {
    if (tour.open) setFreshOpen(false);
  }, [tour.open]);

  const freshStartMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/fresh-start", {
        confirm: freshPhrase.trim(),
        areas: freshAreas,
        teacherIds: freshTeachers,
        trainerIds: freshTrainers,
      });
      return res.json();
    },
    onSuccess: (data: { removedRows?: number; people?: number }) => {
      toast({
        title: "Selected activity cleared",
        description: `${data.removedRows || 0} rows removed for ${data.people || 0} people. Other people stay as they are. Logins are unchanged.`,
      });
      setFreshOpen(false);
      setFreshPhrase("");
      setFreshAreas([]);
      setFreshTeachers([]);
      setFreshTrainers([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/dashboard-stats"] });
    },
    onError: (error: Error) => toast({ title: "Could not clear activity", description: error.message, variant: "destructive" }),
  });

  const toggleId = (list: string[], id: string, setList: (next: string[]) => void) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };
  const personNeedle = personQuery.trim().toLowerCase();
  const visibleTrainers = freshTrainerList.filter((trainer) =>
    `${trainer.username} ${trainer.email || ""}`.toLowerCase().includes(personNeedle),
  );
  const visibleTeachers = freshTeacherList.filter((teacher) =>
    `${teacher.name} ${teacher.email || ""}`.toLowerCase().includes(personNeedle),
  );
  const freshReady = freshPhrase.trim() === "CLEAR ACTIVITY"
    && freshAreas.length > 0
    && (freshTeachers.length > 0 || freshTrainers.length > 0);

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
      subtitle="Admin desk"
      userLabel={user?.username}
      showAdminNav
      onLogout={() => logoutMutation.mutate()}
      actions={
        <TourButton onClick={tour.replay} testId="button-admin-tour" tone="light" tourId="admin-tour" />
      }
    >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-[#102448]">
              {user?.username ? user.username : "Admin"}
            </h1>
            <p className="mt-1 text-sm text-[#4a5b73]">The pictures open each part of the academy.</p>
          </div>
          {isLoading ? (
            <div className="h-8 w-48 animate-pulse rounded-md bg-[#102448]/10" data-tour="admin-stats" />
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#4a5b73]" data-tour="admin-stats">
              <span><strong className="text-[#102448]">{stats?.totalTrainers || 0}</strong> trainers</span>
              <span><strong className="text-[#102448]">{stats?.totalTeachers || 0}</strong> teachers</span>
              <span><strong className="text-[#102448]">{stats?.totalCourses || 0}</strong> courses</span>
            </div>
          )}
        </div>

        {((stats?.pendingTrainers || 0) + (stats?.pendingTeachers || 0) > 0) && (
          <button
            type="button"
            className="w-full rounded-2xl border border-[#c4842a]/40 bg-[#fffaf4] p-4 text-left"
            onClick={() => navigate("/approvals")}
            data-testid="button-needs-attention"
          >
            <p className="font-semibold text-[#102448]">Needs attention</p>
            <p className="text-sm text-[#4a5b73] mt-1">
              {(stats?.pendingTrainers || 0)} trainer{(stats?.pendingTrainers || 0) === 1 ? "" : "s"} and {(stats?.pendingTeachers || 0)} teacher{(stats?.pendingTeachers || 0) === 1 ? "" : "s"} waiting for approval.
            </p>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="admin-pictures">
          {[
            { href: "/approvals", title: "Approvals", test: "button-go-approvals", place: "classroom" as PlaceName },
            { href: "/admin/trainers", title: "Trainers", test: "button-go-trainers", place: "hall" as PlaceName },
            { href: "/admin/teachers", title: "Teachers", test: "button-go-teachers", place: "garden" as PlaceName },
            { href: "/admin/batches", title: "Cohorts", test: "button-go-batches", place: "classroom" as PlaceName },
            { href: "/admin/analytics", title: "Analytics", test: "button-go-analytics", place: "library" as PlaceName },
            { href: "/courses", title: "Courses", test: "button-go-courses", place: "lessons" as PlaceName },
          ].map((item) => (
            <button
              key={item.href}
              type="button"
              data-testid={item.test}
              onClick={() => navigate(item.href)}
              className="sl-nav-card overflow-hidden rounded-2xl text-left"
            >
              <span className="sl-place-tile block">
                <PlaceCover place={item.place} className="h-36" />
              </span>
              <span className="block px-4 py-3 font-semibold text-[#102448]">{item.title}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Dialog open={noticeOpen} onOpenChange={setNoticeOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-academy-notice" data-tour="admin-notice">
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
              <Button variant="outline" data-testid="button-reset-password" data-tour="admin-password">
                Reset password
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

        <Card className="p-4 border-[#102448]/10 bg-[#fffaf4]" data-tour="admin-fresh">
          <p className="font-semibold">Start fresh</p>
          <p className="text-sm text-muted-foreground mt-1">
            Clears cohorts, progress, quizzes, certificates, or notices for the people you choose.
            It does not clear the whole academy. Logins and courses stay.
          </p>
          <Dialog open={freshOpen && !tour.open} onOpenChange={setFreshOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="mt-3" data-testid="button-fresh-start" disabled={tour.open}>
                Clear previous activity
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Clear previous activity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  Tick each area on its own, then tick the trainers or teachers it applies to.
                  Everyone else keeps their work. Type CLEAR ACTIVITY to confirm.
                </p>
                <div className="space-y-2">
                  <Label>Areas</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["cohorts", "Cohorts"],
                      ["progress", "Progress"],
                      ["quizzes", "Quizzes"],
                      ["certificates", "Certificates"],
                      ["notices", "Notices"],
                    ].map(([id, label]) => (
                      <label key={id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={freshAreas.includes(id)}
                          onCheckedChange={() => toggleId(freshAreas, id, setFreshAreas)}
                          data-testid={`check-area-${id}`}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="person-query">People</Label>
                  <Input
                    id="person-query"
                    value={personQuery}
                    onChange={(e) => setPersonQuery(e.target.value)}
                    placeholder="Find a trainer or teacher"
                    data-testid="input-fresh-person"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
                    {visibleTrainers.map((trainer) => (
                      <label key={trainer.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={freshTrainers.includes(trainer.id)}
                          onCheckedChange={() => toggleId(freshTrainers, trainer.id, setFreshTrainers)}
                          data-testid={`check-trainer-${trainer.id}`}
                        />
                        <span>{trainer.username} <span className="text-muted-foreground">trainer</span></span>
                      </label>
                    ))}
                    {visibleTeachers.map((teacher) => (
                      <label key={teacher.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={freshTeachers.includes(teacher.id)}
                          onCheckedChange={() => toggleId(freshTeachers, teacher.id, setFreshTeachers)}
                          data-testid={`check-teacher-${teacher.id}`}
                        />
                        <span>{teacher.name} <span className="text-muted-foreground">teacher</span></span>
                      </label>
                    ))}
                    {visibleTrainers.length + visibleTeachers.length === 0 && (
                      <p className="text-sm text-muted-foreground">No matching people.</p>
                    )}
                  </div>
                </div>
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
                  disabled={freshStartMutation.isPending || !freshReady}
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
