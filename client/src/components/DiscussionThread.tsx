import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ACADEMY_TERMS } from "@shared/academyPath";

/** A post's role as a Fellow reads it: learners are Fellows (D13). */
function roleLabel(role?: string) {
  return role === "teacher" ? ACADEMY_TERMS.learner.title : role;
}

export function DiscussionThread({ weekId, cohortName }: { weekId: string; cohortName?: string }) {
  const [body, setBody] = useState("");
  const headingId = useId();
  const fieldId = useId();
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
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3.5 rounded-xl border border-sl-line bg-sl-surface px-5 py-[18px]"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="m-0 text-lg font-semibold text-sl-ink">Module discussion</h2>
        <p className="m-0 text-sm text-sl-muted">
          Other Fellows in your cohort can read this. Your trainer does not see this thread; use{" "}
          <Link href="/teacher/dashboard?tab=messages" className="text-sl-accent underline">Messages</Link> for a reply.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-sl-ink">Write a post</label>
        <textarea
          id={fieldId}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="resize-y rounded-lg border border-sl-control bg-sl-surface px-3 py-2.5 text-[15px] text-sl-ink placeholder:text-sl-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-sl-accent"
        />
        <div className="flex justify-end">
          <button
            type="button"
            className="min-h-[44px] rounded-lg bg-sl-accent-strong px-[18px] text-[15px] font-semibold text-white disabled:opacity-50"
            disabled={!body.trim() || post.isPending}
            onClick={() => post.mutate()}
          >
            Post
          </button>
        </div>
      </div>
      {posts.length === 0 ? (
        <div className="flex flex-col gap-1 border-t border-sl-neutral-soft pt-3.5">
          <p className="m-0 text-[15px] font-medium text-sl-ink">No posts yet</p>
          <p className="m-0 text-sm text-sl-muted">
            Posts from Fellows in {cohortName || "your cohort"} appear here.
          </p>
        </div>
      ) : (
        <ul className="m-0 flex max-h-80 list-none flex-col gap-2.5 overflow-y-auto border-t border-sl-neutral-soft p-0 pt-3.5">
          {posts.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5 rounded-lg border border-sl-line px-3 py-2.5 text-sm">
              <span className="font-medium text-sl-ink">
                {item.authorName || item.author_name} · {roleLabel(item.authorRole || item.author_role)}
              </span>
              <span className="whitespace-pre-wrap text-sl-muted">{item.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
