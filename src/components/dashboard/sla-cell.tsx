"use client";

// Status & SLA cell: a status badge on top, the running SLA line below —
// softened toward ink (full-strength signal belongs to
// badges only"). SLA state and copy come from lib/sla + lib/dates; nothing
// here re-derives the deadline math.

import { formatDuration } from "../../lib/dates";
import { DUE_SOON_MS, getSlaState } from "../../lib/sla";
import { STATUSES } from "../../lib/status";
import { strings } from "../../lib/strings";
import type { LeadRowWire } from "../../lib/api-types";
import type { SlaConfig } from "../../lib/types";
import { cn } from "../cn";
import { Badge } from "../ui/badge";

export interface SlaCellProps {
  row: LeadRowWire;
  slaConfig: SlaConfig;
  now: number;
}

export function SlaCell({ row, slaConfig, now }: SlaCellProps) {
  const state = getSlaState(
    {
      createdAt: row.createdAt,
      touchpointCount: row.touchpointCount,
      lastTouchpointAt: row.lastTouchpointAt,
      status: row.followUpStatus,
    },
    now,
    slaConfig,
  );

  const statusDef = STATUSES.find((s) => s.value === row.followUpStatus)!;

  let slaText: string;
  let slaClass: string;
  switch (state.kind) {
    case "terminal":
      slaText = strings.sla.none;
      slaClass = "text-muted";
      break;
    case "complete":
      slaText = strings.sla.complete;
      slaClass = "text-muted";
      break;
    case "due":
      slaText = strings.sla.dueIn(formatDuration(state.msRemaining));
      slaClass =
        state.msRemaining < DUE_SOON_MS ? "text-sla-due-soon" : "text-muted";
      break;
    case "overdue":
      slaText = strings.sla.overdue(formatDuration(state.msOverdue));
      slaClass = "text-sla-overdue";
      break;
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge tone={statusDef.colorToken} dot>
        {statusDef.label}
      </Badge>
      <span className={cn("text-caption tabular-nums leading-[1.15] whitespace-nowrap", slaClass)}>
        {slaText}
      </span>
    </div>
  );
}
