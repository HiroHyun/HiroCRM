"use client";

// Toast host, mounted once in the root layout. Calm neutral toasts on the
// surface tokens (no richColors); sonner's own radius default is
// already the 8px control radius.

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
    />
  );
}
