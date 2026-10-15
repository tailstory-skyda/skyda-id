/**
 * The site Skyda ID serves: its own hostname without the `id.` label, so
 * `https://id.skyda.dev` serves `skyda.dev` and `http://localhost:8787`
 * serves `localhost`.
 */
export function siteDomain(baseURL: string): string {
  return new URL(baseURL).hostname.replace(/^id\./, "");
}

/** True for the site itself and any subdomain, on the same scheme as Skyda ID. */
export function isSiteURL(url: URL, baseURL: string): boolean {
  const domain = siteDomain(baseURL);
  return (
    url.protocol === new URL(baseURL).protocol &&
    (url.hostname === domain || url.hostname.endsWith(`.${domain}`))
  );
}

/**
 * Where to send someone after signing in: the requested address if it's on
 * the site, otherwise the site's home page. Never an address elsewhere, so the
 * sign-in page can't be used to bounce people to another site.
 */
export function safeReturnURL(raw: string | undefined, baseURL: string): string {
  const fallback = `${new URL(baseURL).protocol}//${siteDomain(baseURL)}/`;
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    return isSiteURL(url, baseURL) && !url.username && !url.password ? url.href : fallback;
  } catch {
    return fallback;
  }
}

/** The Origin header if it's a page on the site, else null. */
export function siteOrigin(origin: string | null | undefined, baseURL: string): string | null {
  if (!origin) return null;
  try {
    return isSiteURL(new URL(origin), baseURL) ? origin : null;
  } catch {
    return null;
  }
}
