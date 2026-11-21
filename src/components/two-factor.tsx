"use client";

import { useActionState } from "react";
import { FormMessage, Submit, type FormAction } from "./forms";

export function TwoFactorSetup({
  action,
  locale,
  qrSvg,
  secret,
  doneHref,
  labels,
}: {
  action: FormAction;
  locale: string;
  qrSvg: string;
  secret: string;
  doneHref: string;
  labels: Record<"scan" | "manual" | "enter" | "code" | "submit" | "saveCodes" | "done" | "on", string>;
}) {
  const [state, formAction] = useActionState(action, null);
  const codes = (state?.data?.codes as string[] | undefined) ?? null;
  if (codes) {
    return (
      <div className="card stack" style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 20 }}>{labels.on}</h2>
        <p className="small">{labels.saveCodes}</p>
        <div className="backup">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <a className="btn primary" href={doneHref}>
          {labels.done}
        </a>
      </div>
    );
  }
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="small">{labels.scan}</p>
      {/* SVG generated on our server from a fixed library; contains no user input except the encoded secret */}
      <div className="qrbox" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="small muted">{labels.manual}</div>
      <div className="code" style={{ fontSize: 15, letterSpacing: ".08em" }}>
        {secret.match(/.{1,4}/g)?.join(" ")}
      </div>
      <form action={formAction} className="stack" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <div className="field">
          <label htmlFor="tf-code">{labels.enter}</label>
          <input className="input num otp" id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" dir="ltr" />
        </div>
        <Submit className="btn primary block">{labels.submit}</Submit>
        <FormMessage state={state} />
      </form>
    </div>
  );
}

export function TwoFactorDisable({ action, locale, labels }: { action: FormAction; locale: string; labels: Record<"title" | "hint" | "code" | "submit" | "on", string> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <span className="pill good" style={{ alignSelf: "flex-start" }}>
        {labels.on}
      </span>
      <h2 style={{ fontSize: 18 }}>{labels.title}</h2>
      <form action={formAction} className="stack" noValidate>
        <input type="hidden" name="locale" value={locale} />
        <div className="field">
          <label htmlFor="tfo-code">{labels.hint}</label>
          <input className="input num otp" id="tfo-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} placeholder="123456" dir="ltr" />
        </div>
        <Submit className="btn bad">{labels.submit}</Submit>
        <FormMessage state={state} />
      </form>
    </div>
  );
}
