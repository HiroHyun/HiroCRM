"use client";

// The lead ledger — the lead table is the app. Sticky Contact
// column + horizontal scroll keeps 360px usable; sort state and
// loading/refetch treatment are driven entirely by props — this component
// never fetches.

import { ArrowDown, ArrowUp } from "lucide-react";
import { formatContactDisplay } from "../../lib/contact";
import { formatDate } from "../../lib/dates";
import { strings } from "../../lib/strings";
import type { LeadRowWire } from "../../lib/api-types";
import type { SlaConfig } from "../../lib/types";
import type { LeadSort, SortDir } from "../../server/lead-query";
import { cn } from "../cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { LedgerDots } from "./ledger-dots";
import { SlaCell } from "./sla-cell";

export interface LeadTableProps {
  leads: LeadRowWire[];
  slaConfig: SlaConfig;
  sort: LeadSort;
  dir: SortDir;
  onSortChange: (column: LeadSort) => void;
  initialLoading: boolean;
  fetching: boolean;
  failed: boolean;
  now: number;
  onRowClick: (leadId: string) => void;
}

const COLUMN_COUNT = 8;

function ariaSortFor(column: LeadSort, sort: LeadSort, dir: SortDir) {
  if (column !== sort) return undefined;
  return dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

function SortButton({
  column,
  label,
  sort,
  dir,
  onSortChange,
}: {
  column: LeadSort;
  label: string;
  sort: LeadSort;
  dir: SortDir;
  onSortChange: (column: LeadSort) => void;
}) {
  const active = column === sort;
  return (
    <button
      type="button"
      onClick={() => onSortChange(column)}
      className="inline-flex items-center gap-1"
    >
      {label}
      {active &&
        (dir === "asc" ? (
          <ArrowUp size={14} aria-hidden />
        ) : (
          <ArrowDown size={14} aria-hidden />
        ))}
    </button>
  );
}

export function LeadTable({
  leads,
  slaConfig,
  sort,
  dir,
  onSortChange,
  initialLoading,
  fetching,
  failed,
  now,
  onRowClick,
}: LeadTableProps) {
  const showingRows = !failed && !initialLoading && leads.length !== 0;
  const isDimmed = fetching && showingRows;

  // Body-state precedence resolved outside the JSX tree — an if/else chain
  // keeps each branch's markup free of adjacent-element ternary glue, which
  // check-copy's JSX-text scanner would otherwise mistake for hardcoded copy.
  let tableBody: React.ReactNode;
  if (failed) {
    tableBody = (
      <TableRow>
        <TableCell
          colSpan={COLUMN_COUNT}
          className="py-8 text-center text-caption text-muted"
        >
          {strings.table.loadFailed}
        </TableCell>
      </TableRow>
    );
  } else if (initialLoading) {
    tableBody = (
      <TableRow>
        <TableCell
          colSpan={COLUMN_COUNT}
          className="py-8 text-center text-caption text-muted"
        >
          {strings.table.loading}
        </TableCell>
      </TableRow>
    );
  } else if (leads.length === 0) {
    tableBody = (
      <TableRow>
        <TableCell
          colSpan={COLUMN_COUNT}
          className="py-8 text-center text-caption text-muted"
        >
          {strings.table.empty}
        </TableCell>
      </TableRow>
    );
  } else {
    tableBody = leads.map((row) => (
      <TableRow
        key={row.id}
        onClick={() => onRowClick(row.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onRowClick(row.id);
        }}
        tabIndex={0}
        role="button"
        aria-label={strings.table.openLead(formatContactDisplay(row.contactInfo))}
        className="cursor-pointer"
      >
        <TableCell className="whitespace-nowrap text-caption tabular-nums text-muted">
          {formatDate(new Date(row.createdAt))}
        </TableCell>
        <TableCell className="truncate">{row.country}</TableCell>
        <TableCell className="sticky left-0 z-10 truncate bg-surface font-mono text-caption group-hover:bg-row-hover">
          {formatContactDisplay(row.contactInfo)}
        </TableCell>
        <TableCell className="truncate">{row.interest}</TableCell>
        <TableCell className="whitespace-nowrap">{row.repName}</TableCell>
        <TableCell>
          <SlaCell row={row} slaConfig={slaConfig} now={now} />
        </TableCell>
        <TableCell>
          <span
            className={cn(
              "inline-flex h-[18px] items-center rounded px-2 text-caption",
              row.rating != null
                ? "bg-ink/7 font-medium text-ink"
                : "bg-ink/4 font-normal text-muted",
            )}
          >
            {row.rating != null
              ? strings.rating[row.rating]
              : strings.rating.unknown}
          </span>
        </TableCell>
        <TableCell>
          <LedgerDots
            count={row.touchpointCount}
            cap={slaConfig.responseCap}
            hasScreenshots={row.screenshotUrls.length > 0}
          />
        </TableCell>
      </TableRow>
    ));
  }

  return (
    <div
      className="overflow-x-auto rounded-md border border-border bg-surface"
      aria-busy={isDimmed ? true : undefined}
    >
      <Table className="min-w-[1200px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead
              className="w-[96px]"
              aria-sort={ariaSortFor("createdAt", sort, dir)}
            >
              <SortButton
                column="createdAt"
                label={strings.table.created}
                sort={sort}
                dir={dir}
                onSortChange={onSortChange}
              />
            </TableHead>
            <TableHead
              className="w-[142px]"
              aria-sort={ariaSortFor("country", sort, dir)}
            >
              <SortButton
                column="country"
                label={strings.table.country}
                sort={sort}
                dir={dir}
                onSortChange={onSortChange}
              />
            </TableHead>
            <TableHead className="sticky left-0 z-20 w-[17%] min-w-[192px] bg-bg">
              {strings.table.contact}
            </TableHead>
            <TableHead>{strings.table.interest}</TableHead>
            <TableHead
              className="w-[110px]"
              aria-sort={ariaSortFor("repName", sort, dir)}
            >
              <SortButton
                column="repName"
                label={strings.table.assigned}
                sort={sort}
                dir={dir}
                onSortChange={onSortChange}
              />
            </TableHead>
            <TableHead
              className="w-[178px]"
              aria-sort={ariaSortFor("sla", sort, dir)}
            >
              <SortButton
                column="sla"
                label={strings.table.statusSla}
                sort={sort}
                dir={dir}
                onSortChange={onSortChange}
              />
            </TableHead>
            <TableHead
              className="w-[104px]"
              aria-sort={ariaSortFor("rating", sort, dir)}
            >
              <SortButton
                column="rating"
                label={strings.table.rating}
                sort={sort}
                dir={dir}
                onSortChange={onSortChange}
              />
            </TableHead>
            <TableHead className="w-[110px]">{strings.table.ledger}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody
          className={cn(
            "[&>tr:last-child>td]:border-b-0",
            isDimmed && "opacity-60",
          )}
        >
          {tableBody}
        </TableBody>
      </Table>
    </div>
  );
}
