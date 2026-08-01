/** B2 event notifications → Discord (or log) for Challenge Cut ready alerts. */

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK_URL ?? "";

export type B2EventPayload = {
  eventType?: string;
  eventName?: string;
  bucketName?: string;
  objectName?: string;
  objectSize?: number;
  /** Allow raw B2 notification bodies through. */
  [key: string]: unknown;
};

export async function handleB2EventNotification(req: Request): Promise<Response> {
  let body: B2EventPayload = {};
  try {
    body = (await req.json()) as B2EventPayload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const objectName =
    (body.objectName as string | undefined) ||
    (body.object as { key?: string } | undefined)?.key ||
    "";
  const eventType = body.eventType || body.eventName || "b2.object";
  const summary = {
    product: "DevCut",
    event: eventType,
    bucket: body.bucketName,
    object: objectName,
    ts: Date.now(),
  };
  console.log(JSON.stringify({ logger: "b2_events", ...summary }));

  if (DISCORD_WEBHOOK) {
    const isFinal =
      typeof objectName === "string" &&
      (objectName.includes("final") || objectName.endsWith(".mp4"));
    const isManifest =
      typeof objectName === "string" && objectName.includes("manifest");
    const content = [
      "**DevCut · B2 event**",
      `Event: \`${eventType}\``,
      body.bucketName ? `Bucket: \`${body.bucketName}\`` : null,
      objectName ? `Object: \`${objectName}\`` : null,
      isFinal ? "Final cut (or MP4) landed — Challenge Cut durable artifact ready." : null,
      isManifest ? "Provenance manifest uploaded — Vault verify available." : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await fetch(DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (e) {
      console.error(
        JSON.stringify({
          logger: "b2_events",
          msg: "discord_forward_failed",
          err: e instanceof Error ? e.message : "unknown",
        }),
      );
    }
  }

  return new Response(JSON.stringify({ ok: true, forwarded: Boolean(DISCORD_WEBHOOK) }), {
    headers: { "content-type": "application/json" },
  });
}

/**
 * Shape a provenance vault payload from LangGraph thread state values.
 * Used by GET /api/runs/:threadId/vault.
 */
export function vaultFromThreadValues(values: Record<string, unknown> | null | undefined) {
  const v = values || {};
  const storyboard = (v.storyboard as Record<string, unknown>) || {};
  const shots = Array.isArray(v.shots) ? (v.shots as Record<string, unknown>[]) : [];
  return {
    product: "DevCut",
    title: storyboard.title || null,
    final_video_url: v.final_video_url ?? null,
    durable_url: v.durable_url ?? null,
    manifest_uri: v.manifest_uri ?? null,
    job_manifest_uri: v.job_manifest_uri ?? null,
    final_sha256: v.final_sha256 ?? null,
    canonical_hash: v.canonical_hash ?? null,
    agent_loop: v.agent_loop ?? null,
    monday_test: {
      expires: "never (Backblaze B2 durable object)",
      open: v.durable_url || v.final_video_url || null,
    },
    shots: shots.map((s) => ({
      index: s.index,
      beat: s.beat,
      still_url: s.ref_image_url ?? null,
      clip_url: s.video_url ?? null,
      duration: s.duration ?? null,
    })),
    hyperframes_kit: v.builder_kit
      ? {
          mode: (v.builder_kit as Record<string, unknown>).mode,
          workflow: (v.builder_kit as Record<string, unknown>).workflow,
          asset_count: Array.isArray((v.builder_kit as Record<string, unknown>).assets)
            ? ((v.builder_kit as Record<string, unknown>).assets as unknown[]).length
            : 0,
        }
      : null,
  };
}
