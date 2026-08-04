import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// Env-gated: the app runs fully anonymously until AUTH_GITHUB_ID /
// AUTH_GITHUB_SECRET / AUTH_SECRET are provided. When disabled, no auth
// routes, buttons, or gates render — the demo flow is byte-identical.
export const authEnabled = Boolean(
  process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET &&
    process.env.AUTH_SECRET,
);

// Auth.js v5 (JWT sessions, no DB tables required): the stable GitHub
// numeric account id (token.sub) becomes the DevCut/Intelligence user id —
// propagated to the BFF as `gh:<sub>` via the session cookie itself
// (same-origin rewrites carry it to the BFF, which JWE-decodes it).
export const { handlers, auth, signIn, signOut } = NextAuth(
  authEnabled
    ? {
        providers: [GitHub],
        session: { strategy: "jwt" },
        callbacks: {
          session({ session, token }) {
            if (token?.sub) session.user.id = token.sub;
            return session;
          },
        },
      }
    : { providers: [] },
);
