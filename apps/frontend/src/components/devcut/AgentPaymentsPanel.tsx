"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface CatalogSku {
  id: string;
  title: string;
  description: string;
  price: string;
  amountAtomic: string;
  door: string;
  resource: string;
}

interface Catalog {
  product: string;
  x402Version: number;
  mode: string;
  network: string;
  payTo: string;
  skus: CatalogSku[];
  agent_flow: string[];
}

interface JobReceipt {
  job_id: string;
  sku: string;
  title: string;
  mode: string;
  paid: boolean;
  unlock_token: string;
  canvas_path: string;
  mode_prompt: string;
}

/**
 * Agent door surface — live x402 catalog, 402 probe, demo settle, canvas unlock.
 */
export function AgentPaymentsPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState("challenge_film");
  const [brief, setBrief] = useState(
    "Backblaze Generative Media Hackathon: builders must use Genblaze + B2. Show a winning durable media pipeline.",
  );
  const [probe, setProbe] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<JobReceipt | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/x402/catalog")
      .then(async (r) => {
        if (!r.ok) throw new Error(`catalog ${r.status}`);
        return r.json() as Promise<Catalog>;
      })
      .then((c) => {
        setCatalog(c);
        if (c.skus[0]) setSku(c.skus[0].id);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const probe402 = useCallback(async () => {
    setBusy(true);
    setProbe(null);
    setReceipt(null);
    setError(null);
    try {
      const res = await fetch(`/api/x402/jobs/${sku}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief }),
      });
      const paymentRequired = res.headers.get("PAYMENT-REQUIRED");
      const body = await res.text();
      setProbe(
        [
          `HTTP ${res.status}`,
          paymentRequired
            ? `PAYMENT-REQUIRED: ${paymentRequired.slice(0, 64)}… (${paymentRequired.length} b64 chars)`
            : "PAYMENT-REQUIRED: (missing)",
          "",
          body.slice(0, 1200),
        ].join("\n"),
      );
      if (res.status !== 402) {
        setError(`Expected 402, got ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sku, brief]);

  const demoPay = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/x402/jobs/${sku}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "PAYMENT-SIGNATURE": "demo",
        },
        body: JSON.stringify({ brief }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(`settle failed ${res.status}: ${text.slice(0, 200)}`);
        setProbe(text.slice(0, 800));
        return;
      }
      const data = JSON.parse(text) as JobReceipt;
      setReceipt(data);
      setProbe(`HTTP ${res.status}\nPAYMENT-RESPONSE present: ${Boolean(res.headers.get("PAYMENT-RESPONSE"))}\n\n${text}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [sku, brief]);

  const curl402 = `curl -i -X POST "$ORIGIN/api/x402/jobs/${sku}" \\
  -H 'content-type: application/json' \\
  -d '{"brief":"…"}'`;

  const curlPay = `curl -i -X POST "$ORIGIN/api/x402/jobs/${sku}" \\
  -H 'content-type: application/json' \\
  -H 'PAYMENT-SIGNATURE: demo' \\
  -d '{"brief":"…"}'`;

  return (
    <div className={`space-y-5 ${embedded ? "" : "rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-6"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#9bb5a4]">
            Agent + x402
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
            Metered jobs — no Runway key paste. Agents hit 402, pay, retry, get a canvas unlock.
            {catalog ? (
              <>
                {" "}
                Mode <code className="text-[#c5d4c8]">{catalog.mode}</code> · network{" "}
                <code className="text-[#c5d4c8]">{catalog.network}</code>
              </>
            ) : null}
          </p>
        </div>
        <a
          href="/api/x402/openapi.json"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/45 hover:text-white/75"
        >
          OpenAPI
        </a>
      </div>

      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
          {!catalog && " — is the BFF running on :4010?"}
        </p>
      )}

      {catalog && (
        <div className="grid gap-2 sm:grid-cols-3">
          {catalog.skus.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSku(s.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                sku === s.id
                  ? "border-[#7a9e88]/50 bg-[#7a9e88]/10"
                  : "border-white/10 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-white/90">{s.title}</p>
                <p className="font-mono text-[11px] text-[#c5d4c8]">{s.price}</p>
              </div>
              <p className="mt-1 font-mono text-[10px] text-white/40">{s.id}</p>
              <p className="mt-2 text-xs leading-5 text-white/55">{s.description}</p>
            </button>
          ))}
        </div>
      )}

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        className="w-full resize-y rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs leading-5 text-white/85 outline-none focus:border-[#7a9e88]/40"
        placeholder="Brief for the paid job…"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !catalog}
          onClick={probe402}
          className="rounded-full border border-white/20 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-white/75 hover:border-white/40 disabled:opacity-40"
        >
          Probe 402
        </button>
        <button
          type="button"
          disabled={busy || !catalog}
          onClick={demoPay}
          className="rounded-full bg-[#c5d4c8] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#0c0f0e] hover:bg-white disabled:opacity-40"
        >
          Pay demo · unlock
        </button>
        {receipt && (
          <Link
            href={receipt.canvas_path}
            className="rounded-full border border-[#7a9e88]/50 bg-[#7a9e88]/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#c5d4c8] hover:bg-[#7a9e88]/25"
          >
            Open paid canvas
          </Link>
        )}
      </div>

      {receipt && (
        <p className="font-mono text-[11px] text-white/50">
          job <span className="text-white/80">{receipt.job_id.slice(0, 8)}</span> · {receipt.title} ·
          unlock minted
        </p>
      )}

      {probe && (
        <pre className="max-h-56 overflow-auto rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[10px] leading-4 text-white/60">
          {probe}
        </pre>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Unpaid (expect 402)
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[10px] text-white/55">
            {curl402}
          </pre>
        </div>
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
            Demo settle (X402_MODE=demo)
          </p>
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[10px] text-white/55">
            {curlPay}
          </pre>
        </div>
      </div>

      {catalog?.agent_flow && (
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-white/50">
          {catalog.agent_flow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
