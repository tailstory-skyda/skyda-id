import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAuth } from "./auth";
import { safeReturnURL, siteOrigin } from "./domain";
import type { Env } from "./env";
import { securityHeaders } from "./headers";
import { SIGN_IN_CSP, signInPage } from "./sign-in-page";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders);

// Site pages (skyda.dev and its subdomains) call the API with the session
// cookie to get a token or sign out. Nothing else may read the responses.
app.use(
  "/api/auth/*",
  cors({
    origin: (origin, c) => siteOrigin(origin, c.env.BASE_URL),
    credentials: true,
    allowMethods: ["GET", "POST"],
    allowHeaders: ["content-type"],
    maxAge: 600,
  }),
);
app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/sign-in", async (c) => {
  const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  c.header("Content-Security-Policy", SIGN_IN_CSP);
  return c.html(
    signInPage(c.env, {
      returnURL: safeReturnURL(c.req.query("return"), c.env.BASE_URL),
      signedIn: !!session,
      turnstileSiteKey: c.env.TURNSTILE_SECRET_KEY && c.env.TURNSTILE_SITE_KEY,
    }),
  );
});

export default app;
