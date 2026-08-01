/** Canonical public origin for share links / Devpost (dual-host safe). */

const DEFAULT_PROD = "https://devcut.thisyearnofear.com";
const LEGACY_PROD = "https://director.thisyearnofear.com";

/**
 * Prefer NEXT_PUBLIC_APP_URL, then current browser origin, then primary prod host.
 * During cutover both hosts may serve the app; browser origin is always correct
 * when running client-side.
 */
export function publicAppOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return DEFAULT_PROD;
}

export function publicAppUrl(path = "/director"): string {
  const base = publicAppOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Hosts allowed to play B2 media in the browser (CORS allowlist). */
export const B2_CORS_ORIGINS = [
  "https://devcut.thisyearnofear.com",
  "https://director.thisyearnofear.com",
  "http://localhost:3010",
  "http://localhost:3000",
  "http://127.0.0.1:3010",
] as const;

export { DEFAULT_PROD, LEGACY_PROD };
