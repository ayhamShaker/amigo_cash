import type { T } from "@/i18n/t";
import type { SiteSettings } from "@/server/settings";
import { formatUsd } from "@/lib/money";

export function FaqList({ t, settings }: { t: T; settings: SiteSettings }) {
  const items: [string, string][] = [
    ["Is Amigo Cash free?", t("Yes. You never pay to join or to cash out. Advertisers pay us when you try their game or app, and we pass most of that payment to you.")],
    ["Can I look around before signing up?", t("Yes. Browse every offer, survey and payout option first. You only need an account to start a task or cash out.")],
    ["How much are coins worth?", t("{c} coins are worth $1.00. Every offer shows its reward in coins and in dollars.", { c: settings.coinsPerUsd.toLocaleString("en-US") })],
    ["Why is some of my reward pending?", t("Rewards of {v} or more are held for {d} days while the advertiser checks the conversion. After that they move to your balance automatically.", { v: formatUsd(settings.holdThresholdCents), d: settings.holdDays })],
    ["Can I use a VPN?", t("No. Offer partners reject traffic from VPNs and proxies, so we pause earning on those connections to protect your account.")],
    ["How fast are payouts?", t("Your first withdrawal is reviewed by our team, normally within 24 hours. After that, small withdrawals are approved straight away and usually sent within a few hours.")],
  ];
  return (
    <>
      {items.map(([q, a]) => (
        <details key={q}>
          <summary>{t(q)}</summary>
          <p>{a}</p>
        </details>
      ))}
    </>
  );
}
