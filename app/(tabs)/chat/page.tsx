"use client";

// ===========================================================================
// Grounded Chat screen (app/(tabs)/chat/page.tsx) — Req 9.1, 9.2, 9.3, 9.4, 14.1
//
// Self-contained, tidy chat screen. Lists the five canonical questions, sends
// the selected one to POST /api/chat, and renders the fixed five sections in
// order. NOTE: the polished phone-frame shell (PhoneFrame/BottomTabs) is
// Person A's Task 12 — this page deliberately does NOT import shell components
// that may not exist yet. Styling is inline + minimal so it stands alone.
// ===========================================================================

import { useState } from "react";

import {
  CANONICAL_QUESTIONS,
  type ChatAnswer,
} from "@/lib/chat/grounded-chat";

const DISCLAIMER =
  "Mariposa provides educational fertility information, not medical advice.";

interface ChatResponse {
  answer: ChatAnswer;
  usedFallback: boolean;
}

const C = {
  bg: "#faf7fb",
  card: "#ffffff",
  ink: "#1f1530",
  sub: "#6b6480",
  accent: "#7c3aed",
  accentSoft: "#f1ebfe",
  border: "#ece7f2",
};

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(questionId: string) {
    setActiveId(questionId);
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as ChatResponse;
      setAnswer(data.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 390,
        margin: "0 auto",
        minHeight: "100vh",
        background: C.bg,
        color: C.ink,
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          background: C.bg,
          padding: "20px 20px 12px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Ask Mariposa</h1>
        <p style={{ fontSize: 13, color: C.sub, margin: "4px 0 0" }}>
          Answers scoped to your data, grounded in the same references your care
          team uses.
        </p>
      </header>

      <section style={{ padding: "16px 20px", flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {CANONICAL_QUESTIONS.map((q) => {
            const selected = activeId === q.id;
            return (
              <button
                key={q.id}
                onClick={() => ask(q.id)}
                disabled={loading}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: `1px solid ${selected ? C.accent : C.border}`,
                  background: selected ? C.accentSoft : C.card,
                  color: C.ink,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: loading ? "default" : "pointer",
                }}
              >
                {q.prompt}
              </button>
            );
          })}
        </div>

        {loading && (
          <p style={{ color: C.sub, fontSize: 14, marginTop: 20 }}>Thinking…</p>
        )}

        {error && (
          <p style={{ color: "#b42318", fontSize: 14, marginTop: 20 }}>{error}</p>
        )}

        {answer && !loading && <AnswerCard answer={answer} />}
      </section>

      <footer
        style={{
          padding: "14px 20px 24px",
          textAlign: "center",
          fontSize: 11,
          color: C.sub,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {DISCLAIMER}
      </footer>
    </main>
  );
}

function AnswerCard({ answer }: { answer: ChatAnswer }) {
  return (
    <article
      style={{
        marginTop: 20,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{answer.question}</h2>

      <Section label="Short answer" body={answer.shortAnswer} />
      <Section label="Based on your data" body={answer.basedOnYourData} />
      <Section label="What's uncertain" body={answer.whatsUncertain} />
      <Section label="Shared next step" body={answer.sharedNextStep} />

      <div>
        <SectionLabel>Sources</SectionLabel>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
          {answer.sources.map((s, i) => (
            <li key={i} style={{ fontSize: 12.5, color: C.sub, marginBottom: 4 }}>
              <span style={{ color: C.accent, fontWeight: 600 }}>{s.coupleId}</span>
              {" · "}
              {s.reference} — {s.detail}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <p style={{ fontSize: 14, lineHeight: 1.5, margin: "4px 0 0", color: C.ink }}>
        {body}
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: C.accent,
      }}
    >
      {children}
    </span>
  );
}
