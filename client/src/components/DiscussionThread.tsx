import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare } from "lucide-react";
import { ACADEMY_TERMS } from "@shared/academyPath";

/** A post's role as a Fellow reads it: learners are Fellows (D13). */
function roleLabel(role?: string) {
  return role === "teacher" ? ACADEMY_TERMS.learner.title : role;
}

export function DiscussionThread({ weekId }: { weekId: string }) {
  const [body, setBody] = useState("");
  const { data: posts = [] } = useQuery<any[]>({
    queryKey: ["/api/weeks", weekId, "discussions"],
    queryFn: async () => {
      const res = await fetch(`/api/weeks/${weekId}/discussions`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: Boolean(weekId),
  });
  const post = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/weeks/${weekId}/discussions`, { body });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/weeks", weekId, "discussions"] });
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Module discussion
      </p>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {posts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ask a question or share a classroom example.</p>
        ) : posts.map((item) => (
          <div key={item.id} className="text-sm border-l-2 border-primary/40 pl-3">
            <p className="font-medium">{item.authorName || item.author_name} · {roleLabel(item.authorRole || item.author_role)}</p>
            <p className="text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Other Fellows in your cohort can read this. Your trainer does not see this thread; use desk mail for a reply.</p>
      <Textarea
        rows={3}
        placeholder="Write a reply"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>
        Post
      </Button>
    </div>
  );
}
