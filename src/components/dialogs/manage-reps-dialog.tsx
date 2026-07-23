"use client";

// Manage-reps dialog: the full roster — add, rename, activate/
// deactivate, merge (moves every lead then deletes the source), and
// (zero-lead only) hard delete. Owns its own roster fetch, independent of
// dashboard.tsx's `roster`/`refreshRoster` — every successful mutation here
// refetches this dialog's own list AND calls `onMutated()`, which bumps
// dashboard.tsx's `refreshNonce` and — via its existing effects — refetches
// both the leads list and the header's own roster copy in one nonce bump, so
// no separate `refreshRoster` prop is needed here.

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { RepsListResponse, RepWire } from "../../lib/api-types";
import { strings } from "../../lib/strings";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { apiFetch } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";

export interface ManageRepsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMutated: () => void;
}

interface MergeRequest {
  sourceId: string;
  sourceName: string;
  leadCount: number;
  targetId: string;
  targetName: string;
}

interface DeleteRequest {
  id: string;
  name: string;
}

export function ManageRepsDialog({
  open,
  onOpenChange,
  onMutated,
}: ManageRepsDialogProps) {
  const router = useRouter();
  const [roster, setRoster] = useState([] as RepWire[]);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState(null as string | null);
  const [adding, setAdding] = useState(false);
  const [mergeRequest, setMergeRequest] = useState(null as MergeRequest | null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState(null as DeleteRequest | null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Reset the add-row and any pending confirm state whenever the dialog
  // (re)opens — adjust-during-render, the approved pattern (add-lead-dialog).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setNewName("");
      setAddError(null);
      setMergeRequest(null);
      setDeleteRequest(null);
    }
  }

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const result = await apiFetch<RepsListResponse>("/api/reps", { signal });
      if (result.kind === "unauthorized") {
        router.replace("/login");
        return;
      }
      if (result.kind === "ok") setRoster(result.data.reps);
    },
    [router],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    (async () => {
      await refresh(controller.signal);
    })();
    return () => controller.abort();
  }, [open, refresh]);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (trimmed === "") return;
    setAdding(true);
    setAddError(null);
    const result = await apiFetch<RepWire>("/api/reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setAdding(false);
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (result.kind === "ok") {
      setNewName("");
      await refresh();
      onMutated();
      return;
    }
    if (result.kind === "error" && result.status === 409) {
      setAddError(strings.manageReps.duplicateName);
      return;
    }
    toast.error(strings.errors.generic);
  }

  async function handleConfirmMerge() {
    if (mergeRequest == null) return;
    setMergeBusy(true);
    const result = await apiFetch<{ moved: number }>(
      `/api/reps/${mergeRequest.sourceId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeIntoId: mergeRequest.targetId }),
      },
    );
    setMergeBusy(false);
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    setMergeRequest(null);
    if (result.kind === "ok") {
      await refresh();
      onMutated();
      return;
    }
    toast.error(strings.errors.generic);
  }

  async function handleConfirmDelete() {
    if (deleteRequest == null) return;
    setDeleteBusy(true);
    const result = await apiFetch<{ ok: true }>(`/api/reps/${deleteRequest.id}`, {
      method: "DELETE",
    });
    setDeleteBusy(false);
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    setDeleteRequest(null);
    if (result.kind === "ok") {
      await refresh();
      onMutated();
      return;
    }
    toast.error(strings.errors.generic);
  }

  let mergeBody: string;
  if (mergeRequest) {
    mergeBody = strings.manageReps.mergeConfirmBody(
      String(mergeRequest.leadCount),
      mergeRequest.sourceName,
      mergeRequest.targetName,
    );
  } else {
    mergeBody = "";
  }

  let deleteBody: string;
  if (deleteRequest) {
    deleteBody = strings.manageReps.deleteConfirmBody(deleteRequest.name);
  } else {
    deleteBody = "";
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>{strings.manageReps.title}</DialogTitle>
            <DialogClose
              aria-label={strings.dialogs.close}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
            >
              <X size={16} aria-hidden />
            </DialogClose>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError(null);
              }}
              placeholder={strings.reps.newRepPlaceholder}
            />
            <Button
              variant="primary"
              onClick={() => void handleAdd()}
              disabled={newName.trim() === "" || adding}
            >
              {strings.reps.confirmAdd}
            </Button>
          </div>
          {addError != null && (
            <span className="mt-1 block text-caption text-sla-overdue">
              {addError}
            </span>
          )}

          <div className="mt-4 flex flex-col">
            {roster.map((rep) => (
              <RepRow
                key={rep.id}
                rep={rep}
                others={roster.filter((r) => r.id !== rep.id)}
                onUnauthorized={() => router.replace("/login")}
                onRefresh={refresh}
                onMutated={onMutated}
                onRequestMerge={setMergeRequest}
                onRequestDelete={setDeleteRequest}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={mergeRequest != null}
        onOpenChange={(o) => {
          if (!o) setMergeRequest(null);
        }}
        title={strings.manageReps.mergeConfirmTitle}
        description={mergeBody}
        confirmLabel={strings.manageReps.mergeConfirmLabel}
        busy={mergeBusy}
        onConfirm={() => void handleConfirmMerge()}
      />
      <ConfirmDialog
        open={deleteRequest != null}
        onOpenChange={(o) => {
          if (!o) setDeleteRequest(null);
        }}
        title={strings.manageReps.deleteConfirmTitle}
        description={deleteBody}
        confirmLabel={strings.dialogs.delete}
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}

// Method-shorthand signatures throughout (not `=> ...`) so check-copy's naive
// `>text<` JSX-text scanner — which reads `=>` as an opening angle bracket —
// can't chain forward into `onRefresh`'s `Promise<void>` generic (see
// touchpoint-timeline.tsx's identical idiom).
interface RepRowProps {
  rep: RepWire;
  others: RepWire[];
  onUnauthorized(): void;
  onRefresh(signal?: AbortSignal): Promise<void>;
  onMutated(): void;
  onRequestMerge(req: MergeRequest): void;
  onRequestDelete(req: DeleteRequest): void;
}

function RepRow({
  rep,
  others,
  onUnauthorized,
  onRefresh,
  onMutated,
  onRequestMerge,
  onRequestDelete,
}: RepRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(rep.name);
  const [editError, setEditError] = useState(null as string | null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  function startEdit() {
    setEditName(rep.name);
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    const trimmed = editName.trim();
    if (trimmed === "") return;
    setSaving(true);
    setEditError(null);
    const result = await apiFetch<RepWire>(`/api/reps/${rep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (result.kind === "unauthorized") {
      onUnauthorized();
      return;
    }
    if (result.kind === "ok") {
      setEditing(false);
      await onRefresh();
      onMutated();
      return;
    }
    if (result.kind === "error" && result.status === 409) {
      setEditError(strings.manageReps.duplicateName);
      return;
    }
    toast.error(strings.errors.generic);
  }

  async function toggleActive() {
    setToggling(true);
    const result = await apiFetch<RepWire>(`/api/reps/${rep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rep.active }),
    });
    setToggling(false);
    if (result.kind === "unauthorized") {
      onUnauthorized();
      return;
    }
    if (result.kind === "ok") {
      await onRefresh();
      onMutated();
      return;
    }
    toast.error(strings.errors.generic);
  }

  function handleMergeSelect(targetId: string | null) {
    if (targetId == null) return;
    const target = others.find((r) => r.id === targetId);
    if (!target) return;
    onRequestMerge({
      sourceId: rep.id,
      sourceName: rep.name,
      leadCount: rep.leadCount,
      targetId: target.id,
      targetName: target.name,
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
        <div className="flex items-center gap-2">
          <Input
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              setEditError(null);
            }}
            aria-label={strings.manageReps.repNameAria}
            className="flex-1"
          />
          <Button
            variant="primary"
            onClick={() => void saveEdit()}
            disabled={editName.trim() === "" || saving}
          >
            {strings.dialogs.save}
          </Button>
          <Button onClick={cancelEdit} disabled={saving}>
            {strings.dialogs.cancel}
          </Button>
        </div>
        {editError != null && (
          <span className="text-caption text-sla-overdue">{editError}</span>
        )}
      </div>
    );
  }

  let tone: "success" | "muted";
  let statusLabel: string;
  if (rep.active) {
    tone = "success";
    statusLabel = strings.manageReps.active;
  } else {
    tone = "muted";
    statusLabel = strings.manageReps.inactive;
  }

  let toggleLabel: string;
  if (rep.active) {
    toggleLabel = strings.manageReps.deactivate;
  } else {
    toggleLabel = strings.manageReps.activate;
  }

  const mergeItems = others.map((r) => ({ value: r.id as string, label: r.name }));
  const canDelete = rep.leadCount === 0;

  return (
    <div className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate font-medium text-ink text-body">
          {rep.name}
        </span>
        <Badge tone={tone}>{statusLabel}</Badge>
        <span className="text-caption text-muted">
          {strings.manageReps.leadCount(String(rep.leadCount))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startEdit}>{strings.manageReps.rename}</Button>
        <Button onClick={() => void toggleActive()} disabled={toggling}>
          {toggleLabel}
        </Button>
        {mergeItems.length > 0 && (
          <Select
            value={null}
            onValueChange={(v) => handleMergeSelect(v as string | null)}
            items={mergeItems}
            modal={false}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={strings.manageReps.mergeInto} />
            </SelectTrigger>
            <SelectContent>
              {mergeItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {canDelete && (
          <Button onClick={() => onRequestDelete({ id: rep.id, name: rep.name })}>
            {strings.dialogs.delete}
          </Button>
        )}
      </div>
    </div>
  );
}
