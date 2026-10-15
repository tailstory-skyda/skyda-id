# skyda-id

Skyda's identity service at `id.skyda.dev`: accounts, sign-in, personal workspaces and the OAuth/OIDC issuer every Skyda app trusts. A Cloudflare Worker on D1, built on Better Auth.

## Develop

```sh
npm ci
npm run migrate:local
echo 'BETTER_AUTH_SECRET=<32+ random bytes>' > .dev.vars
echo 'BASE_URL=http://localhost:8787' >> .dev.vars
npm run dev
```

Without `RESEND_API_KEY`, sign-in codes are printed to the console.

## Schema changes

Change the auth config, then `npm run -s schema > migrations/NNNN_name.sql` writes only what's missing on top of the existing migrations.

## Deploy

Create the D1 database (`wrangler d1 create skyda-id`), put its id in `wrangler.jsonc`, set the secrets listed there with `wrangler secret put`, then `npm run migrate:remote` and `npm run deploy`.

Cryptography choices are in [docs/crypto.md](docs/crypto.md).
