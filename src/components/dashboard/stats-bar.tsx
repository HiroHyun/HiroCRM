"use client";

// KPI stat bar: one bordered card, three hairline-divided tiles,
// figure in Bricolage 28px tabular, label 12px all-caps muted. Comparison
// subtitles carry a signed delta chip — ok-fg when positive, muted otherwise
// (never danger: a rising lead count is never itself bad news).

import type { LeadsKpis } from "../../lib/api-types";
import { strings } from "../../lib/strings";
import { cn } from "../cn";

export interface StatsBarProps {
  kpis: LeadsKpis;
  compare: boolean;
}

/** `+N` / `-N`, ASCII sign + digits only (no words, so check-copy stays clean). */
function formatSignedCount(diff: number): string {
  return `${diff >= 0 ? "+" : "-"}${Math.abs(diff)}`;
}

/**
 * Signed absolute delta, e.g. `+38`; appends a percent, e.g. `+38 (+12%)`,
 * only once the comparison base is large enough for a percentage to mean
 * anything (base >= 10). base === 0 is
 * covered by the same guard (divide-by-zero safe).
 */
function formatDelta(diff: number, base: number): string {
  const count = formatSignedCount(diff);
  if (base < 10) return count;
  const pct = Math.round((Math.abs(diff) / base) * 100);
  return `${count} (${diff >= 0 ? "+" : "-"}${pct}%)`;
}

/** Positive delta reads as good news (ok-fg); zero/negative stay muted. */
function deltaTone(diff: number): string {
  return diff > 0 ? "text-ok-fg" : "text-muted";
}

function Tile({
  label,
  figure,
  subtitleText,
  chipText,
  chipTone,
  className,
}: {
  label: string;
  figure: number;
  subtitleText?: string;
  chipText?: string;
  chipTone?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 p-4", className)}>
      <span className="text-caption tracking-caps text-muted uppercase">
        {label}
      </span>
      <span className="font-display text-kpi tabular-nums text-ink">
        {figure}
      </span>
      {subtitleText !== undefined && (
        <span className="flex items-center gap-1.5 text-caption text-muted tabular-nums">
          {subtitleText}
          {chipText !== undefined && (
            <span className={cn("tabular-nums", chipTone)}>{chipText}</span>
          )}
        </span>
      )}
    </div>
  );
}

export function StatsBar({ kpis, compare }: StatsBarProps) {
  const showCompare = compare && kpis.compareCount != null;
  const compareDiff = showCompare ? kpis.total - kpis.compareCount! : 0;
  const assignedDiff = kpis.assignedThisWeek - kpis.assignedLastWeek;

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="grid grid-cols-2 sm:grid-cols-3">
        <Tile
          label={strings.kpi.totalLeads}
          figure={kpis.total}
          subtitleText={
            showCompare
              ? strings.kpi.vsPrevious(String(kpis.compareCount))
              : undefined
          }
          chipText={
            showCompare ? formatDelta(compareDiff, kpis.compareCount!) : undefined
          }
          chipTone={showCompare ? deltaTone(compareDiff) : undefined}
        />
        <Tile
          className="border-l border-hair"
          label={strings.kpi.slaOverdue}
          figure={kpis.overdue}
          subtitleText={
            kpis.dueSoon > 0
              ? strings.kpi.ofActiveDueSoon(String(kpis.active), String(kpis.dueSoon))
              : strings.kpi.ofActive(String(kpis.active))
          }
        />
        <Tile
          className="col-span-2 border-t border-hair sm:col-span-1 sm:border-t-0 sm:border-l"
          label={strings.kpi.assignedThisWeek}
          figure={kpis.assignedThisWeek}
          subtitleText={strings.kpi.vsLastWeek(String(kpis.assignedLastWeek))}
          chipText={formatDelta(assignedDiff, kpis.assignedLastWeek)}
          chipTone={deltaTone(assignedDiff)}
        />
      </div>
    </div>
  );
}
