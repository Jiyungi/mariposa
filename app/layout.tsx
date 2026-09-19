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
      <body className="min-h-dvh bg-secondary/40">
        {/* WCAG 2.4.3: keep the rendered (visual) order identical to the DOM
            order so keyboard focus never jumps ahead and then back. Any
            reversed flex direction or `order-*` override inside the main
            content region is neutralised. */}
        <style>{`
          main#main-content [class*="flex-col-reverse"] { flex-direction: column; }
          main#main-content [class*="flex-row-reverse"] { flex-direction: row; }
          main#main-content [class^="order-"],
          main#main-content [class*=" order-"] { order: 0; }
        `}</style>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-black focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-black"
        >
          Skip to main content
        </a>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
