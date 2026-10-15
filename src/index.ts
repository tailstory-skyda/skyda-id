import { Hono } from "hono";
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { createAuth } from "./auth";
import type { Env } from "./env";
import { securityHeaders } from "./headers";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

app.get("/.well-known/openid-configuration", (c) =>
  oauthProviderOpenIdConfigMetadata(createAuth(c.env))(c.req.raw),
);
app.get("/.well-known/oauth-authorization-server", (c) =>
  oauthProviderAuthServerMetadata(createAuth(c.env))(c.req.raw),
);
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
