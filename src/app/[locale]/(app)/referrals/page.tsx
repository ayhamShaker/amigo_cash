import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { referralBreakdown } from "@/server/queries";
import { env } from "@/lib/env";
import { Coins, Icon } from "@/components/icons";
import { CopyButton } from "@/components/forms";
import { timeAgo } from "@/i18n/t";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { t } = await pageLocale(params);
  return { title: t("Referrals") };
}

export default async function ReferralsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale, t } = await pageLocale(params);
  const [user, settings] = await Promise.all([currentUser(), getSettings()]);
  const data = user ? await referralBreakdown(user.id) : { friends: [], total: 0 };
  const link = user ? `${env().APP_URL}/r/${user.refCode}` : "";
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{t("Invite friends")}</div>
          <h1>{t("Earn {p}% of everything they earn. For life.", { p: settings.referralPct })}</h1>
        </div>
      </div>
      {user ? (
        <div className="card stack">
          <div className="field">
            <label htmlFor="f-reflink">{t("Your invite link")}</label>
            <div className="row">
              <input className="input num" id="f-reflink" readOnly dir="ltr" value={link} />
              <CopyButton text={link} label={t("Copy")} done={t("Link copied")} />
            </div>
          </div>
          <div className="row wr small muted">
            {t("Code:")} <span className="cc" style={{ fontSize: 13 }}>{user.refCode}</span> · {t("Friends get {c} bonus coins when they join with it.", { c: settings.inviteBonus.toLocaleString("en-US") })}
          </div>
        </div>
      ) : (
        <div className="guestcard">
          <div className="grow">
            <h3 style={{ fontSize: 18 }}>{t("Your invite link")}</h3>
            <p className="small muted">{t("Sign up to get your personal invite link.")}</p>
          </div>
          <a className="btn primary" href={`/${locale}/signup`}>
            {t("Sign up free")}
          </a>
        </div>
      )}
      <div className="walletbar three">
        <div>
          <div className="s">{t("Friends joined")}</div>
          <div className="v">{data.friends.length}</div>
        </div>
        <div>
          <div className="s">{t("Earned from friends")}</div>
          <div className="v" dir="ltr">
            <span className="coin" aria-hidden="true">A</span>
            {data.total.toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <div className="s">{t("Your commission")}</div>
          <div className="v">{settings.referralPct}%</div>
        </div>
      </div>
      {user ? (
        <section className="stack">
          <h2 style={{ fontSize: 20 }}>{t("Your friends")}</h2>
          {data.friends.length ? (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>{t("Friend")}</th>
                    <th>{t("Joined")}</th>
                    <th className="r">{t("You got")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.friends.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <b>{f.name}</b>
                      </td>
                      <td className="small">{timeAgo(locale, f.createdAt)}</td>
                      <td className="r">
                        <Coins n={f.commission} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty">
              <Icon name="users" />
              <span>{t("No friends yet. Share your link on TikTok, Discord or with family.")}</span>
            </div>
          )}
          <p className="small muted">{t("Commission is paid on offers and surveys your friends complete. Signing up yourself through your own link, or inviting fake accounts, closes both accounts.")}</p>
        </section>
      ) : null}
    </>
  );
}
