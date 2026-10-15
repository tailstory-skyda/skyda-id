export interface Env {
  DB: D1Database;
  /** Public origin of this Worker, e.g. https://id.skyda.dev */
  BASE_URL: string;
  /** Signs sessions and encrypts the JWT private keys at rest. */
  BETTER_AUTH_SECRET: string;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
}
