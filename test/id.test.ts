import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
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
    headers.set("origin", BASE);
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

describe("security headers", () => {
  it("are set on every response", async () => {
    const response = await request("/healthz");
    expect(response.status).toBe(200);
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("discovery", () => {
  it("advertises only modern algorithms and flows", async () => {
    const response = await request("/.well-known/openid-configuration");
    expect(response.status).toBe(200);
    const config = (await response.json()) as Record<string, unknown>;
    expect(config.issuer).toBe(BASE);
    expect(config.id_token_signing_alg_values_supported).toEqual(["ES256"]);
    expect(config.code_challenge_methods_supported).toEqual(["S256"]);
    expect(config.response_types_supported).not.toContain("token");
    expect(config.grant_types_supported).not.toContain("password");
    expect(config.grant_types_supported).not.toContain("implicit");
  });

  it("publishes P-256 signing keys", async () => {
    // A key is minted on first use; signing in issues a session JWT key.
    await signIn("jwks@example.com");
    const response = await request("/api/auth/jwks");
    expect(response.status).toBe(200);
    const { keys } = (await response.json()) as { keys: Record<string, string>[] };
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.kty).toBe("EC");
      expect(key.crv).toBe("P-256");
      expect(key.alg).toBe("ES256");
      expect(key.d).toBeUndefined();
    }
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

  it("creates the account and a personal workspace from an email code", async () => {
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

    const workspace = await env.DB.prepare(
      `SELECT w.personal, m.role FROM workspace w
       JOIN member m ON m.organizationId = w.id
       JOIN user u ON u.id = m.userId
       WHERE u.email = ?`,
    )
      .bind("new@example.com")
      .first<{ personal: number; role: string }>();
    expect(workspace).toEqual({ personal: 1, role: "owner" });
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
