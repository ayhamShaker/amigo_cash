import { formatUsd } from "@/lib/money";

export function Usd({ cents }: { cents: number }) {
  return (
    <span className="num" dir="ltr">
      {formatUsd(cents)}
    </span>
  );
}

export function Num({ n }: { n: number }) {
  return (
    <span className="num" dir="ltr">
      {Math.round(n).toLocaleString("en-US")}
    </span>
  );
}

export function Risk({ score }: { score: number }) {
  const c = score > 75 ? "var(--bad)" : score > 45 ? "var(--warn)" : "var(--good)";
  return (
    <span className="risk" dir="ltr">
      <i>
        <b style={{ width: `${Math.min(100, score)}%`, background: c }} />
      </i>
      {score}
    </span>
  );
}

export function agoAr(d: Date, now = Date.now()) {
  const s = Math.max(1, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return `قبل ${s} ث`;
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.round(h / 24)} يوم`;
}

export const WITHDRAWAL_STATUS_AR: Record<string, [string, string]> = {
  PENDING: ["قيد المراجعة", "warn"],
  APPROVED: ["جاهز للدفع", "info"],
  PAID: ["مدفوع", "good"],
  REJECTED: ["مرفوض", "bad"],
};

/** Line chart drawn on the server. Values in cents. */
export function LineChart({ days, series }: { days: string[]; series: { color: string; values: number[]; fill?: boolean }[] }) {
  const W = 640;
  const H = 220;
  const P = { l: 52, r: 12, t: 12, b: 26 };
  const max = Math.max(100, ...series.flatMap((s) => s.values));
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const n = Math.max(2, days.length);
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (n - 1);
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / top);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return (
    <div style={{ overflowX: "auto", direction: "ltr" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 480, height: "auto", display: "block" }} role="img" aria-label="رسم بياني يومي">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={P.l - 8} y={y(v) + 4} textAnchor="end">
              ${Math.round(v / 100).toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          (i % 7 === 0 && n - 1 - i > 3) || i === n - 1 ? (
            <text key={d} x={x(i)} y={H - 6} textAnchor="middle">
              {d}
            </text>
          ) : null,
        )}
        {series.map((s, j) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          return (
            <g key={j}>
              {s.fill ? <path d={`M${pts[0]} L${pts.join(" L")} L${x(n - 1)},${y(0)} L${x(0)},${y(0)}Z`} fill={s.color} opacity=".12" /> : null}
              <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" />
              <circle cx={x(n - 1)} cy={y(s.values[s.values.length - 1] ?? 0)} r="4" fill={s.color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
