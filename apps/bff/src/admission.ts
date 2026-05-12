// admission.ts — Per-thread circuit breaker + global concurrency semaphore
//
// Two layers of admission control sit in front of the CopilotKit endpoint:
//
// 1. Per-thread circuit breaker — if a thread accumulates K consecutive
//    failures (409 / 5xx / network error) within a sliding window, we open
//    its breaker for COOLDOWN seconds and short-circuit further requests
//    with 423 Locked + Retry-After.
//
// 2. Global concurrency semaphore with FIFO queue — a hard cap on in-flight
//    CopilotKit POST handlers. Above the cap, up to MAX_QUEUE_WAITERS
//    requests are held in a FIFO queue (max QUEUE_TIMEOUT_MS). When a slot
//    opens the oldest waiter is released.
//
// Both layers are process-local (Map / counter, not Redis): the failure
// modes we're guarding against are localised to one BFF instance.

export const CB_FAILURES_TO_OPEN = Number(process.env.CB_FAILURES_TO_OPEN ?? 3);
export const CB_WINDOW_MS        = Number(process.env.CB_WINDOW_MS ?? 15_000);
export const CB_COOLDOWN_MS      = Number(process.env.CB_COOLDOWN_MS ?? 30_000);
export const MAX_INFLIGHT_RUNS   = Number(process.env.MAX_INFLIGHT_RUNS ?? 3);
export const MAX_QUEUE_WAITERS   = Number(process.env.MAX_QUEUE_WAITERS ?? 5);
export const QUEUE_TIMEOUT_MS    = Number(process.env.QUEUE_TIMEOUT_MS ?? 60_000);
export const EST_RUN_SECONDS     = Number(process.env.EST_RUN_SECONDS ?? 300);

// ---- Circuit breaker ----

interface ThreadBreakerState {
  failures: number[];
  openUntil: number;
}

const _breakers = new Map<string, ThreadBreakerState>();

export function breakerCheck(threadId: string): { open: boolean; retryAfterSec: number } {
  if (!threadId) return { open: false, retryAfterSec: 0 };
  const s = _breakers.get(threadId);
  if (!s) return { open: false, retryAfterSec: 0 };
  const now = Date.now();
  if (s.openUntil > now) {
    return { open: true, retryAfterSec: Math.ceil((s.openUntil - now) / 1000) };
  }
  if (s.openUntil > 0 && s.openUntil <= now) {
    _breakers.delete(threadId);
  }
  return { open: false, retryAfterSec: 0 };
}

export function breakerRecordFailure(threadId: string): void {
  if (!threadId) return;
  const now = Date.now();
  const s = _breakers.get(threadId) ?? { failures: [], openUntil: 0 };
  s.failures = s.failures.filter((t) => now - t < CB_WINDOW_MS);
  s.failures.push(now);
  if (s.failures.length >= CB_FAILURES_TO_OPEN) {
    s.openUntil = now + CB_COOLDOWN_MS;
    s.failures = [];
    console.warn(
      `[bff] circuit breaker OPEN thread=${threadId} cooldown=${CB_COOLDOWN_MS}ms`,
    );
  }
  _breakers.set(threadId, s);
}

export function breakerRecordSuccess(threadId: string): void {
  if (!threadId) return;
  if (_breakers.has(threadId)) _breakers.delete(threadId);
}

export function breakersOpenCount(): number {
  const now = Date.now();
  return Array.from(_breakers.values()).filter((s) => s.openUntil > now).length;
}

// Periodic GC so breaker state doesn't accumulate forever.
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of _breakers) {
    const stale = s.failures.every((t) => now - t > CB_WINDOW_MS);
    if (stale && s.openUntil <= now) _breakers.delete(id);
  }
}, 60_000).unref();

// ---- Concurrency semaphore with FIFO queue ----

let _inflight = 0;

type QueueEntry = { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
const _queue: QueueEntry[] = [];

export function inflightCount(): number { return _inflight; }

export async function acquireSlot(): Promise<{ queuePosition: number; waitedMs: number }> {
  if (_inflight < MAX_INFLIGHT_RUNS) {
    _inflight++;
    return { queuePosition: 0, waitedMs: 0 };
  }
  if (_queue.length >= MAX_QUEUE_WAITERS) {
    throw Object.assign(new Error("queue_full"), { status: 503 });
  }
  const position = _queue.length + 1;
  const waitStart = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _queue.findIndex((e) => e.resolve === resolve);
      if (idx !== -1) _queue.splice(idx, 1);
      reject(Object.assign(new Error("queue_timeout"), { status: 503 }));
    }, QUEUE_TIMEOUT_MS);
    _queue.push({ resolve, reject, timer });
  });
  _inflight++;
  return { queuePosition: position, waitedMs: Date.now() - waitStart };
}

export function releaseSlot(): void {
  _inflight = Math.max(0, _inflight - 1);
  const next = _queue.shift();
  if (next) {
    clearTimeout(next.timer);
    next.resolve();
  }
}

// ---- Request deduplication ----
// Prevents CopilotKit's aggressive retry from spawning duplicate runs for
// the same user intent. Keyed by threadId + first 64 chars of message content.
// Entries expire after DEDUP_TTL_MS.

const DEDUP_TTL_MS = Number(process.env.DEDUP_TTL_MS ?? 60_000);

interface DedupEntry {
  response: Response;
  at: number;
}
const _dedup = new Map<string, DedupEntry>();

export function dedupKey(threadId: string, body: Record<string, unknown>): string {
  if (!threadId) return "";
  // Use the first message content as a fingerprint.
  const messages = body.messages as Array<{ content?: string }> | undefined;
  const firstMsg = messages?.[messages.length - 1]?.content ?? "";
  return `${threadId}:${firstMsg.slice(0, 64)}`;
}

export function dedupGet(key: string): Response | null {
  if (!key) return null;
  const entry = _dedup.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > DEDUP_TTL_MS) {
    _dedup.delete(key);
    return null;
  }
  return entry.response.clone();
}

export function dedupSet(key: string, response: Response): void {
  if (!key) return;
  _dedup.set(key, { response: response.clone(), at: Date.now() });
}

// GC stale dedup entries every 30s.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _dedup) {
    if (now - v.at > DEDUP_TTL_MS) _dedup.delete(k);
  }
}, 30_000).unref();
