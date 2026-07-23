// Quiet progress bar (step-5 import dialog): neutral track, accent fill.
// Base UI's Indicator sizes its own width from the value.

import { Progress as BaseProgress } from "@base-ui/react/progress";
import { cn, type WithClassName } from "../cn";

export function Progress({
  className,
  ...props
}: WithClassName<React.ComponentProps<typeof BaseProgress.Root>>) {
  return (
    <BaseProgress.Root className={cn("block w-full", className)} {...props}>
      <BaseProgress.Track className="block h-1.5 w-full overflow-hidden rounded-full bg-ink/7">
        <BaseProgress.Indicator className="block h-full rounded-full bg-accent transition-[width] duration-150 ease-out" />
      </BaseProgress.Track>
    </BaseProgress.Root>
  );
}
