/**
 * POST /api/avatar/session
 *
 * Server-side session creation for Runway Characters (gwm1_avatars).
 * The API key never leaves the server.
 *
 * Flow (per Runway docs):
 *   1. Create a realtime session → get sessionId
 *   2. Poll until status === READY → get sessionKey
 *   3. Consume the session → get WebRTC credentials (url, token, roomName)
 *   4. Return credentials to the client
 *
 * The client passes an optional `personality` override so the avatar
 * can be contextualised with the current storyboard title/logline.
 */

import { NextRequest, NextResponse } from "next/server";

const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";
const RUNWAY_VERSION = "2024-11-06";
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

function runwayHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Runway-Version": RUNWAY_VERSION,
  };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RUNWAY_API_KEY ?? "";
  if (!apiKey || apiKey.startsWith("stub")) {
    return NextResponse.json(
      { error: "RUNWAY_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let body: { avatarId?: string; personality?: string; startScript?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { avatarId, personality, startScript } = body;
  if (!avatarId) {
    return NextResponse.json(
      { error: "avatarId is required." },
      { status: 400 },
    );
  }

  // 1. Create session
  const createRes = await fetch(`${RUNWAY_API_BASE}/realtime_sessions`, {
    method: "POST",
    headers: runwayHeaders(apiKey),
    body: JSON.stringify({
      model: "gwm1_avatars",
      avatar: { type: "custom", avatarId },
      ...(personality ? { personality } : {}),
      ...(startScript ? { startScript } : {}),
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    return NextResponse.json(
      { error: `Runway session create failed: ${createRes.status}`, detail: text },
      { status: 502 },
    );
  }

  const { id: sessionId } = (await createRes.json()) as { id: string };

  // 2. Poll until READY
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let sessionKey: string | undefined;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pollRes = await fetch(
      `${RUNWAY_API_BASE}/realtime_sessions/${sessionId}`,
      { headers: runwayHeaders(apiKey) },
    );

    if (!pollRes.ok) continue;

    const session = (await pollRes.json()) as {
      status: string;
      sessionKey?: string;
      failure?: string;
    };

    if (session.status === "READY") {
      sessionKey = session.sessionKey;
      break;
    }
    if (session.status === "FAILED") {
      return NextResponse.json(
        { error: "Runway session failed.", detail: session.failure },
        { status: 502 },
      );
    }
  }

  if (!sessionKey) {
    return NextResponse.json(
      { error: "Runway session timed out waiting for READY." },
      { status: 504 },
    );
  }

  // 3. Consume session → WebRTC credentials
  const consumeRes = await fetch(
    `${RUNWAY_API_BASE}/realtime_sessions/${sessionId}/consume`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": RUNWAY_VERSION,
      },
    },
  );

  if (!consumeRes.ok) {
    const text = await consumeRes.text();
    return NextResponse.json(
      { error: `Runway session consume failed: ${consumeRes.status}`, detail: text },
      { status: 502 },
    );
  }

  const credentials = (await consumeRes.json()) as {
    url: string;
    token: string;
    roomName: string;
  };

  return NextResponse.json({
    sessionId,
    serverUrl: credentials.url,
    token: credentials.token,
    roomName: credentials.roomName,
  });
}
