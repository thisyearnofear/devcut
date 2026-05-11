"use client";

/**
 * CopilotKitProviderShell — client-side wrapper around CopilotKitProvider.
 *
 * Reads the user's personal Runway API key from localStorage (set via the
 * ApiKeyPanel in the director canvas) and forwards it as X-Runway-Api-Key
 * on every BFF request. The BFF extracts it and passes it to the agent as
 * a LangGraph configurable so the agent uses the user's own Runway account
 * instead of the shared server key.
 *
 * Why this lives in its own file: the provider config can carry non-plain
 * values (component refs, etc.) that can't be serialized across the
 * server→client boundary if registered directly inside the root
 * server-component layout.
 */

import { useEffect, useState } from "react";
import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { ThemeProvider } from "@/hooks/use-theme";

const STORAGE_KEY = "director_runway_api_key";

export function CopilotKitProviderShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [runwayKey, setRunwayKey] = useState<string>("");

  // Read from localStorage after mount (SSR-safe).
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) ?? "";
    setRunwayKey(stored);

    // Keep in sync if another tab updates the key.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setRunwayKey(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const headers: Record<string, string> = {};
  if (runwayKey) headers["x-runway-api-key"] = runwayKey;

  return (
    <ThemeProvider>
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        publicApiKey={process.env.NEXT_PUBLIC_COPILOT_CLOUD_PUBLIC_API_KEY}
        openGenerativeUI={{}}
        headers={headers}
      >
        {children}
      </CopilotKitProvider>
    </ThemeProvider>
  );
}
