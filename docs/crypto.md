# Cryptography

The goal is modern algorithms only, preferring FIPS-approved ones wherever we choose. The Workers runtime isn't a FIPS 140-validated module, so this is "FIPS-approved algorithms", not a FIPS certification.

| What | Choice | Notes |
|---|---|---|
| TLS | 1.3 minimum | Set at the Cloudflare zone |
| Token signing (ID and access tokens, JWKS) | ES256 (ECDSA P-256, SHA-256) only | No RS256, no HS256 keys provisioned. Keys rotate every 90 days |
| OAuth | Authorization code + PKCE S256 only | No implicit or password grants, no `plain` PKCE. Dynamic client registration is off |
| Passwords | None | Sign-in is passkeys, Google/GitHub/Microsoft, or an emailed code |
| Email codes | 8 digits, 10 minutes, 5 attempts, stored as HMAC-SHA-256 | Keyed with `BETTER_AUTH_SECRET` so a database copy can't be brute-forced |
| OAuth client secrets, refresh and access tokens | Stored hashed (SHA-256) | |
| Session cookies | `__Host-` prefix, Secure, HttpOnly, SameSite=Lax, host-only | Other `*.skyda.dev` hosts can't set or shadow them |
| Passkeys | User verification and discoverable credentials required; RP ID `skyda.dev` | Accepts EdDSA, ES256 and RS256 public keys. RS256 stays because Windows Hello creates RS256 credentials, and dropping it would lock those users out |

## Known gaps

- Better Auth encrypts JWT private keys and stored social-login tokens with XChaCha20-Poly1305. It's a modern AEAD but not FIPS-approved, and the library has no option to swap it for AES-GCM. Revisit if FIPS-only becomes a hard requirement.
