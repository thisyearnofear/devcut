/**
 * Stable SHA-256 hash of a cut brief — used to match a landing CTA click
 * against an already-executed thread so we can offer "watch it again (free)"
 * instead of silently commissioning a duplicate run.
 *
 * Normalization (whitespace collapse + lowercase + trim) MUST be identical
 * on both recording (/director) and lookup (landing) sides.
 */
export async function briefHash(text: string): Promise<string> {
  const norm = text.replace(/\s+/g, " ").trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
