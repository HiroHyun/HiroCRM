"use client";

// Dialog: surface popup, 8px radius, the one allowed elevation
// shadow, 150ms fade + 2% scale; title in Bricolage 20px. Base UI keeps the
// popup mounted through exit via data-starting-style/data-ending-style.

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn, type WithClassName } from "../cn";

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogContent({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseDialog.Popup>>) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-6 text-ink shadow-pop transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseDialog.Title>>) {
  return (
    <BaseDialog.Title
      className={cn("font-display font-semibold text-title", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseDialog.Description>>) {
  return (
    <BaseDialog.Description
      className={cn("mt-2 text-muted text-body", className)}
      {...props}
    />
  );
}
