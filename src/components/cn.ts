// Class-name join. Deliberately not clsx/cva/tailwind-merge — variants here
// are plain object lookups and classes never need merging.
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Base UI components type `className` as `string | (state) => string`; our
 * styled wrappers only ever take the plain-string form.
 */
export type WithClassName<P> = Omit<P, "className"> & { className?: string };
