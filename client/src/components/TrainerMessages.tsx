import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DeskMail } from "@/components/DeskMail";
import { PageStrip, usePager } from "@/components/PageStrip";

type Notice = { id: string; title: string; message: string; isRead: string | boolean; createdAt: string };
type Teacher = { id: string; name: string };

const isUnread = (notice: Notice) => notice.isRead === "false" || notice.isRead === false;

/** Every message that reaches the trainer, from any part of the system, and a note to a teacher. */
export function TrainerMessages({
  teachers,
  expandedId,
  onPick,
  selfLabel,
}: {
  teachers: Teacher[];
  expandedId: string | null;
  onPick: (id: string) => void;
  selfLabel: string;
}) {
  const { data: notices = [] } = useQuery<Notice[]>({
    queryKey: ["/api/notifications", "inbox"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=100", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const pager = usePager(notices, 6);
  const markAll = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });
  const markOne = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });
  const peer = teachers.find((teacher) => teacher.id === expandedId) || teachers[0];
  const unread = notices.filter(isUnread).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(16rem,1fr)]">
      <Card data-testid="trainer-inbox">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Inbox{unread > 0 ? ` · ${unread} new` : ""}</CardTitle>
          <Button size="sm" variant="outline" disabled={unread === 0 || markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {notices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : pager.slice.map((notice) => (
            <button
              key={notice.id}
              type="button"
              onClick={() => isUnread(notice) && markOne.mutate(notice.id)}
              className="w-full rounded-xl border px-3 py-2 text-left"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{notice.title}</span>
                {isUnread(notice) && <Badge>New</Badge>}
              </span>
              <span className="block text-sm text-muted-foreground">{notice.message}</span>
              <span className="block text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleString()}</span>
            </button>
          ))}
          <PageStrip page={pager.page} pages={pager.pages} setPage={pager.setPage} />
        </CardContent>
      </Card>
      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Write to a teacher</CardTitle></CardHeader>
          <CardContent>
            {teachers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teachers in this batch yet.</p>
            ) : (
              <select
                className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                value={peer?.id || ""}
                onChange={(event) => onPick(event.target.value)}
                data-testid="select-message-teacher"
              >
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
              </select>
            )}
          </CardContent>
        </Card>
        <DeskMail peer={peer ? { id: peer.id, name: peer.name, role: "teacher" } : null} selfLabel={selfLabel} />
      </div>
    </div>
  );
}
