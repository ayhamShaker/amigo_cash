import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageLocale, themeCookie } from "../../locale";
import { SiteHeader } from "@/components/site-header";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { formatUsd } from "@/lib/money";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; doc: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  const { doc } = await params;
  return { title: doc === "privacy" ? t("Privacy") : t("Terms") };
}

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
            <h1>Privacy Policy</h1>
            <p className="muted">Last updated: 26 November 2026</p>
            <p>
              This Privacy Policy explains how <strong>Amigo Cash</strong> (<code>https://amigo-cash.com</code>, operated by Ayham Shaker) collects, uses, shares, and protects your personal information when you visit or use our website and rewards services, including your data protection rights under the EU/UK General Data Protection Regulation (<strong>GDPR</strong> / <strong>UK GDPR</strong>) and the California Consumer Privacy Act as amended by the California Privacy Rights Act (<strong>CCPA / CPRA</strong>).
            </p>

            <h2>1. Data Controller &amp; Contact</h2>
            <p>
              The data controller responsible for your personal data on Amigo Cash is Amigo Cash (Ayham Shaker). For any privacy questions or to exercise your data protection rights, contact us at{" "}
              <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> or through the live support chat on our site.
            </p>

            <h2>2. Categories of Personal Information We Collect</h2>
            <ul>
              <li><strong>Account &amp; Identifiers:</strong> email address, display name, country, password (stored exclusively as a one-way Argon2 hash), optional Google OAuth identifier, and email verification timestamps.</li>
              <li><strong>Technical, Device &amp; Anti-Fraud Data:</strong> IP address, country/region headers, browser and device type (Android/iOS/Desktop), a first-party device identifier cookie, Cloudflare Turnstile verification signals, and VPN/proxy/multi-account risk checks.</li>
              <li><strong>Activity &amp; Transaction Data:</strong> offers and surveys started or completed, partner postback transaction IDs, coin ledger entries, referral/creator attribution, and withdrawal requests (including the payout email or crypto wallet address you provide).</li>
              <li><strong>Support Communications:</strong> messages you submit via live chat or email.</li>
              <li><strong>Aggregated Usage Analytics:</strong> privacy-friendly, non-invasive traffic statistics (page views, country, device category, and referrer source) via Vercel Web Analytics and first-party aggregated counts.</li>
            </ul>

            <h2>3. How We Use Your Data &amp; Legal Bases (GDPR Article 6)</h2>
            <p>If you are in the European Economic Area (EEA), the United Kingdom, or Switzerland, we process personal data only when we have a valid legal basis under GDPR Article 6:</p>
            <ul>
              <li><strong>Performance of a Contract (Art. 6(1)(b)):</strong> creating and managing your account, crediting rewards for completed offers/surveys, processing withdrawals, and answering support requests.</li>
              <li><strong>Legitimate Interests (Art. 6(1)(f)):</strong> preventing fraud, VPN/proxy abuse, bots, chargebacks, and duplicate accounts; protecting platform security; and measuring aggregated site and marketing performance.</li>
              <li><strong>Legal Obligation (Art. 6(1)(c)):</strong> retaining financial/payout records and complying with applicable tax, accounting, anti-fraud, and data protection laws.</li>
              <li><strong>Consent (Art. 6(1)(a)):</strong> where required by law for optional cookies, communications, or third-party survey/offerwall participation. You may withdraw your consent at any time.</li>
            </ul>

            <h2>4. Sharing Data &amp; Third-Party Offer / Survey Partners</h2>
            <p>
              We do <strong>not</strong> sell your personal information for money, and we do <strong>not</strong> share your personal information for cross-context behavioral advertising. We share limited data only with:
            </p>
            <ul>
              <li><strong>Offerwall &amp; Survey Partners</strong> (such as TheoremReach, AdGem, and other enabled reward partners): when you open an offerwall or survey wall, we pass your pseudonymous Amigo Cash member ID (not your email address or password) so the partner can confirm completed surveys or offers back to your account. Any survey answers or profile details you enter directly inside a partner wall are governed by that partner&apos;s own privacy policy as an independent data controller.</li>
              <li><strong>Service Providers (Data Processors):</strong> cloud hosting and security infrastructure (Vercel, Cloudflare including Turnstile), transactional email delivery (Resend), database hosting, and IP/VPN fraud-detection services, all bound by confidentiality and data-protection obligations.</li>
              <li><strong>Legal &amp; Safety Disclosures:</strong> where required by law, court order, or to protect our users and prevent fraud.</li>
            </ul>

            <h2>5. International Data Transfers</h2>
            <p>
              Because our hosting, email, security, and survey/offerwall partners operate globally (including in the United States and the EEA), your personal data may be transferred outside your country of residence. Where required under GDPR/UK GDPR, such transfers rely on Standard Contractual Clauses (SCCs) or equivalent legally recognized transfer safeguards.
            </p>

            <h2>6. Cookies &amp; Similar Technologies</h2>
            <p>
              We use strictly necessary first-party cookies for sign-in sessions, language preference, dark/light theme, device fraud protection, and referral attribution. We do not place third-party advertising cookies on our own pages. Third-party offerwalls and survey walls loaded inside iframes may use their own cookies in accordance with their respective privacy and cookie policies.
            </p>

            <h2>7. Data Retention</h2>
            <p>
              We retain your account and activity data while your account remains active. When you request account closure or deletion, we delete or anonymize your personal data within <strong>30 days</strong>, except for financial payout records, chargeback logs, and fraud-prevention records that we are legally required to retain (typically up to 5–7 years where mandated by accounting or anti-fraud obligations).
            </p>

            <h2>8. Your Data Protection Rights (GDPR &amp; UK GDPR)</h2>
            <p>If you reside in the EEA, the UK, or Switzerland, you have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Right of Access (Art. 15):</strong> request confirmation of whether we process your data and obtain a copy of it.</li>
              <li><strong>Right to Rectification (Art. 16):</strong> request correction of inaccurate or incomplete personal data.</li>
              <li><strong>Right to Erasure / &ldquo;Right to be Forgotten&rdquo; (Art. 17):</strong> request deletion of your personal data when it is no longer necessary or where no overriding legal basis applies.</li>
              <li><strong>Right to Restriction of Processing (Art. 18):</strong> request that we limit how we process your personal data in specific circumstances.</li>
              <li><strong>Right to Data Portability (Art. 20):</strong> receive the personal data you provided to us in a structured, commonly used, machine-readable format (JSON/CSV).</li>
              <li><strong>Right to Object (Art. 21):</strong> object to processing carried out on the basis of legitimate interests.</li>
              <li><strong>Right to Withdraw Consent (Art. 7(3)):</strong> withdraw consent at any time where processing is based on consent, without affecting the lawfulness of prior processing.</li>
              <li><strong>Right to Lodge a Complaint:</strong> lodge a complaint with your local EU Data Protection Authority (DPA) or, in the UK, the Information Commissioner&apos;s Office (ICO).</li>
            </ul>
            <p>We will verify and respond to GDPR / UK GDPR requests within <strong>30 days</strong> (1 month) at no charge.</p>

            <h2>9. Your California Privacy Rights (CCPA / CPRA)</h2>
            <p>If you are a California resident, the CCPA/CPRA grants you the following rights:</p>
            <ul>
              <li><strong>Right to Know &amp; Access:</strong> request disclosure of the categories and specific pieces of personal information we collected about you in the past 12 months, the sources of that information, our business purposes for collecting it, and the categories of third parties with whom it was disclosed.</li>
              <li><strong>Right to Delete:</strong> request deletion of personal information we collected from you, subject to statutory exceptions (such as security, fraud prevention, and legal compliance).</li>
              <li><strong>Right to Correct:</strong> request correction of inaccurate personal information we maintain about you.</li>
              <li><strong>Right to Opt Out of Sale or Sharing:</strong> Amigo Cash does <strong>not</strong> sell your personal information and does <strong>not</strong> share it for cross-context behavioral advertising. Accordingly, there is no sale or sharing to opt out of; if our practices ever change, we will update this policy and provide a prominent &ldquo;Do Not Sell or Share My Personal Information&rdquo; opt-out link.</li>
              <li><strong>Right to Limit Use of Sensitive Personal Information:</strong> we do not collect or use sensitive personal information for purposes other than delivering our requested services, securing accounts, and preventing fraud.</li>
              <li><strong>Right to Non-Discrimination:</strong> we will never discriminate against you—such as denying services, reducing coin reward rates, or lowering service quality—for exercising any CCPA/CPRA right.</li>
            </ul>
            <p>
              You (or an authorized agent acting on your behalf with written authorization) may submit a verifiable California consumer request by emailing{" "}
              <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>. We will verify your identity via your registered email address and respond within <strong>45 days</strong>.
            </p>

            <h2>10. Children&apos;s Privacy</h2>
            <p>
              Amigo Cash is strictly intended for individuals aged <strong>{s.minAge} or older</strong>. We do not knowingly collect personal information from children under 16 (or under 13 where applicable under COPPA). If you believe a minor has provided personal data to us, please contact{" "}
              <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> and we will delete it immediately.
            </p>

            <h2>11. Data Security</h2>
            <p>
              We protect personal data using industry-standard technical and organizational safeguards, including HTTPS/TLS encryption in transit, Argon2 password hashing, encrypted partner secrets, strict Content Security Policy headers, and manual review of withdrawals.
            </p>

            <h2>12. How to Exercise Your Rights &amp; Policy Updates</h2>
            <p>
              To submit an access, portability, correction, objection, or deletion request under GDPR, UK GDPR, or CCPA/CPRA, email{" "}
              <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a> with the subject line <strong>&ldquo;Privacy Request&rdquo;</strong> from your registered email address, or message us via the live chat while signed in. We may update this Privacy Policy from time to time and will post any revisions on this page with an updated effective date.
            </p>
          </>
        )}
      </main>
    </>
  );
}
