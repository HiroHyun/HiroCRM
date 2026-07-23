"use client";

// The header's date-range control: a 32px desktop / 44px compact bordered
// trigger, a popover with presets (dates.ts owns every boundary), a custom
// range, and the compare toggle. Preset/custom apply close the
// popover; the compare toggle does not.

import { Calendar, ChevronDown } from "lucide-react";
import { useState } from "react";
import {
  formatDateShort,
  lastNDaysRange,
  lastWeekRange,
  previousRange,
  startOfNextDay,
  thisMonthRange,
  thisWeekRange,
} from "../../lib/dates";
import { strings } from "../../lib/strings";
import { cn } from "../cn";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { DateRangeMs } from "./dashboard-query";

export interface DateRangePickerProps {
  /** null means no date window at all — the "All time" preset. */
  range: DateRangeMs | null;
  compare: boolean;
  onChange: (range: DateRangeMs | null, compare: boolean) => void;
  triggerClassName?: string;
}

interface Bounds {
  start: Date;
  end: Date;
}

/** Local YYYY-MM-DD — never toISOString(), which is UTC. */
function toISODate(epochMs: number): string {
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parses a native <input type="date"> value ("YYYY-MM-DD") as LOCAL components. */
function parseISODate(value: string): { y: number; m: number; d: number } | null {
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  return { y, m, d };
}

// Two-column grid order (visual pairs per row): [This week | Last 7 days],
// [Last week | Last 30 days], [This month | All time — appended separately
// below since it has no `compute`, unlike every other preset].
const PRESETS: { label: string; compute: () => Bounds }[] = [
  { label: strings.datePresets.thisWeek, compute: () => thisWeekRange(new Date()) },
  { label: strings.datePresets.last7Days, compute: () => lastNDaysRange(new Date(), 7) },
  { label: strings.datePresets.lastWeek, compute: () => lastWeekRange(new Date()) },
  { label: strings.datePresets.last30Days, compute: () => lastNDaysRange(new Date(), 30) },
  { label: strings.datePresets.thisMonth, compute: () => thisMonthRange(new Date()) },
];

/** The custom-range draft's fallback window when `range` is null (All time) — never blank. */
function fallbackDraftRange(): DateRangeMs {
  const r = lastNDaysRange(new Date(), 30);
  return { from: r.start.getTime(), to: r.end.getTime() };
}

export function DateRangePicker({
  range,
  compare,
  onChange,
  triggerClassName,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [fromValue, setFromValue] = useState(() =>
    toISODate((range ?? fallbackDraftRange()).from),
  );
  const [toValue, setToValue] = useState(() =>
    toISODate((range ?? fallbackDraftRange()).to - 1),
  );

  // Re-sync the custom-range draft to the live range each time the popover
  // opens, so a previous unapplied edit never lingers into the next visit.
  // Adjusting state while rendering (React's documented pattern for
  // resetting state on a prop change) rather than in an effect — no extra
  // render, and it satisfies react-hooks/purity's set-state-in-effect check.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const draft = range ?? fallbackDraftRange();
      setFromValue(toISODate(draft.from));
      setToValue(toISODate(draft.to - 1));
    }
  }

  const prev =
    range !== null
      ? previousRange({ start: new Date(range.from), end: new Date(range.to) })
      : null;

  function applyPreset(bounds: Bounds) {
    onChange({ from: bounds.start.getTime(), to: bounds.end.getTime() }, compare);
    setOpen(false);
  }

  function applyAllTime() {
    onChange(null, false);
    setOpen(false);
  }

  function applyCustom() {
    const from = parseISODate(fromValue);
    const to = parseISODate(toValue);
    if (from === null || to === null) return;
    onChange(
      {
        from: new Date(from.y, from.m - 1, from.d).getTime(),
        to: startOfNextDay(new Date(to.y, to.m - 1, to.d)).getTime(),
      },
      compare,
    );
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={strings.header.dateRange}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-dense text-ink transition-colors duration-120 ease-out hover:bg-ink/5",
          triggerClassName,
        )}
      >
        <Calendar className="shrink-0" size={14} aria-hidden />
        <span className="min-w-0 truncate">
          {range === null
            ? strings.datePresets.allTime
            : strings.datePresets.rangeLabel(
                formatDateShort(new Date(range.from)),
                formatDateShort(new Date(range.to - 1)),
              )}
        </span>
        {compare && range !== null && prev !== null && (
          <span className="hidden shrink-0 text-muted sm:inline">
            {strings.datePresets.compareLabel(
              formatDateShort(prev.start),
              formatDateShort(new Date(prev.end.getTime() - 1)),
            )}
          </span>
        )}
        <ChevronDown className="shrink-0" size={14} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[324px]">
        <div className="grid grid-cols-2 gap-0.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.compute())}
              className="rounded-md px-2 py-1.5 text-left text-dense transition-colors duration-120 ease-out hover:bg-ink/5"
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={applyAllTime}
            className="rounded-md px-2 py-1.5 text-left text-dense transition-colors duration-120 ease-out hover:bg-ink/5"
          >
            {strings.datePresets.allTime}
          </button>
        </div>

        <div aria-hidden className="my-3 h-px bg-hair" />

        <div className="flex flex-col gap-2">
          <span className="text-caption tracking-caps text-muted uppercase">
            {strings.datePresets.customRange}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-caption text-muted">{strings.datePresets.from}</span>
              <Input
                type="date"
                value={fromValue}
                onChange={(e) => setFromValue(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-caption text-muted">{strings.datePresets.to}</span>
              <Input
                type="date"
                value={toValue}
                onChange={(e) => setToValue(e.target.value)}
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={compare}
              disabled={range === null}
              onClick={() => onChange(range, !compare)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-caption transition-colors duration-120 ease-out disabled:pointer-events-none disabled:opacity-40",
                compare
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-ink",
              )}
            >
              {strings.datePresets.compare}
            </button>
            <Button
              className="flex-1"
              onClick={applyCustom}
              disabled={fromValue === "" || toValue === ""}
            >
              {strings.datePresets.apply}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
