import { useEffect, useRef } from "react";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 52428800, // 50MB default
  onGetUploadParameters,
  onComplete,
}: ObjectUploaderProps) {
  const uppyRef = useRef<Uppy | null>(null);

  // Initialize Uppy instance
  if (!uppyRef.current) {
    uppyRef.current = new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
      },
      autoProceed: false,
    })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: onGetUploadParameters,
      })
      .on("complete", (result) => {
        onComplete?.(result);
      });
  }

  // Update restrictions when props change
  useEffect(() => {
    if (uppyRef.current) {
      uppyRef.current.setOptions({
        restrictions: {
          maxNumberOfFiles,
          maxFileSize,
        },
      });
    }
  }, [maxNumberOfFiles, maxFileSize]);

  return (
    <div className="mt-2">
      {uppyRef.current && (
        <Dashboard
          uppy={uppyRef.current}
          proudlyDisplayPoweredByUppy={false}
          height={550}
          width="100%"
          hideUploadButton={false}
          note="Select up to 10 files. Review your selections below, then click Upload."
        />
      )}
    </div>
  );
}
