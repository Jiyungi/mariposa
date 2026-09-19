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
        <style
          dangerouslySetInnerHTML={{
            __html: `
/* Keep visual order in sync with DOM (tab) order for definition lists,
   so a dd > a link cannot be painted after content that precedes it in
   the tab sequence (WCAG 2.4.3 Focus Order). */
dl { flex-direction: row; }
dl[class*="col"] { flex-direction: column; }
dl,
dl > dt,
dl > dd,
dl > div,
dl > dd > a {
  order: 0 !important;
}
`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-secondary/40">{children}</body>
    </html>
  );
}
