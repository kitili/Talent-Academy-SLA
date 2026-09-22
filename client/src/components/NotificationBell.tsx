import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: string;
  createdAt: string;
  metadata?: any;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
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

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative text-white hover:bg-white/10 h-9 w-9"
        onClick={handleOpen}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold leading-none">
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
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                <Bell className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      n.isRead === "no" ? "bg-primary/5 border-l-2 border-l-primary" : ""
                    }`}
                    onClick={() => {
                      if (n.isRead === "no") markReadMutation.mutate(n.id);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{n.title}</p>
                          {n.isRead === "no" && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                        </p>
                      </div>
                      {n.type && (
                        <Badge variant="outline" className="text-xs flex-shrink-0 capitalize">{n.type}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
