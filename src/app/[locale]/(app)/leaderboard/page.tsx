import type { Metadata } from "next";
import { pageLocale } from "../../locale";
import { currentUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { weeklyCoinsFor, weeklyLeaderboard, weekStartUtc } from "@/server/queries";
import { Coins, Icon } from "@/components/icons";
import { maskName } from "@/components/site-header";
import { formatUsd } from "@/lib/money";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { t } = await pageLocale(params);
  const [user, settings, top] = await Promise.all([currentUser(), getSettings(), weeklyLeaderboard(10)]);
  const mine = user ? await weeklyCoinsFor(user.id) : 0;
  const end = new Date(weekStartUtc().getTime() + 7 * 86_400_000);
  const hrs = Math.max(0, Math.round((end.getTime() - Date.now()) / 3_600_000));
  const pool = settings.prizesCents.reduce((a, b) => a + b, 0);
  const inTop = user ? top.some((r) => r.id === user.id) : false;
  return (
    <>
      <div className="pagehead">
        <div>
          <div className="eyebrow">{t("Weekly race · {v} prize pool", { v: formatUsd(pool) })}</div>
          <h1>{t("Leaderboard")}</h1>
        </div>
        <span className="pill accent">
          <Icon name="clock" />
          {t("Ends in {d}d {h}h", { d: Math.floor(hrs / 24), h: hrs % 24 })}
        </span>
      </div>
      {top.length ? (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>{t("Rank")}</th>
                <th>{t("Member")}</th>
                <th className="r">{t("Coins this week")}</th>
                <th className="r">{t("Prize")}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r, i) => (
                <tr key={r.id} style={user?.id === r.id ? { background: "var(--accent-soft)" } : undefined}>
                  <td className="num">#{i + 1}</td>
                  <td>
                    {maskName(r.name)} {user?.id === r.id ? t("(you)") : null} <span className="cc">{r.country}</span>
                  </td>
                  <td className="r">
                    <Coins n={r.coins} />
                  </td>
                  <td className="r num">{formatUsd(settings.prizesCents[i] ?? 0)}</td>
                </tr>
              ))}
              {user && !inTop ? (
                <tr style={{ background: "var(--accent-soft)" }}>
                  <td className="num">—</td>
                  <td>
                    <b>{t("You")}</b>
                  </td>
                  <td className="r">
                    <Coins n={mine} />
                  </td>
                  <td className="r small muted">{top.length >= 10 ? t("{c} to top 10", { c: Math.max(1, top[9]!.coins - mine + 1).toLocaleString("en-US") }) : "—"}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty">
          <Icon name="trophy" />
          <span>{t("The race just started. Complete an offer to take the first place.")}</span>
        </div>
      )}
      <p className="small muted">{t("Counts coins from offers, surveys and referral commission earned since Monday 00:00 UTC. Prizes are added to winners' balances after the week is checked.")}</p>
    </>
  );
}
