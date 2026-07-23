import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";
import { ThemeProvider } from "../components/theme-provider";
import { Toaster } from "../components/ui/sonner";
import { strings } from "../lib/strings";
import "./globals.css";

// Self-hosted variable fonts (next/font downloads at build
// time and serves from the app; font-display: swap is the default).
// `subsets` selects what is *preloaded* — every subset, latin-ext included,
// still ships in the emitted @font-face set and lazy-loads via unicode-range.
// Preloading latin alone keeps the first-load font payload ≈77KB, within the ~120KB first-load budget.
const plexSans = IBM_Plex_Sans({
  weight: "variable",
  subsets: ["latin"],
  variable: "--font-plex-sans",
});

const bricolage = Bricolage_Grotesque({
  weight: "variable",
  subsets: ["latin"],
  variable: "--font-bricolage",
});

// Static-only family on Google Fonts; 400 is the only weight the design uses.
const plexMono = IBM_Plex_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: strings.app.name,
  description: strings.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: next-themes stamps the theme class on <html>
    // before hydration.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${bricolage.variable} ${plexMono.variable}`}
    >
      <body>
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
