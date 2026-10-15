import { betterAuth, type BetterAuthOptions } from "better-auth";
import { captcha, emailOTP, jwt, organization } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { hmacSha256 } from "./crypto";
import type { Env } from "./env";

const SESSION_LIFETIME = 60 * 60 * 24 * 30;

function socialProviders(env: Env): BetterAuthOptions["socialProviders"] {
  return {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {}),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {}),
    ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: env.MICROSOFT_CLIENT_ID,
            clientSecret: env.MICROSOFT_CLIENT_SECRET,
            tenantId: "common",
          },
        }
      : {}),
  };
}

export function createAuth(env: Env) {
  const issuer = env.BASE_URL;

  return betterAuth({
    appName: "Skyda",
    baseURL: issuer,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    telemetry: { enabled: false },
    // Passkeys, social sign-in and email codes only. No passwords to store,
    // hash or leak.
    emailAndPassword: { enabled: false },
    socialProviders: socialProviders(env),
    session: { expiresIn: SESSION_LIFETIME, updateAge: 60 * 60 * 24 },
    user: { deleteUser: { enabled: true } },
    account: { encryptOAuthTokens: true },
    advanced: {
      // Every cookie is __Host-: Secure, host-only and path=/, so no other
      // *.skyda.dev subdomain can set or shadow it.
      cookiePrefix: "__Host-skyda",
      useSecureCookies: false,
      defaultCookieAttributes: { secure: true, httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    trustedOrigins: [issuer],
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/email-otp/send-verification-otp": { window: 300, max: 3 },
        "/sign-in/email-otp": { window: 300, max: 5 },
        "/passkey/*": { window: 60, max: 20 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Every account owns a personal workspace from the start, so all
          // data hangs off a workspace id even before shared ones exist.
          after: async (user, ctx) => {
            if (!ctx) throw new Error("Personal workspace needs an endpoint context");
            const adapter = ctx.context.adapter;
            const workspace = await adapter.create<{ id: string }>({
              model: "organization",
              data: {
                name: "Personal",
                slug: `personal-${user.id}`,
                personal: true,
                createdAt: new Date(),
              },
            });
            await adapter.create({
              model: "member",
              data: {
                organizationId: workspace.id,
                userId: user.id,
                role: "owner",
                createdAt: new Date(),
              },
            });
          },
        },
      },
    },
    plugins: [
      jwt({
        // ES256 (ECDSA P-256 + SHA-256): FIPS 186-5 approved and verifiable by
        // every JOSE library. Nothing else is provisioned.
        jwks: {
          keyPairConfig: { alg: "ES256" },
          rotationInterval: 60 * 60 * 24 * 90,
        },
        jwt: { issuer },
      }),
      passkey({
        rpID: new URL(issuer).hostname.replace(/^id\./, ""),
        rpName: "Skyda",
        origin: issuer,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
      }),
      emailOTP({
        otpLength: 8,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: { hash: (otp) => hmacSha256(env.BETTER_AUTH_SECRET, otp) },
        sendVerificationOTP: async ({ email, otp }) => {
          await env.EMAIL.send({
            from: { name: "Skyda", email: "no-reply@skyda.dev" },
            to: email,
            subject: `${otp} is your Skyda code`,
            text: `Your Skyda sign-in code is ${otp}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
          });
        },
      }),
      ...(env.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: env.TURNSTILE_SECRET_KEY,
              endpoints: ["/email-otp/send-verification-otp", "/sign-in/social"],
            }),
          ]
        : []),
      organization({
        // Shared workspaces come later; for now only the personal one exists.
        allowUserToCreateOrganization: false,
        schema: {
          organization: {
            modelName: "workspace",
            additionalFields: {
              personal: { type: "boolean", required: true, defaultValue: false, input: false },
            },
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
