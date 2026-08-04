import { redirect } from "next/navigation";
import { auth, authEnabled } from "@/auth";
import { OrganizerDashboard } from "./OrganizerDashboard";

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
              DevCut Organizer
            </p>
            <h1 className="text-lg font-bold">All cuts</h1>
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
