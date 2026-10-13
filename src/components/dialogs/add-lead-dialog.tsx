"use client";

// Add-lead dialog: required contact + assigned-to, everything
// else optional, live country auto-detection, screenshots, and a friendly
// 409-duplicate path with a "View existing lead" action.

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { LeadWire, RepWire } from "../../lib/api-types";
import { STATUSES, type FollowUpStatus } from "../../lib/status";
import { strings } from "../../lib/strings";
import type { Rating } from "../../lib/types";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { apiFetch } from "./client-api";
import { ConfirmDialog } from "./confirm-dialog";
import {
  initialCountryState,
  onContactChange,
  onCountryEdit,
} from "./country-autofill";
import { RepSelect } from "./rep-select";
import { ScreenshotField } from "./screenshot-field";

export interface AddLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reps: RepWire[];
  onCreated: () => void;
  onViewLead: (leadId: string) => void;
  onRepCreated: () => void;
}

const RATING_ITEMS: { value: Rating | null; label: string }[] = [
  { value: "A", label: strings.rating.A },
  { value: "B", label: strings.rating.B },
  { value: "C", label: strings.rating.C },
  { value: null, label: strings.rating.unknown },
];

const STATUS_ITEMS = STATUSES.map((s) => ({ value: s.value, label: s.label }));

export function AddLeadDialog({
  open,
  onOpenChange,
  reps,
  onCreated,
  onViewLead,
  onRepCreated,
}: AddLeadDialogProps) {
  const router = useRouter();
  const [contact, setContact] = useState("");
  const [country, setCountry] = useState(() => initialCountryState(""));
  const [repId, setRepId] = useState(null as string | null);
  const [interest, setInterest] = useState("");
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(null as Rating | null);
  const [status, setStatus] = useState("Pending" as FollowUpStatus);
  const [screenshots, setScreenshots] = useState([] as string[]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [duplicateId, setDuplicateId] = useState(null as string | null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Reset every draft when the dialog (re)opens — adjust-during-render, the
  // approved pattern (copy of date-range-picker.tsx:87-95).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setContact("");
      setCountry(initialCountryState(""));
      setRepId(null);
      setInterest("");
      setNote("");
      setRating(null);
      setStatus("Pending");
      setScreenshots([]);
      setSubmitting(false);
      setDuplicateId(null);
      setConfirmingDiscard(false);
    }
  }

  // Dirty check: any field diverging from a fresh dialog's default
  // means closing should prompt for confirmation.
  const dirty =
    contact !== "" ||
    interest !== "" ||
    note !== "" ||
    country.value !== "" ||
    rating !== null ||
    status !== "Pending" ||
    repId !== null ||
    screenshots.length > 0;

  function requestClose() {
    if (uploading || submitting) return;
    if (dirty) {
      setConfirmingDiscard(true);
    } else {
      onOpenChange(false);
    }
  }

  function handleContactChange(next: string) {
    setContact(next);
    setCountry((c) => onContactChange(c, next));
    setDuplicateId(null);
  }

  function handleCountryChange(next: string) {
    setCountry((c) => onCountryEdit(c, next, contact));
  }

  async function submit() {
    if (uploading || submitting) return;
    setSubmitting(true);
    setDuplicateId(null);
    const body = {
      contactInfo: contact,
      country: country.value,
      repId,
      interest,
      note,
      rating,
      followUpStatus: status,
      screenshotUrls: screenshots,
    };
    const result = await apiFetch<LeadWire>("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (result.kind === "unauthorized") {
      router.replace("/login");
      return;
    }
    if (result.kind === "error") {
      setSubmitting(false);
      if (result.status === 409 && result.duplicateId != null) {
        setDuplicateId(result.duplicateId);
      } else {
        toast.error(strings.errors.generic);
      }
      return;
    }
    toast.success(strings.toasts.leadCreated);
    onCreated();
    onOpenChange(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit();
  }

  // Submit-button label out of the JSX tree (check-copy idiom).
  let submitLabel: string;
  if (submitting) {
    submitLabel = strings.dialogs.adding;
  } else {
    submitLabel = strings.dialogs.addLeadTitle;
  }

  const canSubmit = contact !== "" && repId !== null && !submitting && !uploading;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && (uploading || submitting)) {
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
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{strings.dialogs.addLeadTitle}</DialogTitle>
          <DialogClose
            disabled={uploading || submitting}
            aria-label={strings.dialogs.close}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
          >
            <X size={16} aria-hidden />
          </DialogClose>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.contact}</span>
            <Input
              value={contact}
              onChange={(e) => handleContactChange(e.target.value)}
              placeholder={strings.fields.contactPlaceholder}
            />
            {duplicateId != null && (
              <span className="mt-1 flex items-center gap-2 text-caption text-sla-overdue">
                {strings.errors.duplicateContact}
                <button
                  type="button"
                  disabled={uploading || submitting}
                  onClick={() => {
                    onViewLead(duplicateId);
                    onOpenChange(false);
                  }}
                  className="cursor-pointer text-accent underline"
                >
                  {strings.dialogs.viewExistingLead}
                </button>
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.country}</span>
            <Input
              value={country.value}
              onChange={(e) => handleCountryChange(e.target.value)}
              placeholder={strings.fields.countryPlaceholder}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.assignedTo}</span>
            <RepSelect
              value={repId}
              onChange={setRepId}
              roster={reps}
              allowQuickAdd
              onRepCreated={onRepCreated}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.interest}</span>
            <Input
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              placeholder={strings.fields.interestPlaceholder}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{strings.fields.note}</span>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={strings.fields.notePlaceholder}
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-caption text-muted">{strings.fields.rating}</span>
              <Select
                value={rating}
                onValueChange={(v) => setRating(v as Rating | null)}
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
                value={status}
                onValueChange={(v) => setStatus(v as FollowUpStatus)}
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
              value={screenshots}
              onChange={setScreenshots}
              onUploadingChange={setUploading}
              disabled={submitting}
            />
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button onClick={requestClose} disabled={uploading || submitting}>{strings.dialogs.cancel}</Button>
            <Button variant="primary" type="submit" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </div>
        </form>
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
