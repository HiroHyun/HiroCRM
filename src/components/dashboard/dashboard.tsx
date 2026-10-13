"use client";

// The dashboard state owner (step 4 package b): owns every filter/sort/page/
// compare piece of state, debounces search, fetches GET /api/leads with
// abort-on-supersede, and wires the six presentational components together.
// Those components stay pure — all fetching and state lives here.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PAGE_SIZE,
  type LeadsKpis,
  type LeadsListResponse,
  type RepWire,
  type RepsListResponse,
} from "../../lib/api-types";
import { lastNDaysRange } from "../../lib/dates";
import { DEFAULT_SLA_CONFIG } from "../../lib/sla";
import { strings } from "../../lib/strings";
import type { LeadSort } from "../../server/lead-query";
import { AppHeader } from "../app-header";
import { AddLeadDialog } from "../dialogs/add-lead-dialog";
import { ImportDialog } from "../dialogs/import-dialog";
import { LeadDetailDialog } from "../dialogs/lead-detail-dialog";
import { ManageRepsDialog } from "../dialogs/manage-reps-dialog";
import { FilterBar } from "./filter-bar";
import { LeadTable } from "./lead-table";
import { Pagination } from "./pagination";
import { StatsBar } from "./stats-bar";
import {
  DashboardActions,
  type DashboardActionsProps,
  DashboardMobilePrimaryActions,
  DashboardMobileSecondaryActions,
} from "./dashboard-actions";
import { buildLeadsQuery, type QueryState } from "./dashboard-query";

const EMPTY_KPIS: LeadsKpis = {
  total: 0,
  overdue: 0,
  active: 0,
  dueSoon: 0,
  assignedThisWeek: 0,
  assignedLastWeek: 0,
  compareCount: null,
} satisfies LeadsKpis;

function initialQueryState(): QueryState {
  const range = lastNDaysRange(new Date(), 30);
  return {
    view: "all",
    rating: null,
    rep: null,
    search: "",
    range: { from: range.start.getTime(), to: range.end.getTime() },
    compare: false,
    sort: "createdAt",
    dir: "desc",
    page: 1,
  };
}

export function Dashboard() {
  const router = useRouter();

  // No explicit useState<T> generics here — TS infers QueryState from the
  // lazy initializer's return type, and the payload cast below dodges
  // check-copy's naive JSX-angle-bracket scanner (two adjacent `<T>` runs
  // read as one giant "JSX text node" otherwise).
  const [state, setState] = useState(initialQueryState);
  const [searchInput, setSearchInput] = useState("");

  const [payload, setPayload] = useState(null as LeadsListResponse | null);
  const [roster, setRoster] = useState([] as RepWire[]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [failed, setFailed] = useState(false);

  const [refreshNonce, setRefreshNonce] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [manageRepsOpen, setManageRepsOpen] = useState(false);
  const [detailLeadId, setDetailLeadId] = useState(null as string | null);
  const [detailOpen, setDetailOpen] = useState(false);
  // Block body (not a bare `() => Date.now()` expression) so the lazy
  // initializer's `=>` isn't immediately followed by unbroken text running
  // into the next `<` (check-copy's naive JSX-text scanner, see note above).
  const [now, setNow] = useState(() => {
    return Date.now();
  });

  /** Any filter/sort/rating/rep/range/compare change resets to page 1. */
  function patch(p: Partial<QueryState>) {
    setState((prev) => ({ ...prev, ...p, page: 1 }));
  }

  // Reused by every write-path dialog (save/delete/touchpoint/import) to
  // force the list + KPIs to refetch after a mutation.
  function handleMutated() {
    setRefreshNonce((n) => n + 1);
  }

  function handleRowClick(leadId: string) {
    setDetailLeadId(leadId);
    setDetailOpen(true);
  }

  function handleViewLead(leadId: string) {
    setAddOpen(false);
    setDetailLeadId(leadId);
    setDetailOpen(true);
  }

  function handlePageChange(page: number) {
    setState((prev) => ({ ...prev, page }));
  }

  function handleSortChange(column: LeadSort) {
    setState((prev) => {
      if (column === prev.sort) {
        return { ...prev, dir: prev.dir === "asc" ? "desc" : "asc", page: 1 };
      }
      return {
        ...prev,
        sort: column,
        dir: column === "createdAt" ? "desc" : "asc",
        page: 1,
      };
    });
  }

  // Debounce the search box (~250ms) into the query state that actually
  // drives the fetch, so every keystroke doesn't fire a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      setState((prev) =>
        prev.search === searchInput ? prev : { ...prev, search: searchInput, page: 1 },
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = buildLeadsQuery(state).toString();

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setFetching(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/leads?${query}`, {
          signal: controller.signal,
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setFailed(true);
          toast.error(strings.table.loadFailed);
          return;
        }
        const data: LeadsListResponse = await res.json();
        if (controller.signal.aborted) return;
        setPayload(data);
        setState((prev) => prev.page === data.page ? prev : { ...prev, page: data.page });
        setNow(Date.now());
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setFailed(true);
        toast.error(strings.table.loadFailed);
      } finally {
        if (!controller.signal.aborted) {
          setFetching(false);
          setInitialLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [query, refreshNonce, router]);

  // Standalone roster refresh — callable on-demand (e.g. after a rep is
  // quick-added) without bumping refreshNonce, which would also refetch the
  // leads list. `signal` is optional so callers outside an effect can still
  // use it without owning an AbortController. useCallback keeps this a
  // stable dependency for the effect below (no eslint-disable needed).
  const refreshRoster = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch("/api/reps", { signal });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) return;
        const data: RepsListResponse = await res.json();
        if (signal?.aborted) return;
        setRoster(data.reps);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    },
    [router],
  );

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      await refreshRoster(controller.signal);
    })();
    return () => controller.abort();
  }, [refreshNonce, refreshRoster]);

  const headerActionProps: DashboardActionsProps = {
    range: state.range,
    compare: state.compare,
    onRangeChange: (range, compare) => patch({ range, compare }),
    onRefresh: () => setRefreshNonce((n) => n + 1),
    refreshing: fetching,
    onAddLead: () => setAddOpen(true),
    onImport: () => setImportOpen(true),
    onManageReps: () => setManageRepsOpen(true),
  };

  return (
    <>
      <AppHeader
        desktopActions={<DashboardActions {...headerActionProps} />}
        mobilePrimaryActions={
          <DashboardMobilePrimaryActions {...headerActionProps} />
        }
        mobileSecondaryActions={
          <DashboardMobileSecondaryActions {...headerActionProps} />
        }
      />
      <main className="mx-auto flex w-full min-w-0 max-w-[1376px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <StatsBar kpis={payload?.kpis ?? EMPTY_KPIS} compare={state.compare} />
        <FilterBar
          view={state.view}
          onViewChange={(v) => patch({ view: v })}
          rating={state.rating}
          onRatingChange={(r) => patch({ rating: r })}
          rep={state.rep}
          reps={payload?.reps ?? []}
          onRepChange={(rep) => patch({ rep })}
          search={searchInput}
          onSearchChange={setSearchInput}
        />
        <LeadTable
          leads={payload?.leads ?? []}
          slaConfig={payload?.slaConfig ?? DEFAULT_SLA_CONFIG}
          sort={state.sort}
          dir={state.dir}
          onSortChange={handleSortChange}
          initialLoading={initialLoading}
          fetching={fetching}
          failed={failed}
          now={now}
          onRowClick={handleRowClick}
        />
        <Pagination
          page={state.page}
          pageCount={payload?.pageCount ?? 1}
          pageSize={payload?.pageSize ?? PAGE_SIZE}
          total={payload?.kpis.total ?? 0}
          onPageChange={handlePageChange}
        />
      </main>
      <AddLeadDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        reps={roster}
        onCreated={handleMutated}
        onViewLead={handleViewLead}
        onRepCreated={() => void refreshRoster()}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleMutated}
      />
      <ManageRepsDialog
        open={manageRepsOpen}
        onOpenChange={setManageRepsOpen}
        onMutated={handleMutated}
      />
      {detailLeadId !== null && (
        <LeadDetailDialog
          key={detailLeadId}
          leadId={detailLeadId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onOpenChangeComplete={(o) => {
            if (!o) setDetailLeadId(null);
          }}
          slaConfig={payload?.slaConfig ?? DEFAULT_SLA_CONFIG}
          reps={roster}
          onMutated={handleMutated}
        />
      )}
    </>
  );
}
