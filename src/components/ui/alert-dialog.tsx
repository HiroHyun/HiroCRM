"use client";

// Confirm dialog (delete flows) — the dialog skin on Base UI's AlertDialog,
// which is non-dismissable by outside click and wires the alertdialog role.

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn, type WithClassName } from "../cn";

export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogClose = BaseAlertDialog.Close;

export function AlertDialogContent({
  className,
  children,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseAlertDialog.Popup>>) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-150 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <BaseAlertDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-6 text-ink shadow-pop transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
      </BaseAlertDialog.Popup>
    </BaseAlertDialog.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseAlertDialog.Title>>) {
  return (
    <BaseAlertDialog.Title
      className={cn("font-display font-semibold text-title", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseAlertDialog.Description>>) {
  return (
    <BaseAlertDialog.Description
      className={cn("mt-2 text-muted text-body", className)}
      {...props}
    />
  );
}
