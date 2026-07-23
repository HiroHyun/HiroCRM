"use client";

// Filter row: view tabs with an accent
// underline that overlaps the bar's own bottom rule, a rating segmented
// control, the rep dropdown, and search pinned to the far right.

import { Search } from "lucide-react";
import type { LeadView } from "../../server/lead-query";
import type { Rating } from "../../lib/types";
import { strings } from "../../lib/strings";
import { cn } from "../cn";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type RatingFilter = Rating | "unknown" | null;

export interface FilterBarProps {
  view: LeadView;
  onViewChange: (v: LeadView) => void;
  rating: RatingFilter;
  onRatingChange: (r: RatingFilter) => void;
  rep: string | null;
  reps: { id: string; name: string }[];
  onRepChange: (rep: string | null) => void;
  search: string;
  onSearchChange: (s: string) => void;
}

const VIEW_OPTIONS: { value: LeadView; label: string }[] = [
  { value: "all", label: strings.views.all },
  { value: "active", label: strings.views.active },
  { value: "overdue", label: strings.views.overdue },
  { value: "closed", label: strings.views.closed },
];

const RATING_OPTIONS: { value: RatingFilter; label: string }[] = [
  { value: null, label: strings.views.all },
  { value: "A", label: strings.rating.A },
  { value: "B", label: strings.rating.B },
  { value: "C", label: strings.rating.C },
  { value: "unknown", label: strings.rating.unknown },
];

export function FilterBar({
  view,
  onViewChange,
  rating,
  onRatingChange,
  rep,
  reps,
  onRepChange,
  search,
  onSearchChange,
}: FilterBarProps) {
  const repItems = [
    { value: null as string | null, label: strings.filters.allReps },
    ...reps.map((r) => ({ value: r.id as string | null, label: r.name })),
  ];

  return (
    <div className="flex flex-wrap items-end gap-4 border-b border-border">
      <nav className="flex items-end gap-1">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onViewChange(opt.value)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 text-dense font-medium transition-colors duration-120 ease-out",
              opt.value === view
                ? "border-accent text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-2 pb-2">
        <span className="text-caption text-muted">{strings.filters.rating}</span>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-border p-0.5">
          {RATING_OPTIONS.map((opt) => (
            <button
              key={opt.value ?? "__all"}
              type="button"
              onClick={() => onRatingChange(opt.value)}
              className={cn(
                "rounded-full px-2 py-0.5 text-caption transition-colors duration-120 ease-out",
                opt.value === rating
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-muted hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pb-2">
        <Select
          value={rep}
          onValueChange={(v) => onRepChange(v as string | null)}
          items={repItems}
          modal={false}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {repItems.map((it) => (
              <SelectItem key={it.value ?? "__all"} value={it.value}>
                {it.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pb-2">
        <div className="relative w-[230px]">
          <Search
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <Input
            className="pl-8"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={strings.filters.searchPlaceholder}
          />
        </div>
      </div>
    </div>
  );
}
