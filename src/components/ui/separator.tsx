// 1px rule in the border color; `hairline` for row/label separators.
// Base UI's Separator is a single component, not a compound part.

import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cn, type WithClassName } from "../cn";

export function Separator({
  className,
  hairline = false,
  orientation = "horizontal",
  ...props
}: WithClassName<React.ComponentProps<typeof BaseSeparator>> & { hairline?: boolean }) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        "shrink-0",
        hairline ? "bg-hair" : "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
