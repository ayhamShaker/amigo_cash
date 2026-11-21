# Amigo Cash

A rewards ("Get-Paid-To") platform for US and UK members: they complete games, app offers and surveys from offerwall partners, earn coins, and cash out in crypto or gift cards.

## Status

**Phase 0: interactive prototype.** `prototype/index.html` is a single-file, fully clickable demo of the member site (English) and the admin panel (Arabic, RTL). It stores data in the browser's localStorage only.

## Planned production stack

- Next.js (App Router) + TypeScript + Tailwind, PWA, mobile first
- PostgreSQL (double-entry ledger: pending / available balances) + Redis (rate limits, queues)
- Postback endpoints per network with secret/signature check, IP allow-list and txid de-duplication
- Fraud: VPN/proxy detection API, device fingerprint, holds on large rewards, manual first withdrawal
- Payouts: USDT (TRC20), LTC, BTC, Binance Pay, gift cards; PayPal later
- Admin panel: full control of users, withdrawals, offers, networks, fraud rules, promo codes, support and site settings without touching code
