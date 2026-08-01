/**
 * x402 HTTP transport helpers for DevCut job metering.
 *
 * Live mode: verify/settle via facilitator (FACILITATOR_URL).
 * Demo mode (default): after a 402 challenge, accept PAYMENT-SIGNATURE
 * with a demo payload so the product surface and agents can integrate
 * without a wallet — still returns protocol-shaped 402s.
 *
 * Spec: https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/http.md
 */

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  DEVCUT_SKUS,
  type DevCutSku,
  type DevCutSkuId,
  isSkuId,
} from "./skus.js";

const X402_VERSION = 2;

/** Base USDC (Circle) on Base mainnet / Sepolia */
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export type X402Mode = "demo" | "live";

export function x402Mode(): X402Mode {
  const m = (process.env.X402_MODE ?? "demo").trim().toLowerCase();
  return m === "live" ? "live" : "demo";
}

function payTo(): string {
  return (
    process.env.X402_PAY_TO?.trim() ||
    "0x0000000000000000000000000000000000000000"
  );
}

function network(): string {
  return process.env.X402_NETWORK?.trim() || "eip155:84532"; // Base Sepolia default
}

function assetAddress(): string {
  const net = network();
  if (net === "eip155:8453") return USDC_BASE;
  return process.env.X402_ASSET?.trim() || USDC_BASE_SEPOLIA;
}

function unlockSecret(): string {
  return (
    process.env.X402_UNLOCK_SECRET?.trim() ||
    process.env.COPILOTKIT_LICENSE_TOKEN?.slice(0, 32) ||
    "devcut-x402-dev-secret"
  );
}

function publicBaseUrl(): string {
  return (
    process.env.X402_RESOURCE_BASE?.trim() ||
    process.env.BFF_PUBLIC_URL?.trim() ||
    process.env.BFF_URL?.trim() ||
    "http://localhost:4010"
  );
}

export interface PaymentAccept {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, string>;
}

export interface PaymentRequiredBody {
  x402Version: number;
  error?: string;
  accepts: PaymentAccept[];
}

export function buildPaymentRequired(
  sku: DevCutSku,
  resourcePath: string,
): PaymentRequiredBody {
  const resource = `${publicBaseUrl().replace(/\/$/, "")}${resourcePath}`;
  return {
    x402Version: X402_VERSION,
    error: "Payment required for DevCut job",
    accepts: [
      {
        scheme: "exact",
        network: network(),
        maxAmountRequired: sku.amountAtomic,
        resource,
        description: `${sku.title}: ${sku.description}`,
        mimeType: "application/json",
        payTo: payTo(),
        maxTimeoutSeconds: 300,
        asset: assetAddress(),
        extra: {
          sku: sku.id,
          name: "USDC",
          price: sku.price,
          product: "DevCut",
        },
      },
    ],
  };
}

export function encodePaymentRequiredHeader(body: PaymentRequiredBody): string {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

export function paymentRequiredResponse(
  sku: DevCutSku,
  resourcePath: string,
): Response {
  const body = buildPaymentRequired(sku, resourcePath);
  const header = encodePaymentRequiredHeader(body);
  return new Response(JSON.stringify(body, null, 2), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": header,
      "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
      "Cache-Control": "no-store",
    },
  });
}

export interface JobReceipt {
  job_id: string;
  sku: DevCutSkuId;
  title: string;
  mode: X402Mode;
  paid: boolean;
  unlock_token: string;
  canvas_path: string;
  mode_prompt: string;
  settles_at: string;
}

interface UnlockPayload {
  job_id: string;
  sku: DevCutSkuId;
  exp: number;
}

function signUnlock(payload: UnlockPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", unlockSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUnlockToken(
  token: string,
): UnlockPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", unlockSecret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as UnlockPayload;
    if (!payload.exp || Date.now() > payload.exp) return null;
    if (!isSkuId(payload.sku)) return null;
    return payload;
  } catch {
    return null;
  }
}

function decodeSignatureHeader(header: string): unknown | null {
  try {
    // Allow raw "demo" shortcut in demo mode
    if (header === "demo" || header === "devcut-demo") {
      return { demo: true };
    }
    const json = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(header);
    } catch {
      return null;
    }
  }
}

async function facilitatorVerifySettle(
  paymentPayload: unknown,
  paymentRequired: PaymentRequiredBody,
): Promise<{ ok: boolean; detail?: string; settlement?: unknown }> {
  const url = process.env.FACILITATOR_URL?.replace(/\/$/, "");
  if (!url) {
    return { ok: false, detail: "FACILITATOR_URL not set" };
  }
  try {
    const verifyRes = await fetch(`${url}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements: paymentRequired.accepts[0],
      }),
    });
    if (!verifyRes.ok) {
      const t = await verifyRes.text();
      return { ok: false, detail: `verify ${verifyRes.status}: ${t.slice(0, 200)}` };
    }
    const settleRes = await fetch(`${url}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements: paymentRequired.accepts[0],
      }),
    });
    if (!settleRes.ok) {
      const t = await settleRes.text();
      return { ok: false, detail: `settle ${settleRes.status}: ${t.slice(0, 200)}` };
    }
    const settlement = await settleRes.json();
    return { ok: true, settlement };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fulfillPaidJob(
  skuId: DevCutSkuId,
  paymentSignatureHeader: string | null,
  brief?: string,
): Promise<Response> {
  const sku = DEVCUT_SKUS[skuId];
  const resourcePath = `/api/x402/jobs/${skuId}`;
  const required = buildPaymentRequired(sku, resourcePath);

  if (!paymentSignatureHeader) {
    return paymentRequiredResponse(sku, resourcePath);
  }

  const mode = x402Mode();
  const payload = decodeSignatureHeader(paymentSignatureHeader);

  if (mode === "demo") {
    const okDemo =
      payload &&
      typeof payload === "object" &&
      (("demo" in (payload as object) &&
        (payload as { demo?: boolean }).demo === true) ||
        paymentSignatureHeader === "demo" ||
        paymentSignatureHeader === "devcut-demo");
    if (!okDemo) {
      return paymentRequiredResponse(sku, resourcePath);
    }
  } else {
    const settled = await facilitatorVerifySettle(payload, required);
    if (!settled.ok) {
      const body = {
        ...required,
        error: settled.detail || "Payment verification failed",
      };
      return new Response(JSON.stringify(body, null, 2), {
        status: 402,
        headers: {
          "content-type": "application/json",
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body),
        },
      });
    }
  }

  const job_id = randomUUID();
  const unlock_token = signUnlock({
    job_id,
    sku: skuId,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  });

  const briefQ = brief ? `&brief=${encodeURIComponent(brief)}` : "";
  const canvas_path = `/director?mode=${sku.door === "agent" ? "submit" : sku.door}&sku=${skuId}&job=${job_id}&unlock=${encodeURIComponent(unlock_token)}${briefQ}`;

  const receipt: JobReceipt = {
    job_id,
    sku: skuId,
    title: sku.title,
    mode,
    paid: true,
    unlock_token,
    canvas_path,
    mode_prompt: sku.modePrompt,
    settles_at: new Date().toISOString(),
  };

  const paymentResponse = Buffer.from(
    JSON.stringify({
      success: true,
      mode,
      job_id,
      sku: skuId,
      network: network(),
    }),
    "utf8",
  ).toString("base64");

  return new Response(JSON.stringify(receipt, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "PAYMENT-RESPONSE": paymentResponse,
      "Access-Control-Expose-Headers": "PAYMENT-RESPONSE",
      "Cache-Control": "no-store",
    },
  });
}

export function catalogPayload() {
  return {
    product: "DevCut",
    x402Version: X402_VERSION,
    mode: x402Mode(),
    network: network(),
    payTo: payTo(),
    asset: assetAddress(),
    facilitator: process.env.FACILITATOR_URL || null,
    skus: SKU_IDS_LIST(),
    endpoints: {
      catalog: "GET /api/x402/catalog",
      openapi: "GET /api/x402/openapi.json",
      job: "POST /api/x402/jobs/{sku}",
      unlock: "GET /api/x402/unlock/verify?token=…",
    },
    agent_flow: [
      "GET /api/x402/catalog — discover SKUs + prices",
      "POST /api/x402/jobs/{sku} — receive 402 + PAYMENT-REQUIRED",
      "Sign payment (or demo: PAYMENT-SIGNATURE: demo when X402_MODE=demo)",
      "Retry POST with PAYMENT-SIGNATURE — receive job receipt + canvas_path",
      "Open canvas_path or inject mode_prompt into the director agent",
    ],
  };
}

function SKU_IDS_LIST() {
  return Object.values(DEVCUT_SKUS).map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    price: s.price,
    amountAtomic: s.amountAtomic,
    door: s.door,
    resource: `POST /api/x402/jobs/${s.id}`,
  }));
}
