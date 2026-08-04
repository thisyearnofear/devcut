"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

const ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

/** Wraps the director canvas in SessionProvider only when auth is enabled. */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  if (!ENABLED) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
