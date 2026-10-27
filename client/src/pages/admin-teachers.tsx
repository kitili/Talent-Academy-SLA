import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { filterByQuery, PageStrip, usePager } from "@/components/PageStrip";
import {
  AccessDenied,
  PageHeader,
  StatusChip,
  cardClass,
  inputClass,
  linkClass,
  primaryButton,
  type PathPayload,
} from "@/components/AdminParts";
import { SkeletonBar, SkeletonRows } from "@/components/Skeletons";

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

/** The Fellows tab of People. Fellows are stored as teachers. Edit and Remove now sit on the Fellow's own page. */
export default function AdminTeachers({ tabs }: { tabs?: ReactNode }) {
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
  // The cohorts a Fellow is in come from the steps they are ticked on (the Cohorts page read).
  const { data: path } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });
  const [listQuery, setListQuery] = useState("");
  const filteredTeachers = filterByQuery(
    teachers ?? [],
    listQuery,
    (teacher) => `${teacher.name} ${teacher.email} ${teacher.teacherId}`,
  );
  const activeTeachers = filteredTeachers.filter((teacher) => teacher.approvalStatus !== "inactive");
  const inactiveTeachers = filteredTeachers.filter((teacher) => teacher.approvalStatus === "inactive");
  const teacherPager = usePager(activeTeachers);
  const allActive = (teachers ?? []).filter((teacher) => teacher.approvalStatus !== "inactive");

  const cohortsOf = (teacherId: string) => {
    if (!path) return <SkeletonBar className="h-4 w-6" />;
    return String(path.cohorts.filter((cohort) => cohort.batches.some((step) => (step.teachers || []).some((person) => person.id === teacherId))).length);
  };

  const createTeacherMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users/create", { ...data, role: "teacher" });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Fellow added",
        description: "The Fellow has been added.",
      });
      setIsDialogOpen(false);
      setFormData({ name: "", email: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/teachers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add the Fellow",
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
    return <AccessDenied />;
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="People"
        tabs={tabs}
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <button type="button" className={primaryButton} data-testid="button-add-teacher">
                Add a Fellow
              </button>
            </DialogTrigger>
            <DialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Add a Fellow</DialogTitle>
                <DialogDescription>
                  Create a Fellow account. The Fellow is approved at once.
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
                      "Create Fellow"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <section aria-labelledby="fellows-list" className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sl-line px-5 py-4">
          <h2 id="fellows-list" className="text-lg font-semibold text-sl-ink">
            Active Fellows
            {!isLoading && !isError && <span className="font-medium text-sl-muted"> · {allActive.length}</span>}
          </h2>
          <div className="flex min-w-[220px] flex-col gap-1.5 sm:w-80">
            <label htmlFor="people-search" className="text-[13px] text-sl-muted">Find a Fellow</label>
            <input
              id="people-search"
              type="search"
              className={inputClass}
              placeholder="Name, Fellow ID or email"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows label="Loading Fellows" rows={5} />
        ) : isError ? (
          <div className="px-5 py-6">
            <p className="font-semibold text-sl-ink">Could not load Fellows</p>
            <p className="mt-1 text-sm text-sl-muted">Open Cohorts, or refresh this page.</p>
          </div>
        ) : (teachers ?? []).length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-sl-muted">No Fellows yet. Add one, or approve a request from the sign-in page.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Fellow</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Email</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Cohorts</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Progress</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Last active</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {teacherPager.slice.map((teacher) => (
                    <tr key={teacher.id} className="border-t border-sl-line" data-testid={`card-teacher-${teacher.id}`}>
                      <th scope="row" className="px-5 py-3.5 text-left font-semibold text-sl-ink">
                        <span className="flex flex-col gap-0.5">
                          <span>{teacher.name}</span>
                          <span className="text-[13px] font-normal text-sl-muted">Fellow ID {teacher.teacherId}</span>
                        </span>
                      </th>
                      <td className="px-3 py-3.5 text-sl-ink">{teacher.email}</td>
                      <td className="px-3 py-3.5 text-sl-ink">{cohortsOf(teacher.id)}</td>
                      <td className="px-3 py-3.5 text-sl-ink">{teacher.progress || 0}%</td>
                      <td className="px-3 py-3.5 text-sl-muted">
                        {teacher.lastLogin ? format(new Date(teacher.lastLogin), "d MMM") : "Not recorded"}
                      </td>
                      <td className="px-3 py-3.5"><StatusChip status={teacher.approvalStatus} /></td>
                      <td className="px-5 py-1.5 text-right">
                        <a
                          href={`/admin/teachers/${teacher.id}`}
                          aria-label={`Open ${teacher.name}`}
                          className={`${linkClass} inline-flex min-h-[44px] items-center font-semibold no-underline hover:underline`}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(`/admin/teachers/${teacher.id}`);
                          }}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                  {activeTeachers.length === 0 && (
                    <tr className="border-t border-sl-line">
                      <td colSpan={7} className="px-5 py-5 text-sl-muted">No Fellow matches “{listQuery.trim()}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5">
              <PageStrip page={teacherPager.page} pages={teacherPager.pages} setPage={teacherPager.setPage} />
            </div>
          </>
        )}

        {!isLoading && !isError && (
          <details className="border-t border-sl-line" data-testid="inactive-teachers">
            <summary className="min-h-[44px] cursor-pointer px-5 py-3 text-[15px] font-semibold text-sl-neutral">
              Inactive desks · {inactiveTeachers.length}
            </summary>
            {inactiveTeachers.length === 0 ? (
              <p className="px-5 pb-4 text-sm leading-relaxed text-sl-muted">
                No inactive Fellow desks. A deactivated desk folds in here; it is not deleted.
              </p>
            ) : (
              <ul className="space-y-2 px-5 pb-4 text-sm text-sl-muted">
                {inactiveTeachers.map((teacher) => (
                  <li key={teacher.id}>{teacher.name} · {teacher.email}</li>
                ))}
              </ul>
            )}
          </details>
        )}
      </section>
    </div>
  );
}
