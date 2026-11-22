"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

type Msg = { id: string; sender: "USER" | "ADMIN" | "BOT" | "SYSTEM"; authorName: string | null; body: string; emailed: boolean; createdAt: string };

export type ChatLabels = {
  open: string;
  title: string;
  online: string;
  close: string;
  greeting: string;
  support: string;
  name: string;
  email: string;
  why: string;
  start: string;
  placeholder: string;
  send: string;
  emailed: string;
  error: string;
  nameError: string;
  emailError: string;
};

/**
 * Floating live-support chat. Polls every 4 s while open and every 25 s while
 * closed (for the unread badge). Messages are rendered as text, never HTML.
 */
export function ChatWidget({ locale, signedIn, labels, startOpen }: { locale: string; signedIn: boolean; labels: ChatLabels; startOpen?: boolean }) {
  const [open, setOpen] = useState(!!startOpen);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [started, setStarted] = useState(signedIn);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const lastAt = useRef<string | null>(null);
  const body = useRef<HTMLDivElement>(null);

  const poll = useCallback(
    async (isOpen: boolean) => {
      try {
        const q = new URLSearchParams({ open: isOpen ? "1" : "0" });
        if (lastAt.current) q.set("after", lastAt.current);
        const res = await fetch(`/api/chat?${q}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { messages: Msg[]; unread: number; started: boolean };
        setStarted(j.started); // follows sign-in / sign-out without a full page reload
        if (j.messages.length) {
          lastAt.current = j.messages[j.messages.length - 1]!.createdAt;
          setMsgs((m) => {
            const seen = new Set(m.map((x) => x.id));
            return [...m, ...j.messages.filter((x) => !seen.has(x.id))];
          });
        }
        setUnread(isOpen ? 0 : j.unread);
      } catch {
        /* offline: try again on the next tick */
      }
    },
    [],
  );

  useEffect(() => {
    // links in support emails open the chat straight away (?chat=1)
    const id = setTimeout(() => {
      if (new URLSearchParams(window.location.search).get("chat") === "1") setOpen(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void poll(open), 0);
    const id = setInterval(() => {
      if (!document.hidden) void poll(open);
    }, open ? 4000 : 25000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, poll]);

  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [msgs, open]);

  async function post(payload: Record<string, string>) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, locale }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error === "email" ? labels.emailError : labels.error);
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="chatfab" onClick={() => setOpen(true)} aria-label={labels.open}>
        <Icon name="chat" />
        {unread > 0 ? <span className="chatbadge">{unread}</span> : null}
      </button>
    );
  }

  return (
    <div className="chatpanel" role="dialog" aria-label={labels.title}>
      <div className="chathead">
        <div className="row" style={{ gap: 10 }}>
          <span className="chatav">
            <Icon name="chat" />
          </span>
          <div>
            <b>{labels.title}</b>
            <div className="tiny">
              <i className="dot" />
              {labels.online}
            </div>
          </div>
        </div>
        <button className="iconbtn" onClick={() => setOpen(false)} aria-label={labels.close}>
          <Icon name="x" />
        </button>
      </div>
      <div className="chatbody" ref={body} aria-live="polite">
        <div className="msg them">
          <span className="who">{labels.support}</span>
          {labels.greeting}
        </div>
        {msgs.map((m) =>
          m.sender === "USER" ? (
            <div key={m.id} className="msg me" dir="auto">
              {m.body}
            </div>
          ) : m.sender === "SYSTEM" ? (
            <div key={m.id} className="msg sys">
              {m.body}
            </div>
          ) : (
            <div key={m.id} className="msg them" dir="auto">
              <span className="who">{m.sender === "ADMIN" && m.authorName ? `${m.authorName} · ${labels.support}` : labels.support}</span>
              {m.body}
              {m.emailed ? <span className="ts">✉ {labels.emailed}</span> : null}
            </div>
          ),
        )}
        {!started ? (
          <form
            className="chatintro stack"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const name = String(f.get("name") ?? "").trim();
              const email = String(f.get("email") ?? "").trim();
              if (name.length < 2) return setErr(labels.nameError);
              if (!/^\S+@\S+\.\S+$/.test(email)) return setErr(labels.emailError);
              if (await post({ type: "start", name, email })) setStarted(true);
            }}
          >
            <div className="field">
              <label htmlFor="ch-name">{labels.name}</label>
              <input className="input" id="ch-name" name="name" maxLength={40} autoComplete="name" />
            </div>
            <div className="field">
              <label htmlFor="ch-email">{labels.email}</label>
              <input className="input" id="ch-email" name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </div>
            <div className="tiny muted">{labels.why}</div>
            <button className="btn primary block" type="submit" disabled={busy}>
              {labels.start}
            </button>
          </form>
        ) : null}
        {err ? (
          <div className="msg sys" role="alert" style={{ color: "var(--bad)" }}>
            {err}
          </div>
        ) : null}
      </div>
      {started ? (
        <form
          className="chatfoot"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = text.trim();
            if (!v || busy) return;
            if (await post({ type: "message", body: v })) {
              setText("");
              await poll(true);
            }
          }}
        >
          <textarea
            className="input"
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.placeholder}
          />
          <button className="btn primary" type="submit" disabled={busy || !text.trim()}>
            {labels.send}
          </button>
        </form>
      ) : null}
    </div>
  );
}
