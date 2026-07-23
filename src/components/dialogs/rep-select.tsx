"use client";

// Shared rep picker: active-roster Select, plus an optional
// inactive "current rep" pin (detail dialog) and an optional inline
// quick-add sentinel item (add-lead dialog only).

import { useState } from "react";
import { toast } from "sonner";
import type { RepWire } from "../../lib/api-types";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { apiFetch } from "./client-api";

export interface RepSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
  roster: RepWire[];
  currentRep?: { id: string; name: string; active: boolean } | null;
  onRepCreated?: () => void;
  allowQuickAdd?: boolean;
}

const QUICK_ADD_SENTINEL = "__quick_add__";

export function RepSelect({
  value,
  onChange,
  roster,
  currentRep,
  onRepCreated,
  allowQuickAdd = false,
}: RepSelectProps) {
  const [addingRep, setAddingRep] = useState(false);
  const [newRepName, setNewRepName] = useState("");
  const [savingRep, setSavingRep] = useState(false);

  const items = roster
    .filter((r) => r.active)
    .map((r) => ({ value: r.id as string, label: r.name }));

  if (currentRep && !currentRep.active && !items.some((it) => it.value === currentRep.id)) {
    items.push({ value: currentRep.id, label: strings.reps.inactiveSuffix(currentRep.name) });
  }

  if (allowQuickAdd) {
    items.push({ value: QUICK_ADD_SENTINEL, label: strings.reps.addNewRep });
  }

  function handleValueChange(v: string | null) {
    if (allowQuickAdd && v === QUICK_ADD_SENTINEL) {
      setAddingRep(true);
      return;
    }
    onChange(v);
  }

  function handleCancelAdd() {
    setAddingRep(false);
    setNewRepName("");
  }

  async function handleConfirmAdd() {
    if (newRepName.trim() === "") return;
    setSavingRep(true);
    const result = await apiFetch<RepWire>("/api/reps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newRepName }),
    });
    setSavingRep(false);
    if (result.kind === "ok") {
      onChange(result.data.id);
      onRepCreated?.();
      setAddingRep(false);
      setNewRepName("");
      return;
    }
    if (result.kind === "error" && result.status === 409 && result.duplicateId != null) {
      onChange(result.duplicateId);
      onRepCreated?.();
      setAddingRep(false);
      setNewRepName("");
      return;
    }
    toast.error(strings.errors.generic);
  }

  if (addingRep) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={newRepName}
          onChange={(e) => setNewRepName(e.target.value)}
          placeholder={strings.reps.newRepPlaceholder}
        />
        <Button
          variant="primary"
          onClick={() => void handleConfirmAdd()}
          disabled={newRepName.trim() === "" || savingRep}
        >
          {strings.reps.confirmAdd}
        </Button>
        <Button onClick={handleCancelAdd}>{strings.dialogs.cancel}</Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={handleValueChange} items={items} modal={false}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={strings.fields.selectRep} />
      </SelectTrigger>
      <SelectContent>
        {items.map((it) => (
          <SelectItem key={it.value} value={it.value}>
            {it.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
