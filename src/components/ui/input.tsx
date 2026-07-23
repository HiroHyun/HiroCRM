// Text input: 32px, 8px radius, 16px on phones to prevent viewport zoom,
// then the 14px body token from sm upward. Focus is the accent border.

import { cn } from "../cn";

export function Input({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-8 w-full rounded-md border border-border bg-surface px-3 text-[16px] text-ink outline-none transition-colors duration-120 ease-out placeholder:text-muted focus:border-accent disabled:pointer-events-none disabled:opacity-40 sm:text-body",
        className,
      )}
      {...props}
    />
  );
}
