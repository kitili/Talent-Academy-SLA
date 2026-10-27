import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { AcademyShell } from "@/components/AcademyShell";
import { Chip, PageHeader, TabBar, cardClass, linkClass, primaryButton, secondaryButton } from "@/components/AdminParts";
import { SkeletonBar, SkeletonRows } from "@/components/Skeletons";
import { useAuth } from "@/hooks/use-auth";
import { deskName } from "@shared/deskName";

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

type HistoryItem = {
  id: string;
  targetType: string;
  targetName: string;
  action: string;
  performedByName: string;
  createdAt: string;
};

function asked(createdAt: string) {
  return createdAt ? ` · asked ${format(new Date(createdAt), "d MMM yyyy")}` : "";
}

export default function ApprovalsPage() {
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const [tab, setTab] = useState<"trainers" | "fellows">("trainers");

  const { data: currentUser, isLoading: currentUserLoading } = useQuery<CurrentUser>({
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

  // The decisions already saved (the same rows the CSV export holds), newest first.
  const { data: history, isLoading: historyLoading } = useQuery<{ items: HistoryItem[] }>({
    queryKey: ["/api/admin/approval-history"],
    enabled: isAdmin,
  });

  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/approval-history"] });

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
      refreshHistory();
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
        title: "Fellow approved",
        description: data.message,
      });
      const pendingKey = isAdmin ? "/api/admin/pending-teachers" : "/api/trainer/pending-teachers";
      queryClient.invalidateQueries({ queryKey: [pendingKey] });
      refreshHistory();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to approve Fellow",
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
        title: "Trainer declined",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-trainers"] });
      refreshHistory();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to decline trainer",
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
        title: "Fellow declined",
        description: data.message,
      });
      const pendingKey = isAdmin ? "/api/admin/pending-teachers" : "/api/trainer/pending-teachers";
      queryClient.invalidateQueries({ queryKey: [pendingKey] });
      refreshHistory();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Failed to decline Fellow",
        description: error.message || "An error occurred",
      });
    },
  });

  const activeTab = isAdmin ? tab : "fellows";
  // Until the signed-in role is known, which list to ask for is not known either, so nothing is "empty" yet.
  const loading = currentUserLoading || (activeTab === "trainers" ? adminsLoading : teachersLoading);
  const nobodyAtAll = (!isAdmin || (!adminsLoading && pendingAdmins.length === 0)) && !teachersLoading && pendingTeachers.length === 0;
  const tabs = [
    ...(isAdmin ? [{ id: "trainers", label: "Trainers waiting", count: adminsLoading || currentUserLoading ? undefined : pendingAdmins.length, testId: "approvals-tab-trainers" }] : []),
    { id: "fellows", label: "Fellows waiting", count: teachersLoading || currentUserLoading ? undefined : pendingTeachers.length, testId: "approvals-tab-fellows" },
  ];

  const body = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {!isAdmin && (
            <Link href="/">
              <button type="button" aria-label="Back" className={secondaryButton} data-testid="button-back">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            </Link>
          )}
          <PageHeader
            title="Approvals"
            detail="People who asked for a desk. After you approve, they set their own password."
            tabs={<TabBar label="Approvals" tabs={tabs} active={activeTab} onSelect={(id) => setTab(id as "trainers" | "fellows")} />}
          />
        </div>
        {isAdmin && (
          <a href="/api/admin/approval-history?format=csv" className={`${linkClass} inline-flex min-h-[44px] items-center`} data-testid="button-export-approvals">
            Export approval history
          </a>
        )}
      </div>

      {loading ? (
        <section className={cardClass}>
          <SkeletonRows label="Loading requests" rows={3} />
        </section>
      ) : activeTab === "trainers" ? (
        pendingAdmins.length === 0 ? (
          <Nobody both={nobodyAtAll} who="Trainer" />
        ) : (
          <section aria-labelledby="waiting-trainers" className="flex flex-col gap-3">
            <h2 id="waiting-trainers" className="text-[17px] font-semibold text-sl-ink">
              Waiting <span className="font-medium text-sl-muted">· {pendingAdmins.length}</span>
            </h2>
            <ul className="flex flex-col gap-2.5">
              {pendingAdmins.map((admin) => (
                <li
                  key={admin.id}
                  className={`${cardClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}
                  data-testid={`admin-${admin.id}`}
                >
                  <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[15px] font-semibold text-sl-ink">
                        {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.username}
                      </span>
                      <Chip>Trainer</Chip>
                    </div>
                    <p className="text-sm text-sl-muted">
                      {admin.username}
                      {admin.email ? ` · ${admin.email}` : ""}
                      {asked(admin.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={primaryButton}
                      onClick={() => approveAdmin.mutate(admin.id)}
                      disabled={approveAdmin.isPending || dismissAdmin.isPending}
                      data-testid={`button-approve-admin-${admin.id}`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      onClick={() => {
                        if (window.confirm(`Decline ${[admin.firstName, admin.lastName].filter(Boolean).join(" ") || admin.username}? They are told the request was declined.`)) {
                          dismissAdmin.mutate(admin.id);
                        }
                      }}
                      disabled={approveAdmin.isPending || dismissAdmin.isPending}
                      data-testid={`button-dismiss-admin-${admin.id}`}
                    >
                      Decline…
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : pendingTeachers.length === 0 ? (
        <Nobody both={nobodyAtAll} who="Fellow" />
      ) : (
        <section aria-labelledby="waiting-fellows" className="flex flex-col gap-3">
          <h2 id="waiting-fellows" className="text-[17px] font-semibold text-sl-ink">
            Waiting <span className="font-medium text-sl-muted">· {pendingTeachers.length}</span>
          </h2>
          <ul className="flex flex-col gap-2.5">
            {pendingTeachers.map((teacher) => (
              <li
                key={teacher.id}
                className={`${cardClass} flex flex-wrap items-center justify-between gap-3 px-4 py-3.5`}
                data-testid={`teacher-${teacher.id}`}
              >
                <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[15px] font-semibold text-sl-ink">{teacher.name}</span>
                    <Chip>Fellow</Chip>
                    <Chip>Fellow ID {teacher.teacherId}</Chip>
                  </div>
                  <p className="text-sm text-sl-muted">
                    {teacher.username ? `${teacher.username} · ` : ""}
                    {teacher.email}
                    {asked(teacher.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={primaryButton}
                    onClick={() => approveTeacher.mutate(teacher.id)}
                    disabled={approveTeacher.isPending || dismissTeacher.isPending}
                    data-testid={`button-approve-teacher-${teacher.id}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => {
                      if (window.confirm(`Decline ${teacher.name}? They are told the request was declined.`)) {
                        dismissTeacher.mutate(teacher.id);
                      }
                    }}
                    disabled={approveTeacher.isPending || dismissTeacher.isPending}
                    data-testid={`button-dismiss-teacher-${teacher.id}`}
                  >
                    Decline…
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && historyLoading && (
        <section className="flex flex-col gap-2.5">
          <SkeletonBar className="h-5 w-40" />
          <div className={cardClass}>
            <SkeletonRows label="Loading recent decisions" rows={3} />
          </div>
        </section>
      )}

      {isAdmin && history && history.items.length > 0 && (
        <section aria-labelledby="recent-decisions" className="flex flex-col gap-2.5">
          <h2 id="recent-decisions" className="text-[17px] font-semibold text-sl-ink">Recent decisions</h2>
          <div className={`${cardClass} overflow-x-auto`}>
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-sl-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Person</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Role</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Decision</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {history.items.map((item) => (
                  <tr key={item.id} className="border-t border-sl-line" data-testid={`decision-${item.id}`}>
                    <td className="px-4 py-3 text-sl-muted">{item.createdAt ? format(new Date(item.createdAt), "d MMM yyyy") : ""}</td>
                    <td className="px-3 py-3 text-sl-ink">{item.targetName}</td>
                    <td className="px-3 py-3 text-sl-ink">{item.targetType === "teacher" ? "Fellow" : "Trainer"}</td>
                    <td className="px-3 py-3">
                      <Chip tone={item.action === "approved" ? "done" : "neutral"}>{item.action === "approved" ? "Approved" : "Declined"}</Chip>
                    </td>
                    <td className="px-4 py-3 text-sl-ink">{item.performedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );

  if (isAdmin) {
    return (
      <AcademyShell
        title="Silverleaf Academy"
        userLabel={user ? deskName(user) : undefined}
        onLogout={() => logoutMutation.mutate()}
        showAdminNav
        desk="admin"
        current="approvals"
      >
        {body}
      </AcademyShell>
    );
  }

  // A Trainer approves Fellows here too; the page keeps the shell, so the top bar and menu stay in view.
  return (
    <AcademyShell
      title="Approvals"
      userLabel={user ? deskName(user) : undefined}
      onLogout={() => logoutMutation.mutate()}
      desk="trainer"
      current="home"
    >
      {body}
    </AcademyShell>
  );
}

function Nobody({ both, who }: { both: boolean; who: "Trainer" | "Fellow" }) {
  return (
    <section aria-labelledby="nobody-waiting" className={`${cardClass} flex flex-col gap-1.5 p-5`}>
      <h2 id="nobody-waiting" className="text-lg font-semibold text-sl-ink">Nobody is waiting</h2>
      <p className="text-sm leading-relaxed text-sl-muted">
        {both ? "No Trainer or Fellow has asked for a desk." : `No ${who} has asked for a desk.`} New requests from the sign-in page appear here, oldest first.
      </p>
    </section>
  );
}
