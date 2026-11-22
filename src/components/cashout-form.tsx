"use client";

import { useState } from "react";
import { ActionForm, Submit, type FormAction } from "./forms";
import { Icon } from "./icons";

type Method = { id: string; name: string; short: string; color: string; field: string; placeholder: string; enabled: boolean; minCents: number; feeCents: number };

function usd(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function CashoutForm({
  action,
  locale,
  methods,
  balanceCoins,
  coinsPerUsd,
  defaultEmail,
  labels,
}: {
  action: FormAction;
  locale: string;
  methods: Method[];
  balanceCoins: number;
  coinsPerUsd: number;
  defaultEmail: string;
  labels: Record<"choose" | "amount" | "summary" | "deducted" | "fee" | "receive" | "min" | "feeShort" | "soon" | "needMore" | "withdrawTo" | "custom", string>;
}) {
  const first = methods.find((m) => m.enabled) ?? methods[0]!;
  const [methodId, setMethodId] = useState(first.id);
  const m = methods.find((x) => x.id === methodId) ?? first;
  const presets = [...new Set([m.minCents, 500, 1000, 2500, 5000].filter((c) => c >= m.minCents))].sort((a, b) => a - b).slice(0, 5);
  const [amount, setAmount] = useState(presets[0]!);
  const [custom, setCustom] = useState("");
  const cents = custom ? Math.round(Number(custom.replace(",", ".")) * 100) || 0 : amount;
  const coins = Math.round((cents * coinsPerUsd) / 100);
  const short = coins > balanceCoins ? coins - balanceCoins : 0;
  const isEmailField = m.id === "amazon" || m.id === "paypal";

  return (
    <div className="split">
      <ActionForm action={action} locale={locale} className="stack" resetOnOk>
        <input type="hidden" name="method" value={m.id} />
        <input type="hidden" name="amount" value={(cents / 100).toFixed(2)} />
        <div className="eyebrow">1 · {labels.choose}</div>
        <div className="methodpick" role="radiogroup" aria-label={labels.choose}>
          {methods.map((x) => (
            <button
              type="button"
              key={x.id}
              role="radio"
              aria-checked={x.id === m.id}
              className={`mp ${x.id === m.id ? "on" : ""}`}
              disabled={!x.enabled}
              onClick={() => {
                setMethodId(x.id);
                setAmount(Math.max(x.minCents, 0));
                setCustom("");
              }}
            >
              <span className="mlogo" style={{ background: x.color }}>
                {x.short}
              </span>
              <span>
                <b>{x.name}</b>
                <br />
                <span className="tiny muted">{x.enabled ? `${labels.min} ${usd(x.minCents)}${x.feeCents ? ` · ${labels.feeShort} ${usd(x.feeCents)}` : ""}` : labels.soon}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="eyebrow" style={{ marginTop: 8 }}>
          2 · {labels.amount}
        </div>
        <div className="amtpick">
          {presets.map((p) => (
            <button
              type="button"
              key={p}
              className={!custom && amount === p ? "on" : ""}
              onClick={() => {
                setAmount(p);
                setCustom("");
              }}
            >
              {usd(p).replace(".00", "")}
            </button>
          ))}
          <input
            className="input num"
            style={{ width: 120 }}
            inputMode="decimal"
            placeholder={labels.custom}
            aria-label={labels.custom}
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 8))}
            dir="ltr"
          />
        </div>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="f-addr">3 · {m.field}</label>
          <input key={m.id} className="input" id="f-addr" name="address" placeholder={m.placeholder} dir="ltr" style={{ fontFamily: "var(--f-mono)" }} defaultValue={isEmailField ? defaultEmail : ""} maxLength={120} autoComplete="off" />
        </div>
        <Submit className="btn primary lg" disabled={short > 0 || cents < m.minCents}>
          {short > 0 ? labels.needMore.replace("{c}", short.toLocaleString("en-US")) : labels.withdrawTo.replace("{v}", usd(Math.max(0, cents - m.feeCents))).replace("{m}", m.name)}
        </Submit>
      </ActionForm>
      <aside className="card stack">
        <h3 style={{ fontSize: 17 }}>{labels.summary}</h3>
        <div className="row between small">
          <span className="muted">{labels.deducted}</span>
          <span className="amt" dir="ltr">
            <span className="coin">A</span>
            {coins.toLocaleString("en-US")}
          </span>
        </div>
        <div className="row between small">
          <span className="muted">{labels.fee}</span>
          <span className="num">{usd(m.feeCents)}</span>
        </div>
        <div className="row between">
          <b>{labels.receive}</b>
          <b className="num">{usd(Math.max(0, cents - m.feeCents))}</b>
        </div>
        <Icon name="shield" className="muted" />
      </aside>
    </div>
  );
}
