import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { upload } from "@vercel/blob/client";
import Uppy from "@uppy/core";
import { Dashboard } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { UPLOAD_MAX_BYTES } from "@shared/uploads";

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

type DirectFile = { name: string; size: number; percent: number; url?: string; error?: string };

/**
 * Sends each file straight from the browser to Vercel Blob (the server only signs it), so videos larger than a
 * Vercel function can carry still arrive. Reports back in the shape the Uppy uploader does: `successful` files with
 * `uploadURL`, `name` and `size`.
 */
function DirectUploader({ maxNumberOfFiles, onComplete }: Pick<ObjectUploaderProps, "maxNumberOfFiles" | "onComplete">) {
  const [files, setFiles] = useState<DirectFile[]>([]);
  const [busy, setBusy] = useState(false);
  const patch = (index: number, change: Partial<DirectFile>) =>
    setFiles((current) => current.map((file, i) => (i === index ? { ...file, ...change } : file)));

  const send = async (chosen: File[]) => {
    const picked = chosen.slice(0, maxNumberOfFiles || 1);
    setFiles(picked.map((file) => ({ name: file.name, size: file.size, percent: 0 })));
    setBusy(true);
    const done = await Promise.all(picked.map(async (file, index) => {
      if (file.size > UPLOAD_MAX_BYTES) {
        patch(index, { error: "Larger than 500 MB" });
        return null;
      }
      try {
        const blob = await upload(`training/${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob-upload",
          multipart: file.size > 50 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => patch(index, { percent: Math.round(percentage) }),
        });
        patch(index, { percent: 100, url: blob.url });
        return { name: file.name, size: file.size, uploadURL: blob.url };
      } catch (error) {
        patch(index, { error: error instanceof Error ? error.message : "Upload failed" });
        return null;
      }
    }));
    setBusy(false);
    const successful = done.filter(Boolean) as Array<{ name: string; size: number; uploadURL: string }>;
    if (successful.length > 0) {
      onComplete?.({ successful, failed: [] } as unknown as UploadResult<Record<string, unknown>, Record<string, unknown>>);
    }
  };

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-dashed border-sl-control p-4" data-testid="direct-uploader">
      <label className="block text-sm font-medium text-sl-ink">
        Choose files (slides, documents, images, audio or video up to 500 MB)
        <input
          type="file"
          multiple={(maxNumberOfFiles || 1) > 1}
          disabled={busy}
          className="mt-2 block w-full text-sm"
          onChange={(event) => send(Array.from(event.target.files || []))}
          data-testid="input-direct-upload"
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1 text-sm">
          {files.map((file) => (
            <li key={file.name} className={file.error ? "text-sl-risk" : "text-sl-muted"}>
              {file.name} · {file.error ? file.error : file.url ? "Uploaded" : `${file.percent}%`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ObjectUploader(props: ObjectUploaderProps) {
  const { data: mode } = useQuery<{ direct: boolean }>({ queryKey: ["/api/objects/upload-mode"] });
  if (mode?.direct) return <DirectUploader maxNumberOfFiles={props.maxNumberOfFiles} onComplete={props.onComplete} />;
  return <ServerUploader {...props} />;
}

function ServerUploader({
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
