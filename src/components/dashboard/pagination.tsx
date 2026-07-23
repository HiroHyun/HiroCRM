"use client";

// Pagination footer: a muted "Showing" line on the left, and a
// compact first/prev/[jump]/next/last control set on the right — never a
// page-number button row, which this design deliberately avoids.

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useState } from "react";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";

export interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const [draft, setDraft] = useState(String(page));
  const [prevPage, setPrevPage] = useState(page);

  if (page !== prevPage) {
    setPrevPage(page);
    setDraft(String(page));
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function commit() {
    const parsed = Number(draft);
    if (draft.trim() !== "" && Number.isInteger(parsed)) {
      const clamped = Math.min(Math.max(1, parsed), pageCount);
      onPageChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(page));
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-dense tabular-nums text-muted">
        {strings.pagination.showing(String(from), String(to), String(total))}
      </span>
      <div className="flex items-center justify-between gap-1 sm:justify-start">
        <Button
          variant="ghost"
          iconOnly
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={strings.pagination.firstPage}
          aria-label={strings.pagination.firstPage}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft size={14} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={strings.pagination.previousPage}
          aria-label={strings.pagination.previousPage}
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft size={14} aria-hidden />
        </Button>
        <span className="text-dense text-muted">{strings.pagination.page}</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          aria-label={strings.pagination.pageNumber}
          className="h-11 w-[34px] rounded-md border border-border bg-surface text-center font-mono text-[16px] tabular-nums outline-none transition-colors duration-120 ease-out focus:border-accent sm:h-8 sm:text-dense"
        />
        <span className="text-dense tabular-nums text-muted">
          {strings.pagination.pageOf(String(pageCount))}
        </span>
        <Button
          variant="ghost"
          iconOnly
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={strings.pagination.nextPage}
          aria-label={strings.pagination.nextPage}
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        >
          <ChevronRight size={14} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          iconOnly
          className="h-11 w-11 sm:h-8 sm:w-8"
          title={strings.pagination.lastPage}
          aria-label={strings.pagination.lastPage}
          disabled={page >= pageCount}
          onClick={() => onPageChange(pageCount)}
        >
          <ChevronsRight size={14} aria-hidden />
        </Button>
      </div>
    </div>
  );
}
