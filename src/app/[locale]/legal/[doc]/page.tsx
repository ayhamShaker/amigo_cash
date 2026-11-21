import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageLocale, themeCookie } from "../../locale";
import { SiteHeader } from "@/components/site-header";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "Legal" };

/**
 * Plain-language terms and privacy notice. The owner must have them reviewed by
 * a lawyer in the company's country before launch (see docs/LAUNCH_CHECKLIST.md).
 */
export default async function LegalPage({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, t } = await pageLocale(params);
  const { doc } = await params;
  if (doc !== "terms" && doc !== "privacy") notFound();
  const [theme, user, s] = await Promise.all([themeCookie(), currentUser(), getSettings()]);
  return (
    <>
      <SiteHeader locale={locale} t={t} theme={theme} signedIn={!!user} links={false} />
      <main className="wrap legal" lang="en" dir="ltr">
        {locale !== "en" ? <p className="note">{t("This page is available in English. The English version applies.")}</p> : null}
        {doc === "terms" ? (
          <>
            <h1>Terms of Use</h1>
            <p className="muted">Last updated: 21 November 2026</p>
            <h2>1. Who can join</h2>
            <p>You must be at least {s.minAge} years old and allowed to use reward sites where you live. One account per person and per device.</p>
            <h2>2. How rewards work</h2>
            <p>Advertisers pay us when you complete their offers. We credit you coins at the rate shown on each offer ({s.coinsPerUsd.toLocaleString("en-US")} coins = $1.00). Rewards of {formatUsd(s.holdThresholdCents)} or more are held for {s.holdDays} days while the advertiser checks the conversion. If an advertiser reverses a conversion, we remove the matching coins, including any referral commission.</p>
            <h2>3. Things that close an account</h2>
            <p>Using VPNs, proxies, emulators or bots; running more than one account; inviting yourself or fake accounts; giving false information to advertisers. We may withhold coins earned this way.</p>
            <h2>4. Withdrawals</h2>
            <p>You can withdraw once you reach the minimum for a payout method. We check first withdrawals by hand. You are responsible for entering a correct wallet address or email; payments sent to a wrong address you entered cannot be recovered.</p>
            <h2>5. Changes and closing</h2>
            <p>We may change rates, offers and these terms. Coins are not money and have no value outside Amigo Cash until withdrawn. You can close your account at any time from the live chat.</p>
            <h2>6. Contact</h2>
            <p>{s.supportEmail}</p>
          </>
        ) : (
          <>
            <h1>Privacy Notice</h1>
            <p className="muted">Last updated: 21 November 2026</p>
            <h2>What we collect</h2>
            <p>Your email, display name, country, password (stored only as an Argon2 hash), IP address, a device identifier cookie, the offers you start and complete, your withdrawals and your chat messages.</p>
            <h2>Why</h2>
            <p>To run your account, credit rewards, pay you, stop fraud (VPN and multi-account checks), answer support messages and meet legal duties.</p>
            <h2>Who we share it with</h2>
            <p>Offer partners receive your member ID (not your email) so they can confirm completions. Our email provider receives your email address to send messages. A fraud-check provider receives your IP address. We do not sell your data.</p>
            <h2>Cookies</h2>
            <p>We use only necessary cookies: sign-in session, language, theme, device identifier and invite code. No advertising trackers run on our pages; offer walls are third-party pages with their own policies.</p>
            <h2>Your rights</h2>
            <p>You can ask for a copy of your data, a correction or deletion through the live chat or {s.supportEmail}. UK and EU residents can complain to their data protection authority.</p>
            <h2>Keeping data</h2>
            <p>We keep financial records for as long as the law requires, and delete other data within 30 days after you close your account.</p>
          </>
        )}
      </main>
    </>
  );
}
