import { ScrollArea } from '@/components/ui/scroll-area';
import { List, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TocEntry } from '@shared/schema';

interface TableOfContentsProps {
  toc: TocEntry[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  className?: string;
}

export function TableOfContents({ toc, currentPage, onPageSelect, className = '' }: TableOfContentsProps) {
  if (!toc || toc.length === 0) {
    return null;
  }

  return (
    <ScrollArea className={`flex-1 ${className}`}>
      <div className="p-2 pb-32 space-y-1">
        {toc.map((entry) => (
          <button
            key={entry.pageNumber}
            onClick={() => onPageSelect(entry.pageNumber)}
            className={`w-full text-left p-3 rounded-lg transition-colors flex items-start gap-3 hover-elevate ${
              currentPage === entry.pageNumber
                ? 'bg-primary/10 border-l-4 border-primary'
                : 'hover:bg-muted/50 border-l-4 border-transparent'
            }`}
            data-testid={`toc-entry-${entry.pageNumber}`}
          >
            <span
              className={`text-sm font-semibold flex-shrink-0 min-w-[2rem] ${
                currentPage === entry.pageNumber ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {entry.pageNumber}
            </span>
            <span
              className={`text-sm leading-relaxed flex-1 ${
                currentPage === entry.pageNumber ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              {entry.heading}
            </span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

interface MobileTableOfContentsProps {
  toc: TocEntry[];
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileTableOfContents({ 
  toc, 
  currentPage, 
  onPageSelect, 
  open, 
  onOpenChange 
}: MobileTableOfContentsProps) {
  if (!toc || toc.length === 0) {
    return null;
  }

  const handleSelect = (pageNumber: number) => {
    onPageSelect(pageNumber);
    onOpenChange(false); // Close drawer after selection
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-y-0 left-0 w-80 bg-card border-r shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-lg">Table of Contents</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-toc"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* ToC List */}
        <ScrollArea className="flex-1">
          <div className="p-3 pb-32 space-y-1">
            {toc.map((entry) => (
              <button
                key={entry.pageNumber}
                onClick={() => handleSelect(entry.pageNumber)}
                className={`w-full text-left p-4 rounded-lg transition-colors flex items-start gap-3 hover-elevate active-elevate-2 ${
                  currentPage === entry.pageNumber
                    ? 'bg-primary/10 border-l-4 border-primary'
                    : 'hover:bg-muted/50 border-l-4 border-transparent'
                }`}
                data-testid={`mobile-toc-entry-${entry.pageNumber}`}
              >
                <span
                  className={`text-base font-semibold flex-shrink-0 min-w-[2.5rem] ${
                    currentPage === entry.pageNumber ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {entry.pageNumber}
                </span>
                <span
                  className={`text-base leading-relaxed flex-1 ${
                    currentPage === entry.pageNumber ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {entry.heading}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Overlay - click to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={() => onOpenChange(false)}
        data-testid="toc-overlay"
      />
    </div>
  );
}
