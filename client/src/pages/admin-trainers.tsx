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
  SkeletonRows,
  StatusChip,
  cardClass,
  cohortFellows,
  inputClass,
  linkClass,
  primaryButton,
  type PathPayload,
} from "@/components/AdminParts";

interface Trainer {
  id: string;
  username: string;
  email?: string;
  role: string;
  approvalStatus: string;
  createdAt: string;
  lastLogin?: string;
  /** Cohorts this trainer runs (D8): a cohort_trainers row or batches.trainer_id. */
  cohortCount?: number;
}

/** The Trainers tab of People. The tab strip comes from AdminPeople so both tabs share one header row. */
export default function AdminTrainers({ tabs }: { tabs?: ReactNode }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const { data: trainers, isLoading } = useQuery<Trainer[]>({
    queryKey: ["/api/admin/trainers"],
  });
  // Fellows per trainer come from the cohorts they run (the academy path read the Cohorts page makes).
  const { data: path } = useQuery<PathPayload>({
    queryKey: ["/api/admin/academy-path"],
    enabled: user?.role === "admin",
  });
  const [listQuery, setListQuery] = useState("");
  const filteredTrainers = filterByQuery(
    trainers ?? [],
    listQuery,
    (trainer) => `${trainer.username} ${trainer.email || ""}`,
  );
  const activeTrainers = filteredTrainers.filter((trainer) => trainer.approvalStatus !== "inactive");
  const inactiveTrainers = filteredTrainers.filter((trainer) => trainer.approvalStatus === "inactive");
  const trainerPager = usePager(activeTrainers);
  const allActive = (trainers ?? []).filter((trainer) => trainer.approvalStatus !== "inactive");

  const fellowsOf = (trainerId: string) => {
    if (!path) return "…";
    const seen = new Set<string>();
    for (const cohort of path.cohorts) {
      if ((cohort.trainerIds || []).includes(trainerId)) for (const fellow of cohortFellows(cohort)) seen.add(fellow.id);
    }
    return String(seen.size);
  };

  const createTrainerMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/admin/users/create", { ...data, role: "trainer" });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Trainer Created",
        description: "The trainer has been added successfully.",
      });
      setIsDialogOpen(false);
      setFormData({ name: "", email: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/trainers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create trainer",
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
    createTrainerMutation.mutate(formData);
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
              <button type="button" className={primaryButton} data-testid="button-add-trainer">
                Add a trainer
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a trainer</DialogTitle>
                <DialogDescription>
                  Create a new trainer account. The trainer will be automatically approved.
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
                    data-testid="input-trainer-name"
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
                    data-testid="input-trainer-email"
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
                    data-testid="input-trainer-password"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel-trainer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createTrainerMutation.isPending}
                    data-testid="button-submit-trainer"
                  >
                    {createTrainerMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Trainer"
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <section aria-labelledby="trainers-list" className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sl-line px-5 py-4">
          <h2 id="trainers-list" className="text-lg font-semibold text-sl-ink">
            Active trainers
            {!isLoading && <span className="font-medium text-sl-muted"> · {allActive.length}</span>}
          </h2>
          <div className="flex min-w-[220px] flex-col gap-1.5 sm:w-80">
            <label htmlFor="people-search" className="text-[13px] text-sl-muted">Find a trainer</label>
            <input
              id="people-search"
              type="search"
              className={inputClass}
              placeholder="Name, username or email"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <SkeletonRows />
        ) : (trainers ?? []).length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-sl-muted">No trainers yet. Add one, or approve a request from the sign-in page.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-sl-muted">
                    <th scope="col" className="px-5 py-2.5 font-medium">Trainer</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Email</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Cohorts</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Fellows</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Last active</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {trainerPager.slice.map((trainer) => (
                    <tr key={trainer.id} className="border-t border-sl-line" data-testid={`card-trainer-${trainer.id}`}>
                      <th scope="row" className="px-5 py-3.5 text-left font-semibold text-sl-ink">{trainer.username}</th>
                      <td className="px-3 py-3.5 text-sl-ink">{trainer.email || "No email"}</td>
                      <td className="px-3 py-3.5 text-sl-ink" data-testid={`text-trainer-cohorts-${trainer.id}`}>
                        {trainer.cohortCount || 0}
                      </td>
                      <td className="px-3 py-3.5 text-sl-ink">{fellowsOf(trainer.id)}</td>
                      <td className="px-3 py-3.5 text-sl-muted">
                        {trainer.lastLogin ? format(new Date(trainer.lastLogin), "d MMM") : "Not recorded"}
                      </td>
                      <td className="px-3 py-3.5"><StatusChip status={trainer.approvalStatus} /></td>
                      <td className="px-5 py-1.5 text-right">
                        <a
                          href={`/admin/trainers/${trainer.id}`}
                          aria-label={`Open ${trainer.username}`}
                          className={`${linkClass} inline-flex min-h-[44px] items-center font-semibold no-underline hover:underline`}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(`/admin/trainers/${trainer.id}`);
                          }}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                  {activeTrainers.length === 0 && (
                    <tr className="border-t border-sl-line">
                      <td colSpan={7} className="px-5 py-5 text-sl-muted">No trainer matches “{listQuery.trim()}”.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-5">
              <PageStrip page={trainerPager.page} pages={trainerPager.pages} setPage={trainerPager.setPage} />
            </div>
          </>
        )}

        <details className="border-t border-sl-line" data-testid="inactive-trainers">
          <summary className="min-h-[44px] cursor-pointer px-5 py-3 text-[15px] font-semibold text-sl-neutral">
            Inactive desks · {inactiveTrainers.length}
          </summary>
          {inactiveTrainers.length === 0 ? (
            <p className="px-5 pb-4 text-sm leading-relaxed text-sl-muted">
              No inactive trainer desks. A deactivated desk folds in here; it is not deleted.
            </p>
          ) : (
            <ul className="space-y-2 px-5 pb-4 text-sm text-sl-muted">
              {inactiveTrainers.map((trainer) => (
                <li key={trainer.id}>{trainer.username}{trainer.email ? ` · ${trainer.email}` : ""}</li>
              ))}
            </ul>
          )}
        </details>
      </section>

      {!isLoading && (trainers ?? []).length > 0 && (
        <p className="text-sm text-sl-muted">
          {(trainers ?? []).some((trainer) => trainer.lastLogin) ? "" : "Last active is not recorded yet for any trainer. "}
          Fellows are on the{" "}
          <a
            href="/admin/teachers"
            className={linkClass}
            onClick={(event) => {
              event.preventDefault();
              navigate("/admin/teachers");
            }}
          >
            Fellows
          </a>{" "}
          tab.
        </p>
      )}
    </div>
  );
}
