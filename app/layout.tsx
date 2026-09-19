import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mariposa",
  description:
    "A shared, two-partner fertility-preparation workflow with an autonomous agent.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{`
          /* WCAG 2.4.3 Focus Order: itinerary stops (dl > dd > a) must be
             painted in the same sequence they appear in the DOM, so tabbing
             follows the visible top-to-bottom reading order instead of
             jumping to a stop rendered further down the page. */
          dl > dt,
          dl > dd {
            order: 0 !important;
            grid-row: auto !important;
            grid-column: auto !important;
          }
          dl > dd > a {
            order: 0 !important;
          }
        `}</style>
      </head>
      <body className="min-h-dvh bg-secondary/40">{children}</body>
    </html>
  );
}
