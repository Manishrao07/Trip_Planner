import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wanderly — AI trip planner",
  description:
    "Describe a trip in your own words and get a structured, editable day-by-day itinerary you can reorder, prune, and refine.",
  applicationName: "Wanderly",
  authors: [{ name: "Wanderly" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Deliberately no maximumScale / userScalable:false — pinch zoom stays available.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#05070d" },
    { media: "(prefers-color-scheme: light)", color: "#f6f8fc" },
  ],
};

/**
 * Applied before first paint so the correct theme is already on <html> when the
 * body renders. Doing this in an effect would produce a dark-to-light flash.
 */
const themeBootstrap = `(function(){try{
var stored=localStorage.getItem('wanderly-theme');
var prefersLight=window.matchMedia('(prefers-color-scheme: light)').matches;
if(stored==='light'||(!stored&&prefersLight)){document.documentElement.classList.add('light');}
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {/* Decorative backdrop layers, hidden from assistive technology. */}
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob--one" />
          <div className="aurora-blob aurora-blob--two" />
          <div className="aurora-blob aurora-blob--three" />
        </div>
        <div className="grid-veil" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-solid focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-lg"
        >
          Skip to content
        </a>

        {children}
      </body>
    </html>
  );
}
