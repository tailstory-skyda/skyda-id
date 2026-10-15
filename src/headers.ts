import type { MiddlewareHandler } from "hono";

/**
 * Headers for every response. The API serves JSON and redirects, so the CSP
 * allows nothing; pages that need more set their own policy.
 */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Cross-Origin-Opener-Policy", "same-origin");
  h.set("Cross-Origin-Resource-Policy", "same-site");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (!h.has("Content-Security-Policy")) {
    h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  }
  if (!h.has("Cache-Control")) h.set("Cache-Control", "no-store");
};
