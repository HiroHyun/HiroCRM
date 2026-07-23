// Header shell: renders identity, theme toggle, and sign out directly; the
// date-range picker, Refresh, Import, and Add-lead controls are supplied by
// the caller via the desktopActions / mobile*Actions props.
// The backdrop blur here is deliberate: it's the only surface in the app
// that uses blur, allowed because the header is sticky and needs to stay
// legible while content scrolls beneath it.

import { strings } from "../lib/strings";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

export interface AppHeaderProps {
  desktopActions?: React.ReactNode;
  mobilePrimaryActions?: React.ReactNode;
  mobileSecondaryActions?: React.ReactNode;
}

export function AppHeader({
  desktopActions,
  mobilePrimaryActions,
  mobileSecondaryActions,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/86 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6">
        <div className="shrink-0">
          <Wordmark />
        </div>
        <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-hair xl:block" />
        <span className="hidden text-caption whitespace-nowrap text-muted xl:block">
          {strings.app.tagline}
        </span>
        <div className="min-w-0 flex-1" />
        <ThemeToggle className="h-11 w-11 lg:h-8 lg:w-8" />
        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <SignOutButton />
          {desktopActions && (
            <span aria-hidden className="mx-1 h-5 w-px bg-hair" />
          )}
          {desktopActions}
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
          {mobilePrimaryActions}
        </div>
      </div>
      {mobileSecondaryActions && (
        <div className="flex h-12 items-center gap-2 border-t border-hair px-4 sm:px-6 lg:hidden">
          {mobileSecondaryActions}
        </div>
      )}
    </header>
  );
}
