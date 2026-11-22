"use client";

import { createContext, startTransition, useActionState, useContext, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";

export type FormState = { ok?: string; error?: string; data?: Record<string, unknown> } | null;
export type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Form that posts to a server action and shows its success or error message.
 * Messages come back already translated from the server.
 */
const PendingContext = createContext(false);

/**
 * Form that posts to a server action and shows its success or error message.
 * Messages come back already translated from the server. Unlike a bare
 * <form action>, typed values stay in place when the server reports an error;
 * with `resetOnOk` the fields clear after a success.
 */
export function ActionForm({
  action,
  children,
  className,
  locale,
  resetOnOk,
}: {
  action: FormAction;
  children?: ReactNode;
  className?: string;
  locale?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [key, setKey] = useState(0);
  const [lastOk, setLastOk] = useState<FormState>(null);
  if (resetOnOk && state?.ok && state !== lastOk) {
    setLastOk(state);
    setKey((k) => k + 1);
  }
  return (
    <PendingContext.Provider value={pending}>
      <form
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
        className={className}
        key={resetOnOk ? key : undefined}
        noValidate
      >
        {locale ? <input type="hidden" name="locale" value={locale} /> : null}
        {children}
        <FormMessage state={state} />
      </form>
    </PendingContext.Provider>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <div className={`formmsg ${state.error ? "bad" : "good"}`} role={state.error ? "alert" : "status"}>
      <Icon name={state.error ? "x" : "check"} />
      <span>{state.error ?? state.ok}</span>
    </div>
  );
}

export function Submit({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button className={className ?? "btn primary"} type="submit" disabled={pending || disabled} aria-busy={pending}>
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function PasswordInput({
  id,
  name,
  autoComplete,
  placeholder,
  labels,
}: {
  id: string;
  name: string;
  autoComplete: string;
  placeholder?: string;
  labels: { show: string; hide: string };
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw">
      <input className="input" id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} maxLength={128} autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" />
      <button type="button" className="pw-eye" onClick={() => setShow((s) => !s)} aria-label={show ? labels.hide : labels.show} aria-pressed={show}>
        <Icon name={show ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn primary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the text stays selectable in the field */
        }
      }}
    >
      <Icon name={copied ? "check" : "copy"} />
      {copied ? done : label}
    </button>
  );
}
