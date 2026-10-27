import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageStrip, usePager } from "@/components/PageStrip";
import { Loading, SkeletonBar } from "@/components/Skeletons";
import { Send } from "lucide-react";

type Peer = { id: string; name: string; role: string };

/** Two message bubbles in outline: one from them, one from you. */
function MailSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="space-y-2">
      <SkeletonBar className="h-10 w-3/5 rounded-2xl" />
      <SkeletonBar className="ml-auto h-10 w-1/2 rounded-2xl" />
    </Loading>
  );
}

/**
 * A short 1:1 thread. Newest notes are on the first page so the desk stays small.
 * `bare` draws it without its own card, for a page that already frames it (the Fellow's Messages).
 * `loading` is set by a page that is still finding out who the peer is, so "No one to write to yet" waits for the answer.
 */
export function DeskMail({ peer, selfLabel, bare = false, loading = false }: { peer: Peer | null; selfLabel: string; bare?: boolean; loading?: boolean }) {
  const [body, setBody] = useState("");
  const { data: thread = [], isLoading: threadLoading } = useQuery<any[]>({
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

  const frame = bare ? "" : "max-w-md rounded-xl border border-sl-line bg-sl-surface";

  if (!peer && loading) {
    return (
      <div className={bare ? "" : `${frame} p-4`} data-testid="desk-mail">
        <MailSkeleton label="Loading your messages" />
      </div>
    );
  }

  if (!peer) {
    return (
      <div className={frame} data-testid="desk-mail">
        <p className={`text-sm text-sl-muted ${bare ? "" : "p-4"}`}>No one to write to yet.</p>
      </div>
    );
  }

  const initial = (peer.name || "?").trim().charAt(0).toUpperCase();
  const fieldId = `desk-message-${peer.id}`;

  return (
    <div className={`${frame} ${bare ? "space-y-3" : "space-y-3 p-4"}`} data-testid="desk-mail">
      <div className={`items-center gap-2 ${bare ? "hidden" : "flex"}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sl-accent-soft text-xs font-semibold text-sl-accent" aria-hidden="true">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-sl-ink">Message desk</p>
          <p className="truncate text-xs text-sl-muted">With {peer.name}</p>
        </div>
      </div>
      <div className="space-y-2 rounded-lg bg-sl-ground p-2">
        {threadLoading ? (
          <MailSkeleton label="Loading your messages" />
        ) : pager.total === 0 ? (
          <p className="px-1 py-2 text-sm text-sl-muted">No messages yet. Write a short note.</p>
        ) : (
          pager.slice.map((item: any) => {
            const mine = item.fromName === selfLabel;
            return (
              <div key={item.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mine ? "bg-sl-accent-strong text-white" : "border border-sl-line bg-sl-surface text-sl-ink"}`}>
                  <p className={`text-[11px] ${mine ? "text-white/80" : "text-sl-muted"}`}>{item.fromName}</p>
                  <p className="leading-snug">{item.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <PageStrip page={pager.page} pages={pager.pages} setPage={pager.setPage} />
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim() || send.isPending) return;
          send.mutate();
        }}
      >
        <label htmlFor={fieldId} className="text-sm font-medium text-sl-ink">Message</label>
        <div className="flex gap-2">
          <input
            id={fieldId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a short note"
            className="min-h-[44px] w-full rounded-lg border border-sl-control bg-sl-surface px-3 text-[15px] text-sl-ink placeholder:text-sl-muted"
            data-testid="input-desk-message"
          />
          <button
            type="submit"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg bg-sl-accent-strong px-4 text-[15px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!body.trim() || send.isPending}
            data-testid="button-send-desk-message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            <span className={bare ? "" : "sr-only"}>Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
