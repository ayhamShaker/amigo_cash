import type { T } from "@/i18n/t";

export const LEVELS = [
  { n: "Bronze", at: 0 },
  { n: "Silver", at: 10_000 },
  { n: "Gold", at: 50_000 },
  { n: "Platinum", at: 150_000 },
  { n: "Diamond", at: 500_000 },
] as const;

export function levelOf(earned: number) {
  let i = 0;
  LEVELS.forEach((l, k) => {
    if (earned >= l.at) i = k;
  });
  return { ...LEVELS[i]!, i, next: LEVELS[i + 1] };
}

export function LevelCard({ earned, t }: { earned: number; t: T }) {
  const L = levelOf(earned);
  const pct = L.next ? Math.min(100, ((earned - L.at) / (L.next.at - L.at)) * 100) : 100;
  return (
    <>
      <div className="row between">
        <span className="small" style={{ fontWeight: 800 }}>
          {t("{lvl} level", { lvl: t(L.n) })}
        </span>
      </div>
      <div className="lvl" style={{ marginTop: 8 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="tiny muted" style={{ marginTop: 6 }}>
        {L.next ? t("{c} coins to {lvl}", { c: Math.max(0, L.next.at - earned).toLocaleString("en-US"), lvl: t(L.next.n) }) : t("Top level reached")}
      </div>
    </>
  );
}
