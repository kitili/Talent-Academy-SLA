import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageStrip } from "@/components/PageStrip";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Download } from "lucide-react";

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
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/batches/${batchId}/approval-history?page=${page}`);
      return res.json();
    },
  });

  return (
    <div className="mt-4 border-t pt-4">
      <Select
        value={choice}
        onValueChange={(value) => {
          setChoice(value);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-[220px]" data-testid={`select-approval-history-${batchId}`}>
          <SelectValue placeholder="Batch records" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="closed">Batch records</SelectItem>
          <SelectItem value="history">Approval history</SelectItem>
        </SelectContent>
      </Select>

      {open && (
        <div className="mt-3 space-y-3" data-testid={`approval-history-${batchId}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {data ? `${data.total} saved in this batch` : "Loading the saved history"}
            </p>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/batches/${batchId}/approval-history?format=csv`}
                data-testid={`button-export-history-${batchId}`}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </a>
            </Button>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading history...</p>
          ) : !data || data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approval history for this batch yet.</p>
          ) : (
            <div className="space-y-2">
              {data.items.map((item) => (
                <div key={item.id} className="rounded-lg border p-3" data-testid={`history-item-${item.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.targetName}</span>
                    <Badge variant="outline">{item.targetType}</Badge>
                    <Badge variant={item.action === "approved" ? "default" : "destructive"}>{item.action}</Badge>
                  </div>
                  {item.targetEmail && <p className="text-sm text-muted-foreground">{item.targetEmail}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
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
