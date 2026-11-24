/**
 * Cash-out methods. The owner edits, adds and removes them in the admin panel;
 * they are stored in the site settings. This file holds the shapes, the
 * address formats a method can ask for, the built-in icons and the defaults.
 */

/** What the member types to receive the money, and how it is checked. */
export const ADDRESS_KINDS = {
  trc20: { label: "TRON (TRC-20) address", re: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, placeholder: "TXk2…9fQa" },
  evm: { label: "EVM address (ERC-20 / BEP-20)", re: /^0x[0-9a-fA-F]{40}$/, placeholder: "0x71C…9A2f" },
  btc: { label: "Bitcoin address", re: /^(bc1[02-9ac-hj-np-z]{6,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/, placeholder: "bc1q…" },
  ltc: { label: "Litecoin address", re: /^(ltc1[02-9ac-hj-np-z]{6,87}|[LM3][1-9A-HJ-NP-Za-km-z]{26,33})$/, placeholder: "ltc1q…" },
  sol: { label: "Solana address", re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, placeholder: "7xKX…gAsU" },
  binance: { label: "Binance Pay ID", re: /^\d{6,12}$/, placeholder: "354120987" },
  email: { label: "Email address", re: /^[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}$/, placeholder: "you@email.com" },
  text: { label: "Free text", re: /^[^\u0000-\u001f<>]{3,120}$/, placeholder: "" },
} as const;

export type AddressKind = keyof typeof ADDRESS_KINDS;
export const ADDRESS_KIND_KEYS = Object.keys(ADDRESS_KINDS) as AddressKind[];

/** Icons shipped with the site, under /public/methods. */
export const BUILTIN_ICONS = [
  "usdt", "usdc", "btc", "ltc", "eth", "bnb", "trx", "sol", "doge",
  "amazon", "paypal", "applepay", "googlepay", "cashapp", "venmo", "wise", "payoneer", "steam", "visa",
] as const;

export type PayMethod = {
  /** Stable id stored on each withdrawal. Lower-case letters, digits and dashes. */
  id: string;
  name: string;
  /** Short line under the name, e.g. "Tether · TRC-20". */
  sub: string;
  kind: AddressKind;
  /** Label of the address field shown to the member. */
  field: string;
  placeholder: string;
  /** "/methods/usdt.svg" or an uploaded image as a data: URL. */
  image: string;
  enabled: boolean;
  minCents: number;
  feeCents: number;
};

export const DEFAULT_METHODS: PayMethod[] = [
  { id: "usdt", name: "USDT", sub: "Tether · TRC-20", kind: "trc20", field: "TRC20 wallet address", placeholder: "TXk2…9fQa", image: "/methods/usdt.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "ltc", name: "Litecoin", sub: "LTC network", kind: "ltc", field: "Litecoin address", placeholder: "ltc1q…", image: "/methods/ltc.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "btc", name: "Bitcoin", sub: "BTC network", kind: "btc", field: "Bitcoin address", placeholder: "bc1q…", image: "/methods/btc.svg", enabled: true, minCents: 1000, feeCents: 50 },
  { id: "binance", name: "Binance Pay", sub: "Instant transfer", kind: "binance", field: "Binance Pay ID", placeholder: "354 120 987", image: "/methods/bnb.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "amazon", name: "Amazon Gift Card", sub: "US / UK store", kind: "email", field: "Email for the code", placeholder: "you@email.com", image: "/methods/amazon.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "paypal", name: "PayPal", sub: "USD balance", kind: "email", field: "PayPal email", placeholder: "you@email.com", image: "/methods/paypal.svg", enabled: false, minCents: 1000, feeCents: 0 },
];

/** One-click presets popular with US & UK GPT members. */
export const US_UK_PRESETS: PayMethod[] = [
  { id: "visa", name: "Visa Prepaid", sub: "Virtual US / UK card", kind: "email", field: "Email for the card", placeholder: "you@email.com", image: "/methods/visa.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "steam", name: "Steam Gift Card", sub: "Digital code", kind: "email", field: "Email for the code", placeholder: "you@email.com", image: "/methods/steam.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "apple", name: "Apple Gift Card", sub: "App Store & iTunes", kind: "email", field: "Email for the code", placeholder: "you@email.com", image: "/methods/applepay.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "googleplay", name: "Google Play", sub: "Digital code", kind: "email", field: "Email for the code", placeholder: "you@email.com", image: "/methods/googlepay.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "usdc-sol", name: "USDC (Solana)", sub: "Fast · low fee", kind: "sol", field: "Solana USDC address", placeholder: "7xKX…gAsU", image: "/methods/usdc.svg", enabled: true, minCents: 1000, feeCents: 0 },
  { id: "usdc-base", name: "USDC (Base / EVM)", sub: "0x address", kind: "evm", field: "Base / EVM address", placeholder: "0x71C…9A2f", image: "/methods/usdc.svg", enabled: true, minCents: 1000, feeCents: 0 },
];

export function methodName(methods: PayMethod[], id: string) {
  return methods.find((m) => m.id === id)?.name ?? id;
}

/** Only our own icons or a small inline image may be shown as a method icon. */
export function isSafeMethodImage(v: string) {
  if (/^\/methods\/[a-z0-9]+\.svg$/.test(v)) return true;
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= 140_000;
}
