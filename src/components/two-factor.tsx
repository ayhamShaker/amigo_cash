"use client";

import { startTransition, useActionState } from "react";
import { FormMessage, Submit, type FormAction } from "./forms";

export function TwoFactorDisable({ action, locale, labels }: { action: FormAction; locale: string; labels: Record<"title" | "hint" | "code" | "submit" | "on", string> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <span className="pill good" style={{ alignSelf: "flex-start" }}>
        {labels.on}
      </span>
      <h2 style={{ fontSize: 18 }}>{labels.title}</h2>
      <form action={formAction} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => formAction(fd)); }} className="stack" noValidate>
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

/**
 * One component for both states. The server re-renders the page after the code
 * is confirmed; keeping a single component lets the "it worked" message (held in
 * client state) stay on screen instead of being replaced by the "turn off" form.
 */
export function TwoFactorPanel(props: {
  enabled: boolean;
  setupAction: FormAction;
  disableAction: FormAction;
  locale: string;
  qrSvg: string | null;
  secret: string | null;
  doneHref: string;
  setupLabels: Record<"scan" | "manual" | "enter" | "code" | "submit" | "tip" | "done" | "on", string>;
  disableLabels: Record<"title" | "hint" | "code" | "submit" | "on", string>;
  notStarted: string;
}) {
  const [setupState, setupFormAction] = useActionState(props.setupAction, null);
  if (setupState?.data?.done) {
    return (
      <div className="card stack" style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 20 }}>{props.setupLabels.on}</h2>
        <p className="small">{props.setupLabels.tip}</p>
        <a className="btn primary" href={props.doneHref}>
          {props.setupLabels.done}
        </a>
      </div>
    );
  }
  if (props.enabled) return <TwoFactorDisable action={props.disableAction} locale={props.locale} labels={props.disableLabels} />;
  if (!props.qrSvg || !props.secret) {
    return (
      <div className="card empty">
        <span>{props.notStarted}</span>
        <a className="btn primary" href={props.doneHref}>
          ←
        </a>
      </div>
    );
  }
  const { setupLabels: labels } = props;
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="small">{labels.scan}</p>
      {/* SVG generated on our server by the qrcode library from the otpauth URI */}
      <div className="qrbox" dangerouslySetInnerHTML={{ __html: props.qrSvg }} />
      <div className="small muted">{labels.manual}</div>
      <div className="code" style={{ fontSize: 15, letterSpacing: ".08em" }}>
        {props.secret.match(/.{1,4}/g)?.join(" ")}
      </div>
      <form
        action={setupFormAction}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => setupFormAction(fd));
        }}
        className="stack"
        noValidate
      >
        <input type="hidden" name="locale" value={props.locale} />
        <div className="field">
          <label htmlFor="tf-code">{labels.enter}</label>
          <input className="input num otp" id="tf-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" dir="ltr" />
        </div>
        <Submit className="btn primary block">{labels.submit}</Submit>
        <FormMessage state={setupState} />
      </form>
    </div>
  );
}
