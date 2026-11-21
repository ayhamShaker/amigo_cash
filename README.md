# Amigo Cash

A rewards ("Get-Paid-To") site for US and UK members. Members complete games, app sign-ups and surveys from offer networks, earn coins, and cash out in crypto or gift cards. The owner runs everything from an Arabic admin panel; no code changes are needed for day-to-day work.

- Member site in **English, Argentine Spanish and Arabic** (right-to-left), light and dark mode, works on phones.
- Visitors can browse every offer before signing up; starting a task or cashing out needs an account.
- Live support chat on every page; admin replies arrive in the chat window and by email.
- **Admin panel** (`/admin`, Arabic): overview with revenue and margin, members, withdrawals, offers, offer networks, postback log, fraud rules, promo codes, live support, site settings and an audit log.

`prototype/index.html` is the clickable design prototype that was approved before the build.

## Stack

| Part | Choice |
|---|---|
| Web app | Next.js 16 (App Router, Server Actions), React 19, TypeScript (strict) |
| Database | PostgreSQL 16 through Prisma 7 (`@prisma/adapter-pg`) |
| Passwords | Argon2id (`@node-rs/argon2`, OWASP parameters) |
| Two-factor | TOTP (RFC 6238) compatible with Google Authenticator, QR drawn on our server, 8 one-time backup codes |
| Email | Resend (optional; printed to the server log on a local `http` site) |
| VPN / proxy check | IPQualityScore (optional) |
| Tests | Vitest against a real PostgreSQL database |

## How money moves

1. A member starts an offer. The advertiser's tracking link carries the member id (`{user_id}`).
2. The network calls `GET/POST /api/postback/{network}` with `subid`, `txid`, `payout`, `status` and a signature. The request is checked (signature, optional IP allow-list, strict parsing) and recorded once per `(network, txid)`.
3. The member is credited `payout × member share × coins per dollar`. Rewards above the hold threshold go to **pending** for the hold period, then to **available**. The referrer's commission follows the same path.
4. `status=2` (chargeback) takes the coins back from the member and the referrer, flags the member and raises their risk score.
5. A withdrawal takes the coins in the same database transaction that creates it. A member's first withdrawal waits for the owner; later small ones are approved straight away. The owner sends the money and marks it **paid** with the transaction id, or rejects it and the coins are refunded.

Every balance change is a row in `LedgerEntry`; `User.balance` and `User.pending` are caches written only in the same transaction. The tests check after every scenario that the ledger sums equal the cached balances.

## Running locally

Needs Node 22 and PostgreSQL 16.

```bash
cp .env.example .env        # then fill in the values (commands are in the file)
npm ci --legacy-peer-deps
npx prisma migrate deploy
npm run db:seed             # offer networks, all switched off
npm run demo:data           # optional: a demo network and sample offers (local only)
npm run dev
```

After signing up on the site, make yourself an admin:

```bash
npm run admin:make -- you@example.com
```

Log in again, turn on two-factor login on the **Account** page, and open `/admin`. The admin panel never opens without two-factor login.

## Checks

```bash
npm run check   # typecheck + lint + translation check + tests
```

Tests need a database whose name contains `test` (default `postgresql://amigo:amigo_dev_pw@localhost:5432/amigo_test`; override with `TEST_DATABASE_URL`).

## Scheduled job

Call `GET /api/cron` every 10–15 minutes with `Authorization: Bearer $CRON_SECRET`. It releases matured holds and clears expired sessions, tokens and rate-limit rows. A member's own holds are also released when they open the site.

## More

- [`docs/SECURITY.md`](docs/SECURITY.md): threat model, controls and the tests that prove them
- [`docs/SETUP_AR.md`](docs/SETUP_AR.md): the owner's guide in Arabic (accounts to open, deployment, first steps)
