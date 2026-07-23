"use client";

import { Download, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import type { ImportResponse } from "../../lib/api-types";
import { importReasonLabel } from "../../lib/import-reasons";
import { strings } from "../../lib/strings";
import { cn } from "../cn";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { apiFetch } from "./client-api";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ACCEPT: Record<string, string[]> = { [XLSX_MIME]: [".xlsx"] };

const GHOST_LINK =
  "inline-flex h-8 w-fit cursor-pointer items-center justify-center gap-1.5 rounded-md border border-transparent px-3 font-medium whitespace-nowrap text-dense text-muted transition-colors duration-120 ease-out hover:bg-ink/5 hover:text-ink";

type Phase = "idle" | "submitting" | "result" | "error";

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const router = useRouter();
  const [file, setFile] = useState(null as File | null);
  const [phase, setPhase] = useState("idle" as Phase);
  const [result, setResult] = useState(null as ImportResponse | null);

  // Reset on (re)open — adjust-during-render (date-range-picker.tsx:87-95).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFile(null);
      setPhase("idle");
      setResult(null);
    }
  }

  function onDrop(accepted: File[], rejections: FileRejection[]) {
    if (rejections.length > 0) {
      toast.error(strings.importDialog.wrongType);
      return;
    }
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setPhase("idle");
      setResult(null);
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    maxFiles: 1,
    disabled: phase === "submitting",
    onDrop,
  });

  async function submit() {
    if (file === null) return;
    setPhase("submitting");
    const form = new FormData();
    form.set("file", file);
    const res = await apiFetch<ImportResponse>("/api/leads/import", {
      method: "POST",
      body: form,
    });
    if (res.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (res.kind === "error") {
      setPhase("error");
      return;
    }
    setResult(res.data);
    setPhase("result");
    if (res.data.imported >= 1) {
      toast.success(strings.importResult.imported(String(res.data.imported)));
      onImported();
    }
  }

  // Drop-zone label resolved out of the JSX tree (check-copy idiom).
  let dropLabel: string;
  if (isDragActive) {
    dropLabel = strings.importDialog.dropActive;
  } else if (file !== null) {
    dropLabel = file.name;
  } else {
    dropLabel = strings.importDialog.dropHint;
  }

  // Import-button label resolved out of the JSX tree.
  let importLabel: string;
  if (phase === "submitting") {
    importLabel = strings.importDialog.importing;
  } else {
    importLabel = strings.header.import;
  }

  let body: React.ReactNode;
  if (phase === "result" && result !== null) {
    body = (
      <div className="mt-4 flex flex-col gap-2">
        <span className="text-body text-ink">
          {strings.importResult.imported(String(result.imported))}
        </span>
        <span className="text-body text-muted">
          {strings.importResult.skippedDuplicates(String(result.skippedDuplicates))}
        </span>
        {result.createdReps.length > 0 && (
          <span className="text-body text-muted">
            {strings.importResult.createdReps(result.createdReps.join(", "))}
          </span>
        )}
        {result.failed.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-dense font-medium text-sla-overdue">
              {strings.importResult.failedRows(String(result.failed.length))}
            </span>
            <ul className="flex flex-col gap-0.5">
              {result.failed.map((f) => (
                <li key={f.row} className="text-caption text-muted">
                  {strings.importResult.rowError(String(f.row), importReasonLabel(f.reason))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  } else if (phase === "error") {
    body = <span className="mt-4 text-caption text-sla-overdue">{strings.importDialog.failed}</span>;
  } else {
    body = (
      <div className="mt-4 flex flex-col gap-3">
        <div
          {...getRootProps()}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-6 text-center transition-colors duration-120 ease-out hover:border-accent",
            isDragActive && "border-accent bg-accent/5",
          )}
        >
          <input {...getInputProps()} />
          <FileUp size={20} aria-hidden className="text-muted" />
          <span className="text-dense text-ink">{dropLabel}</span>
        </div>
        <a href="/import-template.xlsx" download className={GHOST_LINK}>
          <Download size={16} aria-hidden />
          {strings.dialogs.downloadTemplate}
        </a>
      </div>
    );
  }

  let footer: React.ReactNode;
  if (phase === "result" || phase === "error") {
    footer = (
      <div className="mt-4 flex justify-end">
        <Button onClick={() => onOpenChange(false)}>{strings.dialogs.close}</Button>
      </div>
    );
  } else {
    footer = (
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={() => onOpenChange(false)}>{strings.dialogs.cancel}</Button>
        <Button
          variant="primary"
          onClick={() => void submit()}
          disabled={file === null || phase === "submitting"}
        >
          {importLabel}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{strings.dialogs.importTitle}</DialogTitle>
        {body}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
