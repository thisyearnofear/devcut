"use client";

import { useSession, signIn, signOut } from "next-auth/react";

const ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === "1";

/**
 * Session button for the threads drawer. Renders nothing when auth is
 * disabled (no GitHub OAuth credentials configured) — anonymous demo
 * behavior stays byte-identical.
 */
export function AuthButton() {
  const { data: session, status } = useSession();
  if (!ENABLED) return null;

  if (status === "loading") {
    return <span className="block h-8 animate-pulse rounded-lg bg-white/5" />;
  }

  if (!session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("github", { callbackUrl: "/director" })}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2de2c5]/40 bg-[#2de2c5]/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#2de2c5] transition-colors hover:bg-[#2de2c5]/20"
      >
        <GitHubMark className="size-3.5" />
        Sign in with GitHub
      </button>
    );
  }

  const name = session.user.name ?? session.user.email ?? "Signed in";
  return (
    <div className="flex items-center gap-2.5">
      {session.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          alt={name}
          className="size-7 rounded-full border border-white/15"
        />
      ) : (
        <span className="flex size-7 items-center justify-center rounded-full border border-white/15 bg-white/10 font-mono text-[10px] text-white/70">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white/80">{name}</p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/35 transition-colors hover:text-white/65"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
