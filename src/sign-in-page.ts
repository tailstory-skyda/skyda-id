import type { Env } from "./env";

export interface SignInPageOptions {
  returnURL: string;
  /** Already signed in: skip the form and go straight to the passkey offer or back. */
  signedIn: boolean;
  turnstileSiteKey?: string;
}

const PROVIDERS = [
  { id: "google", label: "Google", configured: (env: Env) => !!env.GOOGLE_CLIENT_ID },
  { id: "github", label: "GitHub", configured: (env: Env) => !!env.GITHUB_CLIENT_ID },
  { id: "microsoft", label: "Microsoft", configured: (env: Env) => !!env.MICROSOFT_CLIENT_ID },
];

function escape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const SIGN_IN_CSP = [
  "default-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export function signInPage(env: Env, { returnURL, signedIn, turnstileSiteKey }: SignInPageOptions): string {
  const social = PROVIDERS.filter((p) => p.configured(env))
    .map((p) => `<button type="button" class="secondary" data-provider="${p.id}">Continue with ${p.label}</button>`)
    .join("\n          ");
  const turnstile = turnstileSiteKey
    ? `<div class="cf-turnstile" data-sitekey="${escape(turnstileSiteKey)}" data-size="flexible"></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in to Skyda</title>
  <link rel="stylesheet" href="/sign-in.css">
  <script type="module" src="/sign-in.js"></script>
  ${turnstileSiteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}
</head>
<body>
  <main data-return="${escape(returnURL)}" data-signed-in="${signedIn}">
    <h1>Sign in to Skyda</h1>

    <section id="start"${signedIn ? " hidden" : ""}>
      <form id="email-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required autofocus>
        ${turnstile}
        <button type="submit">Continue</button>
      </form>
      <div class="divider">or</div>
      <div class="stack">
        <button type="button" class="secondary" id="passkey-sign-in">Sign in with a passkey</button>
          ${social}
      </div>
    </section>

    <section id="code" hidden>
      <form id="code-form">
        <p>We sent an 8-digit code to <strong id="code-email"></strong>.</p>
        <label for="otp">Code</label>
        <input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required>
        <button type="submit">Sign in</button>
      </form>
      <button type="button" class="link" id="new-code">Send a new code</button>
    </section>

    <section id="add-passkey" hidden>
      <h2>Add a passkey?</h2>
      <p>Next time you can sign in with your fingerprint, face or screen lock instead of waiting for a code.</p>
      <div class="stack">
        <button type="button" id="add-passkey-button">Add a passkey</button>
        <button type="button" class="link" id="skip-passkey">Not now</button>
      </div>
    </section>

    <p id="error" role="alert" hidden></p>
  </main>
</body>
</html>`;
}
