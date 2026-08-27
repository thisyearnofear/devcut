"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

const ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

/**
 * Wraps the director canvas in SessionProvider — ALWAYS, in both modes.
 *
 * `useSession()` consumers (DirectorChat, DirectorCanvas/WebMCP wiring) exist
 * unconditionally in the tree, so the provider must always be mounted:
 * next-auth's useSession destructures the raw context value, which is
 * `undefined` with no provider — crashing in production builds and throwing
 * in dev ("must be wrapped in a <SessionProvider />").
 *
 * - Auth enabled: plain <SessionProvider> — fetches /api/auth/session so the
 *   GitHub identity hydrates normally.
 * - Auth disabled: <SessionProvider session={null}> — passing a *defined*
 *   session marks it as initial (no fetch, no auth endpoints called — keeps
 *   the anonymous demo flow byte-identical) and yields status
 *   "unauthenticated" so `session?.user` is safely undefined and mutation
 *   gates open (anonymous browsing preserved, ADR-0002).
 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  if (!ENABLED) return <SessionProvider session={null}>{children}</SessionProvider>;
  return <SessionProvider>{children}</SessionProvider>;
}

