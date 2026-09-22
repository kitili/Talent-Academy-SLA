import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, Presentation, FileSpreadsheet } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface FilePreviewProps {
  fileName: string;
  fileUrl: string;
  className?: string;
}

export function FilePreview({ fileName, fileUrl, className = "" }: FilePreviewProps) {
  const [thumbnailError, setThumbnailError] = useState(false);
  const fileExtension = fileName.toLowerCase().split('.').pop() || '';
  
  const isPDF = fileExtension === 'pdf';
  const isPowerPoint = ['ppt', 'pptx'].includes(fileExtension);
  const isWord = ['doc', 'docx'].includes(fileExtension);
  const isExcel = ['xls', 'xlsx'].includes(fileExtension);

  // For PDFs, try to show thumbnail
  if (isPDF && !thumbnailError) {
    return (
      <div className={`relative ${className}`}>
        <Document
          file={fileUrl}
          onLoadError={() => setThumbnailError(true)}
          className="flex items-center justify-center"
        >
          <Page
            pageNumber={1}
            width={80}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-sm"
          />
        </Document>
      </div>
    );
  }

  // Fallback to file type icons
  const iconClassName = "w-12 h-12";
  
  if (isPowerPoint) {
    return (
      <div className={`flex items-center justify-center bg-orange-50 dark:bg-orange-950/20 ${className}`}>
        <Presentation className={iconClassName} style={{ color: '#D04423' }} />
      </div>
    );
  }
  
  if (isWord) {
    return (
      <div className={`flex items-center justify-center bg-primary/10 dark:bg-primary/20 ${className}`}>
        <FileText className={`${iconClassName} text-primary`} />
      </div>
    );
  }
  
  if (isExcel) {
    return (
      <div className={`flex items-center justify-center bg-green-50 dark:bg-green-950/20 ${className}`}>
        <FileSpreadsheet className={iconClassName} style={{ color: '#217346' }} />
      </div>
    );
  }

  // Generic file icon
  return (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <FileText className={iconClassName} />
    </div>
  );
}
