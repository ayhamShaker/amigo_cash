import type { T } from "@/i18n/t";
import { Coins } from "./icons";
import { formatUsd } from "@/lib/money";

export const CATEGORY_LABEL: Record<string, string> = { game: "Game", app: "App", signup: "Sign-up", finance: "Finance", trial: "Free trial" };

export function OfferCard({
  href,
  title,
  color,
  category,
  networkName,
  steps,
  coins,
  usdCents,
  progress,
  t,
}: {
  href: string;
  title: string;
  color: string;
  category: string;
  networkName: string;
  steps: number;
  coins: number;
  usdCents: number;
  progress?: boolean;
  t: T;
}) {
  const initials = title
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2);
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0284C7";
  return (
    <a className="offer" href={href}>
      <div className="offer-top">
        <span className="appicon" style={{ background: `linear-gradient(150deg, ${safeColor}, color-mix(in srgb, ${safeColor} 70%, #000))` }}>
          {initials}
        </span>
        <span className="grow">
          <h4>{title}</h4>
          <span className="tiny muted">
            {t(CATEGORY_LABEL[category] ?? "Game")} · {networkName}
          </span>
        </span>
      </div>
      <span className="small muted">{t(steps === 1 ? "{n} step" : "{n} steps", { n: steps })}</span>
      <div className="offer-foot">
        <span className="stack" style={{ gap: 0 }}>
          <Coins n={coins} />
          <span className="tiny muted">≈ {formatUsd(usdCents)}</span>
        </span>
        {progress ? <span className="pill info">{t("In progress")}</span> : <span className="go">{t("Start")}</span>}
      </div>
    </a>
  );
}
