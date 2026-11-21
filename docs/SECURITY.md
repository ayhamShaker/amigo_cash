# Security

This file describes what Amigo Cash protects, how, and how each control is checked. Report a vulnerability to the support email set in the admin panel; please do not open a public issue.

## What attackers want here

| Goal | Typical attack |
|---|---|
| Free coins | Forged or replayed postbacks; tampering with payout amounts; claiming bonuses or promo codes twice |
| Cash out more than earned | Two withdrawal requests at the same instant; withdrawing before a chargeback lands |
| Take over accounts | Password guessing, credential stuffing, stolen session cookie, reused 2FA code |
| Take over the admin panel | Any of the above against an admin; calling admin actions directly |
| Farm referrals | Many accounts on one device, VPNs, self-invites |
| Steal data | XSS, SQL injection, IDOR, leaked secrets |

## Controls

**Money**
- Ledger with integer amounts only (coins, cents); no floating point anywhere in payouts. Payout strings from networks are parsed with a strict pattern (`parsePayoutCents`).
- Debits use one conditional `UPDATE … WHERE balance >= amount`, so concurrent requests cannot double-spend. Only one open withdrawal per member.
- Postbacks: signature check (HMAC-SHA256, MD5, secret parameter or HMAC-SHA1 of the URL, chosen per network), optional IP allow-list with CIDR, unique `(network, txid)`, row lock on reversals, reversal-before-credit recorded so a late credit is ignored. Unknown or banned members are recorded but not paid.
- Holds on large rewards; referral commission held and reversed together with the reward.
- Daily bonus and promo codes protected by primary keys (`(user, day)`, `(code, user)`) and an atomic usage counter.
- Withdrawal state changes are conditional updates (`WHERE status IN …`), so a withdrawal is refunded or paid exactly once.

**Accounts**
- Argon2id password hashes; login timing is equal for unknown emails; one generic error message.
- Rate limits stored in PostgreSQL (work across instances): login per IP and per email, sign-up, password reset, 2FA attempts, chat, promo codes, withdrawals, postbacks.
- Sessions: 256-bit random token in an `HttpOnly`, `SameSite=Lax`, `Secure`, `__Host-` cookie; only its SHA-256 is stored. Password change, 2FA activation and bans end other sessions.
- Two-factor login: TOTP with ±30 s drift, each time step accepted once (replay blocked), secrets encrypted at rest with AES-256-GCM, backup codes stored as keyed hashes and usable once. Required for admins and, when on, for every withdrawal.
- Password reset and email confirmation links: single-use, hashed in the database, 1 hour and 48 hours.
- Google sign-in: authorization code flow with PKCE and `state`; an existing account is linked only when Google reports the email as verified.

**Admin**
- Every admin page and every admin Server Action checks `role = ADMIN` and two-factor login itself (not only the layout).
- Role changes end the target's sessions; admins cannot ban or demote themselves.
- Every admin change (balances, withdrawals, offers, networks, settings, roles, bans) is written to the audit log with the admin and IP. Automatic bans are logged as "system".
- Network secrets are write-only in the panel and encrypted at rest.

**Web**
- Content-Security-Policy with a per-request nonce and `strict-dynamic`; `frame-ancestors 'none'`, HSTS (on https), `nosniff`, strict referrer policy, permissions policy.
- CSRF: Server Actions check the Origin header (built into Next.js); the chat API checks Origin itself; cron needs a bearer secret; postbacks need a signature.
- React escapes all output. The only raw HTML is the 2FA QR code, generated on our server by the `qrcode` library.
- Database access only through Prisma or tagged `$queryRaw` templates; a lint rule forbids the `Unsafe` variants.
- Redirects after login accept only same-site paths (`/en/…`, `/es/…`, `/ar/…`).
- Offer walls run in a sandboxed iframe with `no-referrer`; tracking and wall URLs must be https.
- Server configuration is validated at boot; the app refuses to run on an https address with the development secrets.

**Fraud**
- VPN, proxy and Tor detection through IPQualityScore (sign-up, earning, cash-out) when a key is configured.
- Device cookie: limit of accounts per device, "Multi-account" flag for shared devices; linked accounts by device or IP shown on each member's admin page.
- Risk score from flags and chargebacks; automatic ban at the owner's threshold.

## Evidence

- `npm test` — 76 tests against PostgreSQL, including: RFC 4226/6238 test vectors; 8 simultaneous identical postbacks credit once; tampered payout or signature is refused and credits nothing; 10 simultaneous withdrawals with balance for one succeed once; 6 simultaneous daily-bonus clicks pay once; promo usage limits under concurrency; refund exactly once; replayed TOTP codes and reused backup codes refused; reset tokens single-use and stored hashed; the ledger always equals the cached balances.
- End-to-end browser run of the production build (66 checks): sign-up, email confirmation, daily bonus, postback credit, withdrawal, 2FA set-up with a real code, login with 2FA, live chat both ways, admin approval and payment, promo codes, settings, invite link with commission, mobile layout in all three languages, cross-origin chat request refused, cron secret required, no CSP or console errors.
- `npm audit`: 0 known vulnerabilities at the time of writing (`effect` pinned to 3.22.5 through `overrides`).
- CI runs typecheck, lint, translation check, tests, build and a production dependency audit on every push; CodeQL (security-extended queries) runs on pushes, pull requests and weekly; Dependabot opens update PRs.

## Before launch (owner)

1. Generate fresh `SESSION_SECRET`, `ENCRYPTION_KEY` and `CRON_SECRET` (commands are in `.env.example`) and keep them only in the hosting provider's secret settings.
2. Set `TRUSTED_PROXY_HOPS` correctly for the host; otherwise every visitor shares one rate-limit bucket.
3. Turn on two-factor login for every admin and store the backup codes offline.
4. Add `IPQS_API_KEY`; without it VPN detection is off (the admin panel shows a warning).
5. Use a database with daily backups and point-in-time recovery.
6. Have the terms and privacy notice reviewed by a lawyer in the company's country.
7. Turn on GitHub secret scanning and push protection for the repository.
