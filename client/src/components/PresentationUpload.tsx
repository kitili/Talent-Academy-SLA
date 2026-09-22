import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface PresentationUploadProps {
  onUpload?: (file: File) => void;
}

export function PresentationUpload({ onUpload }: PresentationUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, []);

  const processFile = (file: File) => {
    const allowedTypes = [
      // Presentations
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/pdf',
      'application/x-iwork-keynote-sffkey',
      // Videos
      'video/mp4',
      'video/webm',
      'video/quicktime',
      // Notes
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
      'application/vnd.oasis.opendocument.text'
    ];
    
    const maxSize = 500 * 1024 * 1024; // 500MB for videos

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(ppt|pptx|pdf|key|mp4|webm|mov|doc|docx|txt|rtf|odt)$/i)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a presentation (.pptx, .pdf, .key), video (.mp4, .webm, .mov), or notes (.docx, .txt, .rtf) file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Maximum file size is 500MB",
        variant: "destructive",
      });
      return;
    }

    onUpload?.(file);
    toast({
      title: "Upload started",
      description: `Uploading ${file.name}...`,
    });
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-12 text-center transition-colors
        ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}
      `}
      data-testid="dropzone-upload"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-primary/10 p-6">
          <FileText className="h-16 w-16 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Upload Files</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Drag and drop presentations, videos, or notes here, or click to browse
          </p>
        </div>

        <input
          type="file"
          id="file-upload"
          className="hidden"
          accept=".ppt,.pptx,.pdf,.key,.mp4,.webm,.mov,.doc,.docx,.txt,.rtf,.odt"
          onChange={handleFileSelect}
          data-testid="input-file"
        />
        
        <Button 
          size="lg" 
          className="px-8"
          onClick={() => document.getElementById('file-upload')?.click()}
          data-testid="button-upload"
        >
          <Upload className="mr-2 h-5 w-5" />
          Choose File
        </Button>

        <p className="text-xs text-muted-foreground">
          Supports presentations (.pptx, .pdf, .key), videos (.mp4, .webm, .mov), notes (.docx, .txt, .rtf) • Max 500MB
        </p>
      </div>
    </div>
  );
}
