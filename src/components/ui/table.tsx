// Table primitives encoding the ledger density: 36px uppercase header on the
// page background, 40px rows, 13px text, hairline dividers, accent-tinted
// hover. border-separate (not border-collapse) so dividers/hover live on
// cells, not the collapsed border grid — required for the lead table's
// sticky Contact column (step 4) to stay opaque and hover-tinted while its
// neighbors scroll underneath. The lead table itself is step 4 — this is
// only the visual language.

import { cn } from "../cn";

export function Table({
  className,
  ...props
}: React.ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full border-separate border-spacing-0 text-dense", className)}
      {...props}
    />
  );
}

export function TableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return <thead className={cn("bg-bg", className)} {...props} />;
}

export function TableBody(props: React.ComponentProps<"tbody">) {
  return <tbody {...props} />;
}

export function TableRow({
  className,
  ...props
}: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("group transition-colors duration-120 ease-out", className)}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-9 px-2 text-left align-middle font-medium tracking-caps uppercase text-caption text-muted first:pl-4 last:pr-4 border-b border-border",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td
      className={cn(
        "py-2.5 px-2 align-middle first:pl-4 last:pr-4 border-b border-hair group-hover:bg-row-hover",
        className,
      )}
      {...props}
    />
  );
}
