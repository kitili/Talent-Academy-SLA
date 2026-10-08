import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 6;

export function usePager<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pages);
  const slice = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );
  return { page: safePage, setPage, pages, slice, total: items.length };
}

export function filterByQuery<T>(items: T[], query: string, pick: (item: T) => string) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => pick(item).toLowerCase().includes(q));
}

export function ListSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="max-w-sm"
      data-testid="input-list-search"
    />
  );
}

export function PageStrip({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-4" data-testid="pagination">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}
