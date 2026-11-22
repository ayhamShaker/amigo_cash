/** Display data for payout methods (shared by server and client code). */
export const METHOD_META = {
  usdt: { name: "USDT", sub: "Tether · TRC20", field: "TRC20 wallet address", placeholder: "TXk2…9fQa", color: "#1B9C75", short: "USDT" },
  ltc: { name: "Litecoin", sub: "LTC network", field: "Litecoin address", placeholder: "ltc1q…", color: "#345D9D", short: "LTC" },
  btc: { name: "Bitcoin", sub: "BTC network", field: "Bitcoin address", placeholder: "bc1q…", color: "#E8870E", short: "BTC" },
  binance: { name: "Binance Pay", sub: "Instant transfer", field: "Binance Pay ID", placeholder: "354 120 987", color: "#C99A06", short: "PAY" },
  amazon: { name: "Amazon Gift Card", sub: "US / UK store", field: "Email for the code", placeholder: "you@email.com", color: "#232F3E", short: "GIFT" },
  paypal: { name: "PayPal", sub: "USD balance", field: "PayPal email", placeholder: "you@email.com", color: "#1D4ED8", short: "PP" },
} as const;

export type MethodKey = keyof typeof METHOD_META;
export const METHOD_KEYS = Object.keys(METHOD_META) as MethodKey[];
