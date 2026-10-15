import { Hono } from "hono";
import { createAuth } from "./auth";
import type { Env } from "./env";
import { securityHeaders } from "./headers";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/healthz", (c) => c.json({ ok: true }));

export default app;
