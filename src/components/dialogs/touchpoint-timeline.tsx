"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { TouchpointWire } from "../../lib/api-types";
import { formatDateTime } from "../../lib/dates";
import { strings } from "../../lib/strings";
import { TOUCHPOINT_METHODS, type TouchpointMethod } from "../../lib/types";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { ConfirmDialog } from "./confirm-dialog";

const METHOD_ITEMS = TOUCHPOINT_METHODS.map((m) => ({ value: m, label: strings.method[m] }));

// Method-shorthand signatures split across an intersection (rather than one
// interface with two adjacent arrow-typed `=> Promise<...>` members) so
// check-copy's naive `>text<` JSX-text scanner — which reads `=>` as an
// opening angle bracket — can't chain from one generic's `<letter` into the
// next. Structurally identical to a single props interface.
export type TouchpointTimelineProps = {
  touchpoints: TouchpointWire[];
  notes: string;
  onNotesChange(notes: string): void;
  onAdd(method: TouchpointMethod, notes: string): Promise<boolean>;
} & {
  onDelete(id: string): Promise<void>;
};

export function TouchpointTimeline({
  touchpoints,
  notes,
  onNotesChange,
  onAdd,
  onDelete,
}: TouchpointTimelineProps) {
  const [method, setMethod] = useState("WhatsApp" as TouchpointMethod);
  const [adding, setAdding] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null as string | null);
  const [deleting, setDeleting] = useState(false);

  async function handleAdd() {
    setAdding(true);
    const ok = await onAdd(method, notes);
    setAdding(false);
    if (ok) {
      onNotesChange("");
      setMethod("WhatsApp");
    }
  }

  async function handleConfirmDelete() {
    if (confirmingId === null) return;
    setDeleting(true);
    await onDelete(confirmingId);
    setDeleting(false);
    setConfirmingId(null);
  }

  // Labels + list body out of the JSX tree (check-copy idiom).
  let addLabel: string;
  if (adding) {
    addLabel = strings.touchpoints.logging;
  } else {
    addLabel = strings.dialogs.logTouchpoint;
  }

  let list: React.ReactNode;
  if (touchpoints.length === 0) {
    list = <span className="text-caption text-muted">{strings.touchpoints.empty}</span>;
  } else {
    list = (
      <ul className="flex flex-col gap-2">
        {touchpoints.map((tp) => (
          <li
            key={tp.id}
            className="flex items-start justify-between gap-2 border-b border-hair pb-2"
          >
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-dense font-medium text-ink">{strings.method[tp.method]}</span>
                <span className="text-caption tabular-nums text-muted">
                  {formatDateTime(new Date(tp.timestamp))}
                </span>
              </div>
              {tp.notes !== "" && <span className="text-caption text-muted">{tp.notes}</span>}
            </div>
            <button
              type="button"
              onClick={() => setConfirmingId(tp.id)}
              aria-label={strings.dialogs.deleteTouchpoint}
              className="cursor-pointer text-muted hover:text-ink"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Select
          value={method}
          onValueChange={(v) => setMethod(v as TouchpointMethod)}
          items={METHOD_ITEMS}
          modal={false}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHOD_ITEMS.map((it) => (
              <SelectItem key={it.value} value={it.value}>
                {it.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={strings.touchpoints.notesPlaceholder}
        />
        <div className="flex justify-end">
          <Button variant="primary" onClick={handleAdd} disabled={adding}>
            {addLabel}
          </Button>
        </div>
      </div>

      {list}

      <ConfirmDialog
        open={confirmingId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmingId(null);
        }}
        title={strings.dialogs.deleteTouchpoint}
        description={strings.dialogs.deleteTouchpointConfirm}
        confirmLabel={strings.dialogs.delete}
        busy={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
