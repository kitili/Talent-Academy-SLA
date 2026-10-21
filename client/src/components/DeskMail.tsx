import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageStrip, usePager } from "@/components/PageStrip";
import { Send } from "lucide-react";

type Peer = { id: string; name: string; role: string };

/** A short 1:1 thread. Newest notes are on the first page so the desk stays small. */
export function DeskMail({ peer, selfLabel }: { peer: Peer | null; selfLabel: string }) {
  const [body, setBody] = useState("");
  const { data: thread = [] } = useQuery<any[]>({
    queryKey: ["/api/desk-messages", peer?.id],
    enabled: Boolean(peer?.id),
    queryFn: async () => {
      const res = await fetch(`/api/desk-messages?withId=${encodeURIComponent(peer!.id)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const newestFirst = [...thread].reverse();
  const pager = usePager(newestFirst, 3);

  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/desk-messages", {
        toId: peer?.id,
        toRole: peer?.role,
        body,
      });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      pager.setPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/desk-messages", peer?.id] });
    },
  });

  if (!peer) {
    return (
      <Card className="max-w-md" data-testid="desk-mail">
        <CardContent className="p-4 text-sm text-muted-foreground">
          No one to write to yet.
        </CardContent>
      </Card>
    );
  }

  const initial = (peer.name || "?").trim().charAt(0).toUpperCase();

  return (
    <Card className="max-w-md border-primary/15 shadow-sm" data-testid="desk-mail">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Message desk</p>
            <p className="truncate text-xs text-muted-foreground">With {peer.name}</p>
          </div>
        </div>
        <div className="space-y-2 rounded-lg bg-muted/50 p-2">
          {pager.total === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">No messages yet. Write a short note.</p>
          ) : (
            pager.slice.map((item: any) => {
              const mine = item.fromName === selfLabel;
              return (
                <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                    <p className={`text-[11px] ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{item.fromName}</p>
                    <p className="leading-snug">{item.body}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <PageStrip page={pager.page} pages={pager.pages} setPage={pager.setPage} />
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim() || send.isPending) return;
            send.mutate();
          }}
        >
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a short note"
            className="h-9"
            data-testid="input-desk-message"
          />
          <Button type="submit" size="sm" className="h-9 px-3" disabled={!body.trim() || send.isPending} data-testid="button-send-desk-message">
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
