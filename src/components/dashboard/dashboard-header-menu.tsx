"use client";

import { LogOut, Menu as MenuIcon, Upload, Users } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRef, useState } from "react";
import { strings } from "../../lib/strings";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "../ui/menu";

export interface DashboardHeaderMenuProps {
  onManageReps: () => void;
  onImport: () => void;
}

const ITEM_CLASS_NAME =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-dense text-muted outline-none select-none transition-colors duration-120 ease-out data-highlighted:bg-ink/5 data-highlighted:text-ink";

export function DashboardHeaderMenu({
  onManageReps,
  onImport,
}: DashboardHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const suppressReturnFocus = useRef(false);

  function closeThenRun(action: () => void) {
    pendingAction.current = action;
    suppressReturnFocus.current = true;
    setOpen(false);
  }

  function handleOpenChangeComplete(nextOpen: boolean) {
    if (nextOpen) return;
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action === null) return;

    // Base UI reports close completion as its popup begins unmounting. Run
    // the selected action in the next task so focus cleanup finishes before
    // a dialog takes focus or navigation begins.
    globalThis.setTimeout(() => {
      try {
        action();
      } finally {
        suppressReturnFocus.current = false;
      }
    }, 0);
  }

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <MenuTrigger
        type="button"
        className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-ink transition-colors duration-120 ease-out hover:bg-ink/5"
        aria-label={strings.header.openMenu}
        title={strings.header.openMenu}
      >
        <MenuIcon size={18} aria-hidden />
      </MenuTrigger>
      <MenuContent finalFocus={() => !suppressReturnFocus.current}>
        <MenuItem
          className={ITEM_CLASS_NAME}
          closeOnClick={false}
          onClick={() => closeThenRun(onManageReps)}
        >
          <Users size={16} aria-hidden />
          {strings.header.manageReps}
        </MenuItem>
        <MenuItem
          className={ITEM_CLASS_NAME}
          closeOnClick={false}
          onClick={() => closeThenRun(onImport)}
        >
          <Upload size={16} aria-hidden />
          {strings.header.import}
        </MenuItem>
        <MenuItem
          className={ITEM_CLASS_NAME}
          closeOnClick={false}
          onClick={() =>
            closeThenRun(() => void signOut({ callbackUrl: "/login" }))
          }
        >
          <LogOut size={16} aria-hidden />
          {strings.auth.signOut}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
