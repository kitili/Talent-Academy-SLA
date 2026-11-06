import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SkeletonRows } from "@/components/Skeletons";

interface Notification {
  id: string;
  recipientType?: string;
  type: string;
  title: string;
  message: string;
  isRead: string;
  createdAt: string;
  metadata?: any;
}

/**
 * Where a notice takes its reader, read off the row so notices already sent work too. Null when the notice is the whole
 * of what there is to read: a cohort note, an academy notice, a star.
 */
export function noticeHref(notice: Pick<Notification, "recipientType" | "type" | "metadata">): string | null {
  const metadata = notice.metadata || {};
  if (metadata.fromId) {
    if (notice.recipientType === "admin") return "/admin/messages";
    if (notice.recipientType === "trainer") return "/trainer/batches?tab=messages";
    return "/teacher/dashboard?tab=messages";
  }
  if (notice.recipientType !== "teacher") return null;
  if (metadata.materialId || metadata.opens === "learning") return "/teacher/dashboard?tab=learning";
  if (notice.type === "session_reminder") return "/calendar";
  if (notice.type === "deadline" || metadata.assignmentId || metadata.quizId) return "/teacher/dashboard?tab=assessments";
  return null;
}

/** The label beside a notice. Anything else, `general` included, carries none: the stored words are code, not copy. */
const TYPE_LABELS: Record<string, string> = { deadline: "Deadline", session_reminder: "Session" };

export function NotificationBell({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications", { limit: 30 }],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=30");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = countData?.count ?? 0;

  const handleOpen = () => {
    setOpen(true);
  };

  const followNotice = (notice: Notification) => {
    if (notice.isRead === "no") markReadMutation.mutate(notice.id);
    const href = noticeHref(notice);
    if (!href) return;
    setOpen(false);
    setLocation(href);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={`relative h-11 w-11 ${tone === "light" ? "text-sl-neutral" : "text-white hover:bg-white/10"}`}
        onClick={handleOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-[7px] top-[7px] flex h-4 min-w-4 items-center justify-center rounded-full bg-sl-accent-strong px-1 text-[11px] font-semibold leading-none text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col">
          <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle>Notifications</SheetTitle>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                >
                  Mark all read
                </Button>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {notificationsLoading ? (
              <SkeletonRows label="Loading notifications" rows={5} />
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    className={`block w-full px-4 py-3 text-left cursor-pointer hover:bg-muted/50 transition-colors ${
                      n.isRead === "no" ? "bg-sl-accent-soft" : ""
                    }`}
                    onClick={() => followNotice(n)}
                    data-testid={`notification-${n.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium break-words">{n.title}</p>
                          {n.isRead === "no" && (
                            <span className="h-2 w-2 rounded-full bg-sl-accent flex-shrink-0" aria-label="Unread" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                        </p>
                      </div>
                      {TYPE_LABELS[n.type] && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">{TYPE_LABELS[n.type]}</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
