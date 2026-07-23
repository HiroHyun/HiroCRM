"use client";

// Header actions slot: date-range control, Refresh, and the Import/Add lead
// triggers (their dialogs are hosted by dashboard.tsx).
// Refresh's only loading feedback is disabling itself — no spinner. Looping
// animation is avoided throughout the app, and the icon is never shown
// spinning in the approved design either.

import { Plus, RefreshCw, Upload, Users } from "lucide-react";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";
import { DateRangePicker } from "./date-range-picker";
import type { DateRangeMs } from "./dashboard-query";
import { DashboardHeaderMenu } from "./dashboard-header-menu";

export interface DashboardActionsProps {
  range: DateRangeMs | null;
  compare: boolean;
  onRangeChange: (range: DateRangeMs | null, compare: boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onAddLead: () => void;
  onImport: () => void;
  onManageReps: () => void;
}

export function DashboardActions({
  range,
  compare,
  onRangeChange,
  onRefresh,
  refreshing,
  onAddLead,
  onImport,
  onManageReps,
}: DashboardActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <DateRangePicker range={range} compare={compare} onChange={onRangeChange} />
      <Button onClick={onRefresh} disabled={refreshing}>
        <RefreshCw size={16} aria-hidden />
        {strings.header.refresh}
      </Button>
      <Button onClick={onManageReps}>
        <Users size={16} aria-hidden />
        {strings.header.manageReps}
      </Button>
      <Button onClick={onImport}>
        <Upload size={16} aria-hidden />
        {strings.header.import}
      </Button>
      <Button variant="primary" onClick={onAddLead}>
        <Plus size={16} aria-hidden />
        {strings.header.addLead}
      </Button>
    </div>
  );
}

type DashboardMobilePrimaryActionsProps = Pick<
  DashboardActionsProps,
  "onAddLead" | "onImport" | "onManageReps"
>;

export function DashboardMobilePrimaryActions({
  onAddLead,
  onImport,
  onManageReps,
}: DashboardMobilePrimaryActionsProps) {
  return (
    <>
      <Button className="h-11" variant="primary" onClick={onAddLead}>
        <Plus size={16} aria-hidden />
        {strings.header.addLead}
      </Button>
      <DashboardHeaderMenu onImport={onImport} onManageReps={onManageReps} />
    </>
  );
}

type DashboardMobileSecondaryActionsProps = Pick<
  DashboardActionsProps,
  "range" | "compare" | "onRangeChange" | "onRefresh" | "refreshing"
>;

export function DashboardMobileSecondaryActions({
  range,
  compare,
  onRangeChange,
  onRefresh,
  refreshing,
}: DashboardMobileSecondaryActionsProps) {
  return (
    <>
      <DateRangePicker
        range={range}
        compare={compare}
        onChange={onRangeChange}
        triggerClassName="h-11 min-w-0 flex-1 justify-between overflow-hidden"
      />
      <Button
        className="h-11 w-11"
        iconOnly
        title={strings.header.refresh}
        aria-label={strings.header.refresh}
        onClick={onRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={16} aria-hidden />
      </Button>
    </>
  );
}
