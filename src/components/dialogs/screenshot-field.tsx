"use client";

// Shared screenshot uploader (step 5): dashed dropzone posting to /api/upload
// one file at a time, thumbnail strip with remove, and the lightbox viewer
// for a closer look. Mounted inside the add/detail lead dialogs (later WPs).

import { X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import type { UploadResponse } from "../../lib/api-types";
import { strings } from "../../lib/strings";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "../../server/uploads";
import { cn } from "../cn";
import { Progress } from "../ui/progress";
import { apiFetch } from "./client-api";
import { ScreenshotLightbox } from "./screenshot-lightbox";

// Accept map derived from the server allowlist so the client hint can't drift.
const ACCEPT: Record<string, string[]> = Object.fromEntries(
  Object.entries(UPLOAD_TYPES).map(([mime, t]) => [mime, [`.${t.extension}`]]),
);

export interface ScreenshotFieldProps {
  value: string[];
  onChange: (urls: string[]) => void;
}

export function ScreenshotField({ value, onChange }: ScreenshotFieldProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null as number | null);

  function reportRejections(rejections: FileRejection[]) {
    let tooLarge = false;
    let badType = false;
    for (const r of rejections) {
      for (const e of r.errors) {
        if (e.code === "file-too-large") tooLarge = true;
        else badType = true;
      }
    }
    if (tooLarge) toast.error(strings.toasts.tooLarge);
    if (badType) toast.error(strings.toasts.unsupportedType);
  }

  async function uploadAll(files: File[]) {
    setUploading(true);
    setTotal(files.length);
    setDone(0);
    const collected = [...value];
    for (const file of files) {
      const form = new FormData();
      form.set("file", file);
      const result = await apiFetch<UploadResponse>("/api/upload", {
        method: "POST",
        body: form,
      });
      if (result.kind === "unauthorized") {
        router.replace("/login");
        setUploading(false);
        return;
      }
      if (result.kind === "error") {
        if (result.status === 413) toast.error(strings.toasts.tooLarge);
        else if (result.status === 415) toast.error(strings.toasts.unsupportedType);
        else toast.error(strings.toasts.uploadFailed);
      } else {
        collected.push(result.data.url);
        onChange([...collected]);
      }
      setDone((n) => n + 1);
    }
    setUploading(false);
  }

  function onDrop(accepted: File[], rejections: FileRejection[]) {
    if (rejections.length > 0) reportRejections(rejections);
    if (accepted.length > 0) void uploadAll(accepted);
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxSize: MAX_UPLOAD_BYTES,
    disabled: uploading,
    multiple: true,
    onDrop,
  });

  // Conditional label resolved outside the JSX tree (check-copy idiom).
  let dropLabel: string;
  if (isDragActive) {
    dropLabel = strings.upload.dropActive;
  } else {
    dropLabel = strings.upload.addScreenshots;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border px-3 py-4 text-center transition-colors duration-120 ease-out hover:border-accent",
          isDragActive && "border-accent bg-accent/5",
        )}
      >
        <input {...getInputProps()} />
        <span className="text-dense text-ink">{dropLabel}</span>
        <span className="text-caption text-muted">{strings.upload.dropHint}</span>
      </div>

      {uploading && (
        <div className="flex flex-col gap-1">
          <Progress value={done} max={total} />
          <span className="text-caption text-muted">{strings.upload.uploading}</span>
        </div>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((url, i) => (
            <div
              key={url}
              className="relative size-16 overflow-hidden rounded-md border border-border"
            >
              <button
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={strings.lightbox.view}
                className="block size-full cursor-pointer"
              >
                <Image
                  src={url}
                  alt={strings.upload.screenshotAlt}
                  width={64}
                  height={64}
                  unoptimized
                  className="size-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={strings.upload.remove}
                className="absolute top-0.5 right-0.5 inline-flex size-5 cursor-pointer items-center justify-center rounded border border-border bg-surface text-muted hover:text-ink"
              >
                <X size={12} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ScreenshotLightbox
          urls={value}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          open={lightboxIndex !== null}
          onOpenChange={(open) => {
            if (!open) setLightboxIndex(null);
          }}
        />
      )}
    </div>
  );
}
