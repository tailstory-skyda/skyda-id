# skyda-id

Skyda's identity service at `id.skyda.dev`: accounts and sign-in. A Cloudflare Worker on D1, built on Better Auth.

## Develop

```sh
npm ci
npm run migrate:local
echo 'BETTER_AUTH_SECRET=<32+ random bytes>' > .dev.vars
echo 'BASE_URL=http://localhost:8787' >> .dev.vars
npm run dev
```

Open http://localhost:8787/sign-in. Locally, sign-in emails are written to files instead of sent, and the log says where. `npm run dev` keeps requests addressed to `localhost:8787` (otherwise `wrangler dev` rewrites them to the `id.skyda.dev` route and Better Auth rejects the origin).

## Sign-in for site apps

Pages on `skyda.dev` and its subdomains:

- send people to `https://id.skyda.dev/sign-in?return=<url>` to sign in. `return` must be on `skyda.dev` or a subdomain, otherwise the page returns to `https://skyda.dev/`.
- call `GET https://id.skyda.dev/api/auth/token` with `credentials: "include"`. A signed-in visitor gets `{ token }`, a 15-minute ES256 JWT (issuer and audience `https://id.skyda.dev`) to verify against `https://id.skyda.dev/api/auth/jwks`; anyone else gets a 401.
- sign out with `POST https://id.skyda.dev/api/auth/sign-out` with credentials.

The session cookie is SameSite=Lax, so these work only from `*.skyda.dev`, not from other sites.

## Schema changes

Change the auth config, then `npm run -s schema > migrations/NNNN_name.sql` writes only what's missing on top of the existing migrations.

## Deploy

Create the D1 database (`wrangler d1 create skyda-id`), put its id in `wrangler.jsonc`, turn on Cloudflare Email Service sending for skyda.dev, set `BETTER_AUTH_SECRET` with `wrangler secret put` (the optional ones are listed in `wrangler.jsonc`), then `npm run migrate:remote` and `npm run deploy`.

Cryptography choices are in [docs/crypto.md](docs/crypto.md).
