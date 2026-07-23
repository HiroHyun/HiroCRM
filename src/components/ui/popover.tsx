"use client";

// Popover: fade + 4px translate, surface + border + the one allowed
// elevation shadow. Popup must sit inside the Positioner (Base UI contract).

import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn, type WithClassName } from "../cn";

export const Popover = BasePopover.Root;
export const PopoverTrigger = BasePopover.Trigger;
export const PopoverClose = BasePopover.Close;

type PopoverContentProps = WithClassName<React.ComponentProps<typeof BasePopover.Popup>> &
  Pick<
    WithClassName<React.ComponentProps<typeof BasePopover.Positioner>>,
    "sideOffset" | "align" | "side"
  >;

export function PopoverContent({
  className,
  sideOffset = 4,
  align,
  side,
  children,
  ...props
}: PopoverContentProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        sideOffset={sideOffset}
        align={align}
        side={side}
        className="z-50"
      >
        <BasePopover.Popup
          className={cn(
            "rounded-md border border-border bg-surface p-4 text-ink shadow-pop transition-[opacity,translate] duration-150 ease-out data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}
