import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { db } from "@/lib/db";
import { METHOD_KEYS, METHOD_META } from "@/lib/methods";
import { CashoutForm } from "@/components/cashout-form";
import { withdrawAction } from "@/app/actions/member";
import { Coins, Icon } from "@/components/icons";
import { GuestCard } from "@/components/member";
import { coinsToCents, formatUsd } from "@/lib/money";
import { timeAgo, translateData } from "@/i18n/t";

export const metadata: Metadata = { title: "Cash out" };

export default async function CashoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [user, settings] = await Promise.all([currentUser(), getSettings()]);
  const mine = user ? await db.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
  const methods = METHOD_KEYS.map((id) => ({
    id,
    name: id === "amazon" ? t("Amazon Gift Card") : METHOD_META[id].name,
    short: METHOD_META[id].short,
    color: METHOD_META[id].color,
    field: t(METHOD_META[id].field),
    placeholder: METHOD_META[id].placeholder,
    ...settings.methods[id],
  }));
  const pill = (s: string) =>
    s === "PAID" ? <span className="pill good">{t("Sent")}</span> : s === "REJECTED" ? <span className="pill bad">{t("Rejected · refunded")}</span> : s === "APPROVED" ? <span className="pill info">{t("Approved")}</span> : <span className="pill warn">{t("Processing")}</span>;

  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{t("{c} coins = $1.00", { c: settings.coinsPerUsd.toLocaleString("en-US") })}</div>
          <h1>{t("Cash out")}</h1>
        </div>
        {user ? (
          <div className="balance-chip" style={{ paddingInline: 14 }}>
            <span className="small muted">{t("Available")}</span>
            <Coins n={user.balance} />
            <span className="small muted">{formatUsd(coinsToCents(Math.max(0, user.balance), settings.coinsPerUsd))}</span>
          </div>
        ) : null}
      </div>
      {!user ? <GuestCard locale={locale} t={t} /> : null}
      {user && !user.emailVerifiedAt && settings.requireVerifiedEmailToWithdraw ? (
        <div className="formmsg bad">
          <Icon name="mail" />
          <span>
            {t("Confirm your email address before your first withdrawal. Check your inbox for the link.")} <a href={`/${locale}/account`}>{t("Account")}</a>
          </span>
        </div>
      ) : null}
      {user ? (
        <CashoutForm
          action={withdrawAction}
          locale={locale}
          methods={methods}
          balanceCoins={user.balance}
          coinsPerUsd={settings.coinsPerUsd}
          needsOtp={user.totpEnabled}
          defaultEmail={user.email}
          labels={{
            choose: t("Choose a method"),
            amount: t("Amount"),
            summary: t("Summary"),
            deducted: t("Coins deducted"),
            fee: t("Network fee"),
            receive: t("You receive"),
            min: t("Min"),
            feeShort: t("fee"),
            soon: t("Coming soon"),
            otp: t("Authenticator code"),
            needMore: t("You need {c} more coins"),
            withdrawTo: t("Withdraw {v} to {m}"),
            custom: t("Other amount"),
          }}
        />
      ) : (
        <div className="methods">
          {methods.map((m) => (
            <div className="method" key={m.id} style={m.enabled ? undefined : { opacity: 0.55 }}>
              <span className="mlogo" style={{ background: m.color }}>
                {m.short}
              </span>
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{m.name}</div>
                <div className="small muted">{m.enabled ? t("From {v}", { v: formatUsd(m.minCents) }) : t("Coming soon")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="small muted">
        {settings.firstWithdrawalManual
          ? t("Your first withdrawal is checked by our team, usually within 24 hours. After that, small withdrawals are approved straight away.")
          : t("Withdrawals up to {v} are approved straight away.", { v: formatUsd(settings.autoApproveUnderCents) })}
      </p>
      {user ? (
        <section className="stack">
          <h2 style={{ fontSize: 20 }}>{t("Your withdrawals")}</h2>
          {mine.length ? (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Date")}</th>
                    <th>{t("Method")}</th>
                    <th className="r">{t("Amount")}</th>
                    <th>{t("Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((w) => (
                    <tr key={w.id}>
                      <td className="small">{timeAgo(locale, w.createdAt)}</td>
                      <td>
                        {w.method === "amazon" ? t("Amazon Gift Card") : (METHOD_META[w.method as keyof typeof METHOD_META]?.name ?? w.method)}
                        <div className="tiny muted num" dir="ltr">
                          {w.address.length > 18 ? `${w.address.slice(0, 8)}…${w.address.slice(-6)}` : w.address}
                        </div>
                      </td>
                      <td className="r num">{formatUsd(w.amountCents)}</td>
                      <td>
                        {pill(w.status)}
                        {w.note ? <div className="tiny muted">{translateData(locale, w.note)}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty">
              <Icon name="wallet" />
              <span>{t("No withdrawals yet. Your first one is a few offers away.")}</span>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
