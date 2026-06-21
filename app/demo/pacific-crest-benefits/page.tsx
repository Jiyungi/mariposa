import { SEED_AUTH_PACKET } from "@/lib/reference";
import { buildPacificCrestPortalMarkdown } from "@/lib/browserbase/pacific-crest-portal";

export const metadata = {
  title: "Pacific Crest Health — Member Benefits (demo)",
  robots: { index: false, follow: false },
};

export default function PacificCrestBenefitsPage() {
  const markdown = buildPacificCrestPortalMarkdown(SEED_AUTH_PACKET);
  const lines = markdown.split("\n");

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 font-sans text-foreground">
      {lines.map((line) => {
        if (line.startsWith("# ")) {
          return (
            <h1 key={line} className="text-2xl font-bold">
              {line.slice(2)}
            </h1>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h2 key={line} className="mt-6 text-lg font-semibold">
              {line.slice(3)}
            </h2>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <p key={line} className="mt-2 text-sm leading-relaxed">
              {line}
            </p>
          );
        }
        if (!line.trim()) return <div key={line} className="h-2" />;
        return (
          <p key={line} className="mt-1 text-sm text-muted-foreground">
            {line}
          </p>
        );
      })}
    </main>
  );
}
