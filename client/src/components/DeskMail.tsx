import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Peer = { id: string; name: string; role: string };

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
      queryClient.invalidateQueries({ queryKey: ["/api/desk-messages", peer?.id] });
    },
  });

  if (!peer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Desk mail</CardTitle>
          <CardDescription>Pick a person to write to. This is a short 1:1 thread, not a full inbox.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card data-testid="desk-mail">
      <CardHeader>
        <CardTitle className="text-lg">Desk mail with {peer.name}</CardTitle>
        <CardDescription>Signed in as {selfLabel}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border bg-white p-3">
          {thread.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            thread.map((item: any) => (
              <div key={item.id} className="text-sm">
                <p className="font-medium">{item.fromName}</p>
                <p className="text-muted-foreground">{item.body}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a short note" />
          <Button type="button" disabled={!body.trim() || send.isPending} onClick={() => send.mutate()}>
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
