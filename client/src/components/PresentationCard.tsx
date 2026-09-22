import { FileText, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface PresentationCardProps {
  id: string;
  title: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedAt: Date;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileTypeColor = (type: string): string => {
  const ext = type.toLowerCase();
  if (ext.includes('powerpoint') || ext === '.ppt' || ext === '.pptx') return 'bg-orange-500/10 text-orange-700 dark:text-orange-400';
  if (ext.includes('pdf') || ext === '.pdf') return 'bg-red-500/10 text-red-700 dark:text-red-400';
  if (ext.includes('keynote') || ext === '.key') return 'bg-primary/10 text-primary dark:text-primary';
  return 'bg-gray-500/10 text-gray-700 dark:text-gray-400';
};

const getFileTypeLabel = (type: string): string => {
  if (type.includes('powerpoint') || type === '.ppt' || type === '.pptx') return 'PPTX';
  if (type.includes('pdf') || type === '.pdf') return 'PDF';
  if (type.includes('keynote') || type === '.key') return 'KEY';
  return type.split('.').pop()?.toUpperCase() || 'FILE';
};

export function PresentationCard({
  id,
  title,
  fileName,
  fileSize,
  fileType,
  uploadedAt,
  onEdit,
  onDelete,
}: PresentationCardProps) {
  return (
    <Card className="hover-elevate transition-shadow" data-testid={`card-presentation-${id}`}>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-lg p-2 ${getFileTypeColor(fileType)}`}>
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate" data-testid={`text-title-${id}`}>
              {title}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {fileName}
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className={`${getFileTypeColor(fileType)} border-0`}>
            {getFileTypeLabel(fileType)}
          </Badge>
          <span>•</span>
          <span>{formatFileSize(fileSize)}</span>
          <span>•</span>
          <span>{format(uploadedAt, 'MMM dd, yyyy')}</span>
        </div>
      </CardContent>

      <CardFooter className="pt-0 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onEdit?.(id)}
          data-testid={`button-edit-${id}`}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={() => onDelete?.(id)}
          data-testid={`button-delete-${id}`}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </Button>
      </CardFooter>
    </Card>
  );
}
