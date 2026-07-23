"use client";

// Both icons render and CSS picks one (the export's .moon/.sun pattern) — no
// mounted-state dance, no hydration flash.

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { strings } from "../lib/strings";
import { Button } from "./ui/button";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      iconOnly
      className={className}
      aria-label={strings.header.toggleTheme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon size={16} className="dark:hidden" />
      <Sun size={16} className="hidden dark:block" />
    </Button>
  );
}
