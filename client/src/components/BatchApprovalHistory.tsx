import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageStrip } from "@/components/PageStrip";
import { SkeletonBar, SkeletonRows } from "@/components/Skeletons";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Chip, linkClass } from "@/components/AdminParts";

type HistoryItem = {
  id: string;
  targetType: string;
  targetName: string;
  targetEmail?: string | null;
  action: string;
  performedByName: string;
  performedByRole: string;
  createdAt: string;
};

type HistoryPage = {
  items: HistoryItem[];
  page: number;
  pages: number;
  total: number;
};

export function BatchApprovalHistory({ batchId }: { batchId: string }) {
  const [choice, setChoice] = useState("closed");
  const [page, setPage] = useState(1);
  const open = choice === "history";

  const { data, isLoading } = useQuery<HistoryPage>({
    queryKey: ["/api/batches", batchId, "approval-history", page],
    enabled: open,
    // Turning the page keeps the last page on screen until the next one arrives.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/batches/${batchId}/approval-history?page=${page}`);
      return res.json();
    },
  });

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={choice}
        onValueChange={(value) => {
          setChoice(value);
          setPage(1);
        }}
      >
        <SelectTrigger className="min-h-[44px] w-[220px] border-sl-control bg-sl-surface text-sl-ink" data-testid={`select-approval-history-${batchId}`}>
          <SelectValue placeholder="Cohort records" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="closed">Cohort records</SelectItem>
          <SelectItem value="history">Approval history</SelectItem>
        </SelectContent>
      </Select>

      {open && (
        <div className="mt-3 space-y-3" data-testid={`approval-history-${batchId}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-sl-muted">
              {data ? `${data.total} saved in this cohort` : <SkeletonBar className="h-4 w-40" />}
            </div>
            <a
              href={`/api/batches/${batchId}/approval-history?format=csv`}
              className={`${linkClass} inline-flex min-h-[44px] items-center text-sm`}
              data-testid={`button-export-history-${batchId}`}
            >
              Export approval history
            </a>
          </div>
          {isLoading ? (
            <SkeletonRows label="Loading the saved history" rows={3} className="rounded-lg border border-sl-line bg-sl-surface" />
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-sl-muted">No approval history for this cohort yet.</p>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => (
                <div key={item.id} className="rounded-lg border border-sl-line bg-sl-surface p-3" data-testid={`history-item-${item.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sl-ink">{item.targetName}</span>
                    <Chip>{item.targetType === "teacher" ? "Fellow" : "Trainer"}</Chip>
                    <Chip tone={item.action === "approved" ? "done" : "neutral"}>{item.action === "approved" ? "Approved" : "Declined"}</Chip>
                  </div>
                  {item.targetEmail && <p className="text-sm text-sl-muted">{item.targetEmail}</p>}
                  <p className="mt-1 text-xs text-sl-muted">
                    By {item.performedByName} ({item.performedByRole})
                    {item.createdAt ? ` · ${format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a")}` : ""}
                  </p>
                </div>
              ))}
              <PageStrip page={data.page} pages={data.pages} setPage={setPage} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
