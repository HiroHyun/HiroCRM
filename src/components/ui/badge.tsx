// Status/rating badges: 18px, 6px radius, 12px/500, tinted background
// + same-hue foreground eased toward ink (the export's approved rendering).
// Tones key off the status module's color tokens — nothing re-enumerates them.

import type { StatusColorToken } from "../../lib/status";
import { cn } from "../cn";

const TONE_CLASSES: Record<StatusColorToken, string> = {
  success: "bg-ok/14 text-ok-fg",
  warn: "bg-warn/14 text-warn-fg",
  danger: "bg-danger/13 text-danger-fg",
  info: "bg-accent/12 text-accent",
  muted: "bg-ink/7 text-muted",
};

export interface BadgeProps extends React.ComponentProps<"span"> {
  tone: StatusColorToken;
  /** Status badges carry the leading dot; rating badges don't. */
  dot?: boolean;
}

export function Badge({
  tone,
  dot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-4.5 w-fit items-center gap-1.5 rounded px-2 font-medium whitespace-nowrap text-caption",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}
