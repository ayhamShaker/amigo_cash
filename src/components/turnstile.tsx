"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; theme?: "auto" | "light" | "dark" }) => string;
      remove?: (id: string) => void;
    };
  }
}

/**
 * Renders the Cloudflare Turnstile widget when a site key is configured.
 * Injects the hidden `cf-turnstile-response` input inside the enclosing form.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | null = null;
    const render = () => {
      if (!ref.current || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(ref.current, { sitekey: siteKey, theme: "auto" });
    };
    if (window.turnstile) {
      render();
    } else {
      let script = document.querySelector<HTMLScriptElement>('script[data-turnstile="1"]');
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.turnstile = "1";
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
      return () => {
        script?.removeEventListener("load", render);
        if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
      };
    }
    return () => {
      if (widgetId && window.turnstile?.remove) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  return <div ref={ref} style={{ minHeight: 65 }} />;
}
