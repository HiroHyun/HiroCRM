// Multi-line sibling of Input: same responsive type treatment, min-height,
// and vertical resize.
import { cn } from "../cn";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-[72px] w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-[16px] text-ink outline-none transition-colors duration-120 ease-out placeholder:text-muted focus:border-accent disabled:pointer-events-none disabled:opacity-40 sm:text-body",
        className,
      )}
      {...props}
    />
  );
}
