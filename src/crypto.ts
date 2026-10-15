const encoder = new TextEncoder();

/**
 * HMAC-SHA-256 keyed with the auth secret, hex encoded. Used for short-lived
 * codes so a database leak doesn't hand out codes that are still valid: a
 * plain hash of a 6-digit code is reversed by trying all million values.
 */
export async function hmacSha256(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
