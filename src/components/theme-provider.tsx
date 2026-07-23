"use client";

// Dark mode default follows the system; the toggle persists.
// `attribute="class"` puts `dark` on <html>, which drives both the token
// swap in globals.css and body-portaled Base UI popups.

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
