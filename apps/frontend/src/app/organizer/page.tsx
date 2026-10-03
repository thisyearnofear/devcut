import { redirect } from "next/navigation";
import { auth, authEnabled } from "@/auth";
import { OrganizerDashboard } from "./OrganizerDashboard";

// The auth gate below must be decided per request, not at build. `deploy-local.sh`
// builds with only NEXT_PUBLIC_* vars, so a prerender bakes whatever authEnabled
// was on the build machine and serves it for a year.
export const dynamic = "force-dynamic";

export default async function OrganizerPage() {
  if (!authEnabled) redirect("/");
  const session = await auth().catch(() => null);
  if (!session?.user) redirect("/signin?callbackUrl=/organizer");

  return (
    <div data-theme="cinema" className="min-h-svh bg-[#050607] text-[#f4efe4]">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#2de2c5]">
              DevCut Organizer Desk
            </p>
            <h1 className="text-lg font-bold">Your event, entry by entry</h1>
            <p className="mt-0.5 max-w-md font-mono text-[11px] leading-5 text-white/35">
              Every cut commissioned in your workspace, grouped by event. Tick the finished ones and
              re-stitch them into a sponsor-ready Recap Reel ($4). Refreshes every 20s.
            </p>
          </div>
          <a
            href="/director"
            className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:text-white/75"
          >
            ← Back to canvas
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <OrganizerDashboard />
      </main>
    </div>
  );
}
