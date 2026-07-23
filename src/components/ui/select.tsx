"use client";

// Select: trigger styled like an input, popup below the trigger (not the
// macOS overlap — alignItemWithTrigger off), 150ms fade, elevation shadow.

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn, type WithClassName } from "../cn";

export const Select = BaseSelect.Root;
export const SelectValue = BaseSelect.Value;

export function SelectTrigger({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseSelect.Trigger>>) {
  return (
    <BaseSelect.Trigger
      className={cn(
        "flex h-8 cursor-pointer items-center justify-between gap-1.5 rounded-md border border-border bg-surface px-3 text-ink transition-colors duration-120 ease-out text-dense hover:bg-ink/4 data-popup-open:border-accent",
        className,
      )}
      {...props}
    >
      {children}
      <BaseSelect.Icon className="flex text-muted">
        <ChevronDown size={14} aria-hidden />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseSelect.Popup>>) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        sideOffset={4}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <BaseSelect.Popup
          className={cn(
            "max-h-[var(--available-height)] min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-border bg-surface py-1 text-ink shadow-pop transition-opacity duration-150 ease-out text-dense data-ending-style:opacity-0 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseSelect.Item>>) {
  return (
    <BaseSelect.Item
      className={cn(
        "grid cursor-pointer grid-cols-[16px_1fr] items-center gap-1.5 px-2.5 py-1.5 outline-none select-none data-highlighted:bg-ink/5",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemIndicator className="col-start-1 flex text-accent">
        <Check size={14} aria-hidden />
      </BaseSelect.ItemIndicator>
      <BaseSelect.ItemText className="col-start-2">
        {children}
      </BaseSelect.ItemText>
    </BaseSelect.Item>
  );
}
