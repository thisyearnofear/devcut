/**
 * DevCut x402 HTTP routes — catalog, OpenAPI stub, paid jobs, unlock verify.
 */

import {
  catalogPayload,
  fulfillPaidJob,
  verifyUnlockToken,
  x402Mode,
} from "./protocol.js";
import { DEVCUT_SKUS, isSkuId, type DevCutSkuId } from "./skus.js";

export async function handleX402(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!path.startsWith("/api/x402")) return null;

  // CORS preflight for agent clients
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (path === "/api/x402/catalog" && req.method === "GET") {
    return json(catalogPayload());
  }

  if (path === "/api/x402/openapi.json" && req.method === "GET") {
    return json(openApiDoc());
  }

  if (path === "/api/x402/unlock/verify" && req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    const payload = verifyUnlockToken(token);
    if (!payload) {
      return json({ valid: false }, 401);
    }
    const sku = DEVCUT_SKUS[payload.sku];
    return json({
      valid: true,
      job_id: payload.job_id,
      sku: payload.sku,
      title: sku.title,
      mode_prompt: sku.modePrompt,
      exp: payload.exp,
    });
  }

  const jobMatch = path.match(/^\/api\/x402\/jobs\/([^/]+)$/);
  if (jobMatch && req.method === "POST") {
    const skuId = jobMatch[1];
    if (!isSkuId(skuId)) {
      return json(
        {
          error: "unknown_sku",
          hint: `Valid SKUs: ${Object.keys(DEVCUT_SKUS).join(", ")}`,
        },
        404,
      );
    }
    let brief: string | undefined;
    try {
      const body = (await req.json()) as { brief?: string };
      brief = body.brief;
    } catch {
      /* no body */
    }
    const sig =
      req.headers.get("PAYMENT-SIGNATURE") ||
      req.headers.get("payment-signature") ||
      req.headers.get("X-PAYMENT");
    const res = await fulfillPaidJob(skuId as DevCutSkuId, sig, brief);
    // Attach CORS for agent tooling
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  }

  return json(
    {
      error: "not_found",
      hint: "Try GET /api/x402/catalog or POST /api/x402/jobs/{sku}",
    },
    404,
  );
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, PAYMENT-SIGNATURE, PAYMENT-REQUIRED, X-PAYMENT",
    "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(),
      "Cache-Control": "no-store",
    },
  });
}

function openApiDoc() {
  const skus = Object.values(DEVCUT_SKUS);
  return {
    openapi: "3.1.0",
    info: {
      title: "DevCut x402 Jobs",
      version: "0.1.0",
      description:
        "Pay-per-job API for Challenge Cut, Submit Ready, and hero shot packs. Returns HTTP 402 with PAYMENT-REQUIRED until settled.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/x402/catalog": {
        get: {
          summary: "List SKUs and payment config",
          responses: { "200": { description: "Catalog" } },
        },
      },
      ...Object.fromEntries(
        skus.map((s) => [
          `/api/x402/jobs/${s.id}`,
          {
            post: {
              summary: s.title,
              description: `${s.description} Price ${s.price}. Unpaid → 402.`,
              parameters: [
                {
                  name: "PAYMENT-SIGNATURE",
                  in: "header",
                  required: false,
                  schema: { type: "string" },
                  description:
                    "Base64 payment payload, or `demo` when X402_MODE=demo",
                },
              ],
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { brief: { type: "string" } },
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Job receipt + unlock_token + canvas_path" },
                "402": { description: "Payment required (PAYMENT-REQUIRED header)" },
              },
            },
          },
        ]),
      ),
    },
    "x-devcut": {
      mode: x402Mode(),
      thesis: "docs/devcut-thesis.md",
    },
  };
}
