import type { T } from "@/i18n/t";

export const LEVELS = [
  { n: "Bronze", at: 0, boostPct: 0 },
  { n: "Silver", at: 10_000, boostPct: 1 },
  { n: "Gold", at: 50_000, boostPct: 2 },
  { n: "Platinum", at: 150_000, boostPct: 3 },
  { n: "Diamond", at: 500_000, boostPct: 5 },
] as const;

export function levelOf(earned: number) {
  let i = 0;
  LEVELS.forEach((l, k) => {
    if (earned >= l.at) i = k;
  });
  return { ...LEVELS[i]!, i, next: LEVELS[i + 1] };
}

/** Profit-safe earning boost (%) for a member's level on offers & surveys. */
export function levelBoostPct(earned: number, enabled = true): number {
  if (!enabled) return 0;
  return levelOf(earned).boostPct;
}

export function LevelCard({ earned, t, boostEnabled = true }: { earned: number; t: T; boostEnabled?: boolean }) {
  const L = levelOf(earned);
  const pct = L.next ? Math.min(100, ((earned - L.at) / (L.next.at - L.at)) * 100) : 100;
  return (
    <>
      <div className="row between wr">
        <span className="small" style={{ fontWeight: 800 }}>
          {t("{lvl} level", { lvl: t(L.n) })}
        </span>
        {boostEnabled && L.boostPct > 0 ? <span className="pill good">+{L.boostPct}%</span> : null}
      </div>
      <div className="lvl" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {L.next
          ? boostEnabled
            ? t("{c} coins to {lvl} (+{b}% on offers)", { c: Math.max(0, L.next.at - earned).toLocaleString("en-US"), lvl: t(L.next.n), b: L.next.boostPct })
            : t("{c} coins to {lvl}", { c: Math.max(0, L.next.at - earned).toLocaleString("en-US"), lvl: t(L.next.n) })
          : t("Top level reached")}
      </div>
    </>
  );
}
