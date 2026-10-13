"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type {
  LeadDeleteResponse,
  LeadDetailResponse,
  LeadWire,
  RepWire,
  TouchpointCreateResponse,
  TouchpointDeleteResponse,
} from "../../lib/api-types";
import { STATUSES, type FollowUpStatus } from "../../lib/status";
import { strings } from "../../lib/strings";
import type { Rating, SlaConfig, TouchpointMethod } from "../../lib/types";
import { LedgerDots } from "../dashboard/ledger-dots";
import { SlaCell } from "../dashboard/sla-cell";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { apiFetch } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import {
  applyLeadUpdate,
  applyTouchpointCreate,
  applyTouchpointDelete,
  type DetailState,
} from "./lead-detail-state";
import { RepSelect } from "./rep-select";
import { ScreenshotField } from "./screenshot-field";
import { TouchpointTimeline } from "./touchpoint-timeline";

export interface LeadDetailDialogProps {
  leadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenChangeComplete: (open: boolean) => void;
  slaConfig: SlaConfig;
  reps: RepWire[];
  onMutated: () => void;
}

interface Draft {
  contactInfo: string;
  country: string;
  repId: string;
  interest: string;
  note: string;
  rating: Rating | null;
  followUpStatus: FollowUpStatus;
  screenshotUrls: string[];
}

const RATING_ITEMS: { value: Rating | null; label: string }[] = [
  { value: "A", label: strings.rating.A },
  { value: "B", label: strings.rating.B },
  { value: "C", label: strings.rating.C },
  { value: null, label: strings.rating.unknown },
];

const STATUS_ITEMS = STATUSES.map((s) => ({ value: s.value, label: s.label }));

function draftFromLead(lead: LeadWire): Draft {
  return {
    contactInfo: lead.contactInfo,
    country: lead.country,
    repId: lead.repId,
    interest: lead.interest,
    note: lead.note,
    rating: lead.rating,
    followUpStatus: lead.followUpStatus,
    screenshotUrls: lead.screenshotUrls,
  };
}

export function LeadDetailDialog({
  leadId,
  open,
  onOpenChange,
  onOpenChangeComplete,
  slaConfig,
  reps,
  onMutated,
}: LeadDetailDialogProps) {
  const router = useRouter();
  const [detail, setDetail] = useState(null as DetailState | null);
  const [draft, setDraft] = useState(null as Draft | null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => {
    return Date.now();
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duplicateId, setDuplicateId] = useState(null as string | null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}`, { signal: controller.signal });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setFailed(true);
          return;
        }
        const data: LeadDetailResponse = await res.json();
        if (controller.signal.aborted) return;
        setDetail({ lead: data.lead, touchpoints: data.touchpoints });
        setDraft(draftFromLead(data.lead));
        setNotes("");
        setNow(Date.now());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [leadId, router]);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }

  async function handleSave() {
    if (draft === null || uploading || saving) return;
    setSaving(true);
    setDuplicateId(null);
    const result = await apiFetch<LeadWire>(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactInfo: draft.contactInfo,
        country: draft.country,
        repId: draft.repId,
        interest: draft.interest,
        note: draft.note,
        rating: draft.rating,
        followUpStatus: draft.followUpStatus,
        screenshotUrls: draft.screenshotUrls,
      }),
    });
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (result.kind === "error") {
      setSaving(false);
      if (result.status === 409 && result.duplicateId != null) {
        setDuplicateId(result.duplicateId);
      } else {
        toast.error(strings.errors.generic);
      }
      return;
    }
    setDetail((prev) => (prev ? applyLeadUpdate(prev, result.data) : prev));
    setDraft(draftFromLead(result.data));
    setNow(Date.now());
    setSaving(false);
    onMutated();
    toast.success(strings.toasts.leadSaved);
  }

  async function handleAddTouchpoint(method: TouchpointMethod, notes: string): Promise<boolean> {
    const result = await apiFetch<TouchpointCreateResponse>(
      `/api/leads/${leadId}/touchpoints`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, notes }),
      },
    );
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return false;
    }
    if (result.kind === "error") {
      toast.error(strings.errors.generic);
      return false;
    }
    const response = result.data;
    setDetail((prev) => (prev ? applyTouchpointCreate(prev, response) : prev));
    setDraft((d) => (d ? { ...d, followUpStatus: response.lead.followUpStatus } : d));
    setNotes("");
    setNow(Date.now());
    onMutated();
    if (response.autoArchived) toast(strings.toasts.autoArchived);
    return true;
  }

  async function handleDeleteTouchpoint(id: string): Promise<void> {
    const result = await apiFetch<TouchpointDeleteResponse>(`/api/touchpoints/${id}`, {
      method: "DELETE",
    });
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (result.kind === "error") {
      toast.error(strings.errors.generic);
      return;
    }
    const response = result.data;
    setDetail((prev) => (prev ? applyTouchpointDelete(prev, id, response) : prev));
    setDraft((d) => (d ? { ...d, followUpStatus: response.lead.followUpStatus } : d));
    setNow(Date.now());
    onMutated();
    if (response.reverted) toast(strings.toasts.reverted);
  }

  async function handleDeleteLead() {
    setDeletingLead(true);
    const result = await apiFetch<LeadDeleteResponse>(`/api/leads/${leadId}`, {
      method: "DELETE",
    });
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (result.kind === "error") {
      setDeletingLead(false);
      setConfirmingDelete(false);
      toast.error(strings.errors.generic);
      return;
    }
    onMutated();
    toast.success(strings.toasts.leadDeleted);
    onOpenChange(false);
  }

  // Dirty check: draft diverging from the lead's own current fields, or
  // unlogged touchpoint text sitting in the timeline's textarea.
  const baseline = detail !== null ? draftFromLead(detail.lead) : null;
  const dirty =
    draft !== null &&
    baseline !== null &&
    (draft.contactInfo !== baseline.contactInfo ||
      draft.country !== baseline.country ||
      draft.repId !== baseline.repId ||
      draft.interest !== baseline.interest ||
      draft.note !== baseline.note ||
      draft.rating !== baseline.rating ||
      draft.followUpStatus !== baseline.followUpStatus ||
      draft.screenshotUrls.length !== baseline.screenshotUrls.length ||
      draft.screenshotUrls.some((url, i) => url !== baseline.screenshotUrls[i]) ||
      notes !== "");

  function requestClose() {
    if (uploading || saving) return;
    if (dirty) {
      setConfirmingDiscard(true);
    } else {
      onOpenChange(false);
    }
  }

  let saveLabel: string;
  if (saving) {
    saveLabel = strings.dialogs.saving;
  } else {
    saveLabel = strings.dialogs.save;
  }

  let body: React.ReactNode;
  if (failed) {
    body = <span className="text-caption text-muted">{strings.errors.generic}</span>;
  } else if (loading || detail === null || draft === null) {
    body = <span className="text-caption text-muted">{strings.table.loading}</span>;
  } else {
    const currentRep = reps.find((r) => r.id === draft.repId);
    const currentRepInfo = currentRep
      ? { id: currentRep.id, name: currentRep.name, active: currentRep.active }
      : null;
    body = (
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <SlaCell row={detail.lead} slaConfig={slaConfig} now={now} />
          <LedgerDots
            count={detail.lead.touchpointCount}
            cap={slaConfig.responseCap}
            hasScreenshots={detail.lead.screenshotUrls.length > 0}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.contact}</span>
            <Input
              value={draft.contactInfo}
              onChange={(e) => {
                setDuplicateId(null);
                updateDraft({ contactInfo: e.target.value });
              }}
              placeholder={strings.fields.contactPlaceholder}
            />
            {duplicateId != null && (
              <span className="mt-1 text-caption text-sla-overdue">
                {strings.errors.duplicateContact}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.country}</span>
            <Input
              value={draft.country}
              onChange={(e) => updateDraft({ country: e.target.value })}
              placeholder={strings.fields.countryPlaceholder}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.assignedTo}</span>
            <RepSelect
              value={draft.repId}
              onChange={(id) => updateDraft({ repId: id ?? draft.repId })}
              roster={reps}
              currentRep={currentRepInfo}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.interest}</span>
            <Input
              value={draft.interest}
              onChange={(e) => updateDraft({ interest: e.target.value })}
              placeholder={strings.fields.interestPlaceholder}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.note}</span>
            <Textarea
              value={draft.note}
              onChange={(e) => updateDraft({ note: e.target.value })}
              placeholder={strings.fields.notePlaceholder}
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-caption text-muted">{strings.fields.rating}</span>
              <Select
                value={draft.rating}
                onValueChange={(v) => updateDraft({ rating: v as Rating | null })}
                items={RATING_ITEMS}
                modal={false}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATING_ITEMS.map((it) => (
                    <SelectItem key={it.value ?? "__unknown"} value={it.value}>
                      {it.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-caption text-muted">{strings.fields.status}</span>
              <Select
                value={draft.followUpStatus}
                onValueChange={(v) => updateDraft({ followUpStatus: v as FollowUpStatus })}
                items={STATUS_ITEMS}
                modal={false}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ITEMS.map((it) => (
                    <SelectItem key={it.value} value={it.value}>
                      {it.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.screenshots}</span>
            <ScreenshotField
              value={draft.screenshotUrls}
              onChange={(urls) => updateDraft({ screenshotUrls: urls })}
              onUploadingChange={setUploading}
              disabled={saving || deletingLead}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-caption tracking-caps text-muted uppercase">
            {strings.touchpoints.heading}
          </span>
          <TouchpointTimeline
            touchpoints={detail.touchpoints}
            notes={notes}
            onNotesChange={setNotes}
            onAdd={handleAddTouchpoint}
            onDelete={handleDeleteTouchpoint}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={uploading || saving}>
            {strings.dialogs.deleteLead}
          </Button>
          <div className="flex gap-2">
            <Button onClick={requestClose} disabled={uploading || saving}>{strings.dialogs.cancel}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving || uploading}>
              {saveLabel}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && (uploading || saving)) {
          details.cancel();
          return;
        }
        if (!nextOpen && dirty) {
          details.cancel();
          setConfirmingDiscard(true);
          return;
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{strings.dialogs.leadDetailTitle}</DialogTitle>
          <DialogClose
            disabled={uploading || saving}
            aria-label={strings.dialogs.close}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
          >
            <X size={16} aria-hidden />
          </DialogClose>
        </div>
        {body}
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={strings.dialogs.deleteLead}
          description={strings.dialogs.deleteLeadConfirm}
          confirmLabel={strings.dialogs.delete}
          busy={deletingLead}
          onConfirm={handleDeleteLead}
        />
        <ConfirmDialog
          open={confirmingDiscard}
          onOpenChange={setConfirmingDiscard}
          title={strings.dialogs.discardTitle}
          description={strings.dialogs.discardBody}
          confirmLabel={strings.dialogs.discard}
          onConfirm={() => {
            setConfirmingDiscard(false);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
