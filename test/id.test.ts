import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createLocalJWKSet, jwtVerify } from "jose";
import app from "../src/index";

const BASE = "http://localhost";

let nextIp = 1;
const sent: { to: string; subject: string; text?: string }[] = [];
const testEnv = {
  ...env,
  EMAIL: {
    send: async (message: { to: string; subject: string; text?: string }) => {
      sent.push(message);
      return { messageId: `test-${sent.length}` };
    },
  } as unknown as SendEmail,
};

/** Each test call comes from its own address unless one is given, so rate limits don't leak between tests. */
function request(path: string, init?: RequestInit, ip = `198.51.100.${nextIp++}`) {
  const headers = new Headers(init?.headers);
  headers.set("cf-connecting-ip", ip);
  if (init?.method === "POST") {
    headers.set("content-type", "application/json");
    if (!headers.has("origin")) headers.set("origin", BASE);
  }
  return app.fetch(new Request(`${BASE}${path}`, { ...init, headers }), testEnv);
}

function requestCode(email: string, ip?: string) {
  return request(
    "/api/auth/email-otp/send-verification-otp",
    { method: "POST", body: JSON.stringify({ email, type: "sign-in" }) },
    ip,
  );
}

/** Sends an email code and returns it from the captured email. */
async function sendCode(email: string): Promise<string> {
  const response = await requestCode(email);
  expect(response.status).toBe(200);
  const message = sent.findLast((m) => m.to === email);
  const code = message?.text?.match(/code is (\d+)/)?.[1];
  expect(code).toBeDefined();
  return code!;
}

async function signIn(email: string) {
  const otp = await sendCode(email);
  return request("/api/auth/sign-in/email-otp", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
}

/** Signs in with an email code and returns the session cookie pair. */
async function sessionCookie(email: string): Promise<string> {
  const response = await signIn(email);
  expect(response.status).toBe(200);
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith("__Host-skyda.session_token="));
  return cookie!.split(";")[0]!;
}

describe("security headers", () => {
  it("are set on every response", async () => {
    const response = await request("/api/auth/ok");
    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("sign-in", () => {
  it("has no password sign-up", async () => {
    const response = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: "pw@example.com", password: "correct horse battery", name: "Pw" }),
    });
    expect(response.status).not.toBe(200);
  });

  it("creates the account from an email code", async () => {
    const response = await signIn("new@example.com");
    expect(response.status).toBe(200);

    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith("__Host-skyda.session_token="));
    expect(session).toBeDefined();
    expect(session).toMatch(/; Secure/i);
    expect(session).toMatch(/; HttpOnly/i);
    expect(session).not.toMatch(/; Domain=/i);

    const me = await request("/api/auth/get-session", {
      headers: { cookie: session!.split(";")[0]! },
    });
    const body = (await me.json()) as { user: { email: string } } | null;
    expect(body?.user.email).toBe("new@example.com");
  });

  it("does not store email codes in readable form", async () => {
    const code = await sendCode("stored@example.com");
    const { results } = await env.DB.prepare("SELECT value FROM verification").all<{ value: string }>();
    expect(results.length).toBeGreaterThan(0);
    for (const row of results) expect(row.value).not.toContain(code);
  });

  it("rejects a wrong code", async () => {
    await sendCode("wrong@example.com");
    const response = await request("/api/auth/sign-in/email-otp", {
      method: "POST",
      body: JSON.stringify({ email: "wrong@example.com", otp: "00000000" }),
    });
    expect(response.status).not.toBe(200);
  });

  it("limits how often one address can request codes", async () => {
    const ip = "203.0.113.7";
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await requestCode(`limit${i}@example.com`, ip)).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("sign-in page", () => {
  it("only returns to addresses on the site", async () => {
    const response = await request(`/sign-in?return=${encodeURIComponent("https://evil.example/")}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-return="http://localhost/"');
  });

  it("keeps a return address on a subdomain", async () => {
    const target = "http://dotforge.localhost/notes?id=1";
    const response = await request(`/sign-in?return=${encodeURIComponent(target)}`);
    expect(await response.text()).toContain(`data-return="${target}"`);
  });

  it("allows only its own scripts", async () => {
    const response = await request("/sign-in");
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("knows when the visitor is already signed in", async () => {
    const cookie = await sessionCookie("page@example.com");
    const response = await request("/sign-in", { headers: { cookie } });
    expect(await response.text()).toContain('data-signed-in="true"');
  });
});

describe("tokens for site apps", () => {
  it("issues an ES256 token that verifies against the published keys", async () => {
    const cookie = await sessionCookie("token@example.com");
    const response = await request("/api/auth/token", { headers: { cookie } });
    expect(response.status).toBe(200);
    const { token } = (await response.json()) as { token: string };

    const jwks = createLocalJWKSet(await (await request("/api/auth/jwks")).json());
    const { payload, protectedHeader } = await jwtVerify(token, jwks, { issuer: BASE, audience: BASE });
    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.email).toBe("token@example.com");
  });

  it("refuses a token without a session", async () => {
    const response = await request("/api/auth/token");
    expect(response.status).toBe(401);
  });

  it("lets site pages read responses with the session cookie", async () => {
    const response = await request("/api/auth/token", {
      method: "OPTIONS",
      headers: { origin: "http://dotforge.localhost", "access-control-request-method": "GET" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBe("http://dotforge.localhost");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("doesn't let other sites read responses", async () => {
    const response = await request("/api/auth/token", {
      method: "OPTIONS",
      headers: { origin: "http://localhost.evil.example", "access-control-request-method": "GET" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("sign-out", () => {
  it("works from a site page", async () => {
    const cookie = await sessionCookie("out@example.com");
    const response = await request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "http://dotforge.localhost" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    const session = await request("/api/auth/get-session", { headers: { cookie } });
    expect(await session.json()).toBeNull();
  });

  it("is refused from another site", async () => {
    const cookie = await sessionCookie("csrf@example.com");
    const response = await request("/api/auth/sign-out", {
      method: "POST",
      headers: { cookie, origin: "https://evil.example" },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });
});
