import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ChevronRight, Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterByQuery, ListSearch, PageStrip, usePager } from "@/components/PageStrip";
import { SceneBackdrop } from "@/components/SceneBackdrop";

interface Teacher {
  id: string;
  teacherId: number;
  name: string;
  email: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  progress?: number;
  filesViewed?: number;
  courseCompletion?: number;
}

export default function AdminTeachers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const { data: teachers, isLoading, isError } = useQuery<Teacher[]>({
    queryKey: ["/api/admin/teachers"],
  });
  const [listQuery, setListQuery] = useState("");
  const filteredTeachers = filterByQuery(
    teachers ?? [],
    listQuery,
    (teacher) => `${teacher.name} ${teacher.email} ${teacher.teacherId}`,
  );
  const teacherPager = usePager(filteredTeachers);

  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);

  const updateTeacherMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; email: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/teachers/${data.id}`, { name: data.name, email: data.email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Teacher updated" });
      setEditTeacher(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }),
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/dismiss-teacher/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Teacher removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error: Error) => toast({ title: "Remove failed", description: error.message, variant: "destructive" }),
  });

  const createTeacherMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users/create", { ...data, role: "teacher" });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Teacher Created",
        description: "The teacher has been added successfully.",
      });
      setIsDialogOpen(false);
      setFormData({ name: "", email: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create teacher",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    if (formData.password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    createTeacherMutation.mutate(formData);
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Access Denied</h2>
          <p className="text-muted-foreground">
            Only administrators can access this page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <SceneBackdrop scene="garden">
    <div className="p-4 sm:p-6 md:p-8">
      <div className="sl-sheet sl-frame">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate("/admin")}
              data-testid="button-back-dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Teachers</h1>
              <p className="text-muted-foreground">
                Manage all teachers and view their progress
              </p>
            </div>
          </div>
          <ListSearch value={listQuery} onChange={setListQuery} placeholder="Search teachers" />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <Button type="button" data-testid="button-add-teacher" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Teacher
            </Button>
            <DialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Add New Teacher</DialogTitle>
                <DialogDescription>
                  Create a new teacher account. The teacher will be automatically approved.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    placeholder="Enter full name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    data-testid="input-teacher-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    data-testid="input-teacher-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password (min 6 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    data-testid="input-teacher-password"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel-teacher"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTeacherMutation.isPending}
                    data-testid="button-submit-teacher"
                  >
                    {createTeacherMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Teacher"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 animate-pulse bg-muted h-24" />
            ))}
          </div>
        ) : isError ? (
          <Card className="p-8 text-center">
            <p className="font-semibold">Could not load teachers</p>
            <p className="text-muted-foreground mt-1">Open Cohorts → Batch 1, or refresh this page.</p>
          </Card>
        ) : teachers && teachers.length > 0 ? (
          <div className="space-y-4">
            {teacherPager.slice.map((teacher) => (
              <Card
                key={teacher.id}
                className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/admin/teachers/${teacher.id}`)}
                data-testid={`card-teacher-${teacher.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold">{teacher.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          ID: {teacher.teacherId} | {teacher.email}
                        </p>
                      </div>
                      <Badge
                        variant={
                          teacher.approvalStatus === "approved"
                            ? "default"
                            : teacher.approvalStatus === "pending"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {teacher.approvalStatus}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Progress
                        </p>
                        <p className="text-sm font-semibold">
                          {teacher.progress || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Course Completion
                        </p>
                        <p className="text-sm font-semibold">
                          {teacher.courseCompletion || 0}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Files Viewed
                        </p>
                        <p className="text-sm font-semibold">
                          {teacher.filesViewed || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">
                          Last Active
                        </p>
                        <p className="text-sm font-semibold">
                          {teacher.lastLogin
                            ? format(new Date(teacher.lastLogin), "MMM d")
                            : "Never"}
                        </p>
                      </div>
                    </div>

                    <Progress value={teacher.progress || 0} className="h-2" />
                  </div>

                  <div className="flex items-start gap-2 ml-4 flex-shrink-0 mt-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTeacher(teacher);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Remove ${teacher.name}?`)) deleteTeacherMutation.mutate(teacher.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-5 w-5 text-muted-foreground mt-2" />
                  </div>
                </div>
              </Card>
            ))}
            <PageStrip page={teacherPager.page} pages={teacherPager.pages} setPage={teacherPager.setPage} />
          </div>
        ) : (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">No teachers found</p>
          </Card>
        )}
        <Dialog open={Boolean(editTeacher)} onOpenChange={(open) => { if (!open) setEditTeacher(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit teacher</DialogTitle>
              <DialogDescription>Update name and email. This is Moodle-style participant CRUD.</DialogDescription>
            </DialogHeader>
            {editTeacher && (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateTeacherMutation.mutate({
                    id: editTeacher.id,
                    name: editTeacher.name,
                    email: editTeacher.email,
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="edit-teacher-name">Name</Label>
                  <Input
                    id="edit-teacher-name"
                    value={editTeacher.name}
                    onChange={(e) => setEditTeacher({ ...editTeacher, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-teacher-email">Email</Label>
                  <Input
                    id="edit-teacher-email"
                    type="email"
                    value={editTeacher.email}
                    onChange={(e) => setEditTeacher({ ...editTeacher, email: e.target.value })}
                  />
                </div>
                <Button type="submit" disabled={updateTeacherMutation.isPending}>Save</Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
    </SceneBackdrop>
  );
}
