import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signIn } from "@/auth";

export default async function SignInPage() {
  // Note: no authEnabled gate — when auth isn't configured the button's
  // sign-in POST 404s harmlessly; gate lives in the drawer (AuthButton).
  const session = await auth().catch(() => null);
  if (session?.user) redirect("/director");

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#050607] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#2de2c5]">
          DevCut
        </p>
        <h1 className="mt-3 text-2xl font-bold text-[#f4efe4]">
          Claim your edit bay
        </h1>
        <p className="mt-2 text-sm leading-6 text-white/55">
          Your cuts, your Runway budget, your keys. One click with the account
          you already ship code with.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/director" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg bg-[#f4efe4] px-4 py-3 font-mono text-xs font-medium uppercase tracking-[0.12em] text-[#050607] transition-colors hover:bg-white"
          >
            <GitHubMark />
            Continue with GitHub
          </button>
        </form>
        <p className="mt-4 font-mono text-[10px] leading-4 text-white/35">
          We only read your basic profile — never your code.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-white/40 hover:text-white/70"
        >
          ← Back to landing
        </Link>
      </div>
    </div>
  );
}

function GitHubMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
