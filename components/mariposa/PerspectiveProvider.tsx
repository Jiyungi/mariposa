"use client";

import * as React from "react";

/*
  PerspectiveProvider — who is signed in (Req 1.2 ownership).

  Mariposa is a two-partner workspace, but each partner signs in as themselves and
  sees a RESTRICTED set of views: their own view + the shared Together view —
  never the other partner's private view. This client context holds the signed-in
  perspective ("her" = Maya, "him" = Daniel), persisted to localStorage so a
  refresh keeps you signed in. The (tabs) layout gates the whole app behind it.
*/

export type Perspective = "her" | "him";

/** Display names grounded in sample-couple.md (the only couple, couple_001). */
export const PARTNER_NAME: Record<Perspective, string> = {
  her: "Maya",
  him: "Daniel",
};

/** Friendly role label for the sign-in chooser. */
export const PARTNER_ROLE: Record<Perspective, string> = {
  her: "Her view",
  him: "His view",
};

const STORAGE_KEY = "mariposa.perspective";

interface PerspectiveContextValue {
  /** The signed-in partner, or null when no one is signed in. */
  perspective: Perspective | null;
  /** False during the first client render (before localStorage is read). */
  hydrated: boolean;
  signIn: (perspective: Perspective) => void;
  signOut: () => void;
}

const PerspectiveContext =
  React.createContext<PerspectiveContextValue | null>(null);

export function PerspectiveProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [perspective, setPerspective] = React.useState<Perspective | null>(
    null,
  );
  const [hydrated, setHydrated] = React.useState(false);

  // Read the persisted perspective once on the client. Until this runs, both
  // server and client render the same (null + not-hydrated) splash, so there
  // is no hydration mismatch.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "her" || stored === "him") setPerspective(stored);
    } catch {
      /* localStorage unavailable — stay signed out */
    }
    setHydrated(true);
  }, []);

  const signIn = React.useCallback((next: Perspective) => {
    setPerspective(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const signOut = React.useCallback(() => {
    setPerspective(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = React.useMemo<PerspectiveContextValue>(
    () => ({ perspective, hydrated, signIn, signOut }),
    [perspective, hydrated, signIn, signOut],
  );

  return (
    <PerspectiveContext.Provider value={value}>
      {children}
    </PerspectiveContext.Provider>
  );
}

/**
 * Access the signed-in perspective. Outside a PerspectiveProvider (e.g. an
 * isolated component render or a unit test that mounts the shell directly) this
 * returns a safe signed-out default with no-op actions rather than throwing —
 * the real app always wraps the tab tree in a provider via the (tabs) layout.
 */
export function usePerspective(): PerspectiveContextValue {
  const ctx = React.useContext(PerspectiveContext);
  if (!ctx) {
    return {
      perspective: null,
      hydrated: true,
      signIn: () => {},
      signOut: () => {},
    };
  }
  return ctx;
}
