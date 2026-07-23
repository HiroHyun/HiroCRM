"use client";

// The ●●○ response ledger: `cap` dots, muted → accent fill as
// touchpoints land, capped so a lead well past the cap never overflows the
// row. A trailing screenshot glyph marks leads with attached evidence.

import { Image } from "lucide-react";
import { strings } from "../../lib/strings";

export interface LedgerDotsProps {
  count: number;
  cap: number;
  hasScreenshots: boolean;
}

export function LedgerDots({ count, cap, hasScreenshots }: LedgerDotsProps) {
  const filled = Math.min(count, cap);

  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className="inline-flex items-center gap-1">
        {Array.from({ length: cap }, (_, i) => (
          <span
            key={i}
            className={
              i < filled
                ? "size-[7px] rounded-full border border-accent bg-accent"
                : "size-[7px] rounded-full border border-muted/45"
            }
          />
        ))}
      </span>
      {hasScreenshots && (
        <Image
          size={14}
          className="text-muted"
          aria-label={strings.table.screenshots}
        />
      )}
    </span>
  );
}
