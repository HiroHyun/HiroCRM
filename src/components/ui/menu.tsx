"use client";

// Menu shell aligned with the existing popover treatment. Base UI owns
// keyboard navigation, focus restoration, dismissal, and modal behavior.

import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn, type WithClassName } from "../cn";

export const Menu = BaseMenu.Root;
export const MenuTrigger = BaseMenu.Trigger;
export const MenuItem = BaseMenu.Item;

type MenuContentProps = WithClassName<React.ComponentProps<typeof BaseMenu.Popup>> &
  Pick<
    WithClassName<React.ComponentProps<typeof BaseMenu.Positioner>>,
    "sideOffset" | "align" | "side"
  >;

export function MenuContent({
  className,
  sideOffset = 8,
  align = "end",
  side = "bottom",
  children,
  ...props
}: MenuContentProps) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        sideOffset={sideOffset}
        align={align}
        side={side}
        className="z-50"
      >
        <BaseMenu.Popup
          className={cn(
            "min-w-48 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-surface p-1 text-ink shadow-pop transition-[opacity,translate] duration-150 ease-out data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0",
            className,
          )}
          {...props}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}
