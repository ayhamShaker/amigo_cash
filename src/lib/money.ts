/** Coins credited to a member for a network payout, given their share in percent. */
export function payoutToCoins(payoutCents: number, sharePct: number, coinsPerUsd: number, boostPct = 0): number {
  if (!Number.isFinite(payoutCents) || payoutCents <= 0) return 0;
  return Math.floor((payoutCents * sharePct * coinsPerUsd * (100 + boostPct)) / (100 * 100 * 100));
}

export function coinsToCents(coins: number, coinsPerUsd: number): number {
  return Math.floor((coins * 100) / coinsPerUsd);
}

export function centsToCoins(cents: number, coinsPerUsd: number): number {
  return Math.round((cents * coinsPerUsd) / 100);
}

export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCoins(coins: number): string {
  return Math.round(coins).toLocaleString("en-US");
}
