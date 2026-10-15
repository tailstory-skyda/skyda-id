import type { Env } from "./env";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/** Sends through Resend's HTTP API. Without a key (local dev) it logs instead. */
export async function sendEmail(env: Env, email: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] to=${email.to} subject=${email.subject}\n${email.text}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? "Skyda <no-reply@skyda.dev>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email send failed with status ${response.status}`);
  }
}
