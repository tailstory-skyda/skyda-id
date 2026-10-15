import { createAuthClient } from "better-auth/client";
import { emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

const auth = createAuthClient({
  baseURL: location.origin,
  plugins: [emailOTPClient(), passkeyClient()],
});

const main = document.querySelector("main")!;
const returnURL = main.dataset.return!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function show(section: "start" | "code" | "add-passkey") {
  for (const id of ["start", "code", "add-passkey"]) $(id).hidden = id !== section;
  $("error").hidden = true;
}

declare global {
  interface Window {
    turnstile?: { reset(): void };
  }
}

const MESSAGES: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Too many wrong codes. Send a new one.",
  // The browser's passkey prompt was closed or timed out.
  AUTH_CANCELLED: "The passkey prompt was closed. Try again when you're ready.",
  ERROR_CEREMONY_ABORTED: "The passkey prompt was closed. Try again when you're ready.",
  ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY: "The passkey prompt was closed. Try again when you're ready.",
  PASSKEY_NOT_FOUND: "That passkey isn't registered with Skyda. Sign in with an email code instead.",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "This device already has a passkey for your account.",
};

function fail(error: { code?: string; status?: number }) {
  window.turnstile?.reset();
  const element = $("error");
  element.textContent =
    (error.code && MESSAGES[error.code]) ||
    (error.status === 429 ? "Too many tries. Wait a few minutes and try again." : "Something went wrong. Please try again.");
  element.hidden = false;
}

/** Disables a button while its action runs so it can't be sent twice. */
async function busy(button: HTMLButtonElement, action: () => Promise<void>) {
  button.disabled = true;
  try {
    await action();
  } finally {
    button.disabled = false;
  }
}

function turnstileToken(): string | undefined {
  const field = document.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]');
  return field?.value || undefined;
}

/** Signed in: offer a passkey if there's none yet, otherwise go back. */
async function finish() {
  if (window.PublicKeyCredential) {
    const { data } = await auth.passkey.listUserPasskeys();
    if (data && data.length === 0) {
      show("add-passkey");
      return;
    }
  }
  location.replace(returnURL);
}

let email = "";

$("email-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = (event.target as HTMLFormElement).querySelector("button")!;
  void busy(button, async () => {
    email = $<HTMLInputElement>("email").value.trim();
    const token = turnstileToken();
    const { error } = await auth.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
      fetchOptions: token ? { headers: { "x-captcha-response": token } } : undefined,
    });
    if (error) return fail(error);
    $("code-email").textContent = email;
    show("code");
    $("otp").focus();
  });
});

$("code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const button = (event.target as HTMLFormElement).querySelector("button")!;
  void busy(button, async () => {
    const { error } = await auth.signIn.emailOtp({ email, otp: $<HTMLInputElement>("otp").value.trim() });
    if (error) return fail(error);
    await finish();
  });
});

// Back to the email step with the address kept, so Continue sends a fresh code.
$("new-code").addEventListener("click", () => {
  $<HTMLInputElement>("otp").value = "";
  window.turnstile?.reset();
  show("start");
  $("email-form").querySelector("button")!.focus();
});

$("passkey-sign-in").addEventListener("click", (event) => {
  void busy(event.currentTarget as HTMLButtonElement, async () => {
    const result = await auth.signIn.passkey();
    if (result?.error) return fail(result.error);
    location.replace(returnURL);
  });
});

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-provider]")) {
  button.addEventListener("click", () => {
    void busy(button, async () => {
      // Social sign-in comes back to this page, which then offers a passkey.
      const callbackURL = `/sign-in?return=${encodeURIComponent(returnURL)}`;
      const { error } = await auth.signIn.social({ provider: button.dataset.provider!, callbackURL });
      if (error) fail(error);
    });
  });
}

$("add-passkey-button").addEventListener("click", (event) => {
  void busy(event.currentTarget as HTMLButtonElement, async () => {
    const result = await auth.passkey.addPasskey();
    if (result?.error) return fail(result.error);
    location.replace(returnURL);
  });
});

$("skip-passkey").addEventListener("click", () => location.replace(returnURL));

// Arriving already signed in (back from Google, GitHub or Microsoft).
if (main.dataset.signedIn === "true") void finish();
