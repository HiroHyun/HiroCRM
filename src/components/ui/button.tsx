// Buttons per the approved export: 32px, 8px radius, 13px/500, 1px border,
// 120ms ease-out. Focus ring comes from the global :focus-visible rule.

import { cn } from "../cn";

export type ButtonVariant = "default" | "primary" | "ghost";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default: "border-border bg-surface text-ink hover:bg-ink/5",
  primary:
    "border-accent bg-accent text-onacc hover:border-accent-h hover:bg-accent-h",
  ghost: "border-transparent text-muted hover:bg-ink/5 hover:text-ink",
};

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  /** 32×32 icon-only square (export `.icb`). */
  iconOnly?: boolean;
}

export function Button({
  variant = "default",
  iconOnly = false,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap transition-colors duration-120 ease-out text-dense disabled:pointer-events-none disabled:opacity-40",
        iconOnly ? "w-8" : "px-3",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
